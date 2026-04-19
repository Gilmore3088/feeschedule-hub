"""Run the full crawl pipeline: download -> extract -> store.

For each institution with a fee_schedule_url:
1. Download the document (PDF or HTML)
2. Check content hash for changes (skip if unchanged)
3. Extract text (pdfplumber for PDFs, BeautifulSoup for HTML)
4. Send to Claude for structured fee extraction
5. Store results in crawl_results and extracted_fees tables

Supports concurrent crawling via --workers flag.
"""

import json
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

from fee_crawler.config import Config
from fee_crawler.db import Database, get_worker_db
from fee_crawler.fee_analysis import normalize_fee_name, get_fee_family
from fee_crawler.pipeline.download import download_document
from fee_crawler.pipeline.extract_html import extract_text_from_html
from fee_crawler.pipeline.extract_llm import extract_fees_with_llm
from fee_crawler.pipeline import extract_kreuzberg
from fee_crawler.pipeline.extract_pdf import (
    extract_text_from_pdf as _legacy_extract_text_from_pdf,
    PDFProtectedError,
)


def extract_text_from_pdf(content: bytes) -> str:
    """PDF extraction with Kreuzberg when `USE_KREUZBERG=1`, else legacy.

    Kreuzberg's Rust-core extractor covers PDF + OCR + tables in one call;
    the legacy path is pdfplumber + shell-tesseract fallback. Swap is
    transparent — both paths raise `PDFProtectedError` on encrypted files.
    """
    if extract_kreuzberg.USE_KREUZBERG and extract_kreuzberg.is_available():
        try:
            return extract_kreuzberg.extract_text_from_pdf(content)
        except extract_kreuzberg.PDFProtectedError as exc:
            raise PDFProtectedError(str(exc)) from exc
    return _legacy_extract_text_from_pdf(content)
from fee_crawler.pipeline.rate_limiter import DomainRateLimiter
from fee_crawler.validation import validate_and_classify_fees, flags_to_json


def _determine_crawl_strategy(dl: dict, doc_type: str) -> str:
    """Determine the crawl strategy used for a successful download."""
    content_type = dl.get("content_type") or ""
    is_pdf = "application/pdf" in content_type or doc_type == "pdf"
    browser_rendered = dl.get("browser_rendered", False)

    if is_pdf and browser_rendered:
        return "playwright_pdf"
    elif is_pdf:
        return "direct_pdf"
    elif browser_rendered:
        return "playwright_html"
    else:
        return "static_html"


def _crawl_one(
    target: dict,
    config: Config,
    run_id: int,
    dry_run: bool = False,
    rate_limiter: DomainRateLimiter | None = None,
    stealth: bool = False,
) -> dict:
    """Worker function: crawl a single institution.

    Creates its own Database connection (thread-safe).
    Returns a stats dict for the caller to aggregate.
    """
    target_id = target["id"]
    name = target["institution_name"]
    url = target["fee_schedule_url"]
    doc_type = target["document_type"] or "unknown"
    last_hash = target["last_content_hash"]
    state_code = target["state_code"] or "??"

    db = get_worker_db(config)
    result = {
        "target_id": target_id,
        "name": name,
        "state_code": state_code,
        "doc_type": doc_type,
        "status": "failed",
        "fees": 0,
        "staged": 0,
        "flagged": 0,
        "message": "",
    }

    try:
        # Step 1: Download (stealth=True forces Playwright stealth from the start)
        dl = download_document(url, target_id, config, last_hash=last_hash, rate_limiter=rate_limiter, stealth=stealth)

        if not dl["success"]:
            error_msg = dl["error"] or ""

            # Stealth retry on 403 BEFORE clearing URL (D-08, Pitfall 4)
            from fee_crawler.pipeline.playwright_fetcher import is_playwright_available
            if ("403" in error_msg or "Forbidden" in error_msg) and is_playwright_available():
                from fee_crawler.pipeline.playwright_fetcher import (
                    fetch_with_browser,
                    _is_cloudflare_blocked,
                )
                print(f"    403 detected, retrying with stealth Playwright...")
                stealth_result = fetch_with_browser(url, stealth=True)
                if stealth_result["success"] and stealth_result["content"]:
                    if _is_cloudflare_blocked(stealth_result["content"]):
                        result["status"] = "failed"
                        result["message"] = "CLOUDFLARE BLOCKED (stealth failed)"
                        _save_result(db, run_id, target_id, "failed", url,
                                     error="cloudflare_blocked")
                        db.execute(
                            """UPDATE crawl_targets
                               SET failure_reason = 'cloudflare_blocked',
                                   consecutive_failures = consecutive_failures + 1
                               WHERE id = ?""",
                            (target_id,),
                        )
                        db.commit()
                        return result
                    # Stealth succeeded -- continue with stealth content
                    dl = stealth_result
                    dl["browser_rendered"] = True
                    dl["unchanged"] = False
                    dl["path"] = None
                    print(f"    Stealth succeeded: {len(dl['content']):,} bytes")

            # If still failed after stealth attempt, record failure
            if not dl["success"]:
                result["status"] = "failed"
                result["message"] = f"DOWNLOAD FAILED: {error_msg}"
                _save_result(db, run_id, target_id, "failed", url, error=error_msg)

                # Auto-clear dead URLs so discover can retry
                if "404" in error_msg or "403" in error_msg:
                    db.execute(
                        """UPDATE crawl_targets
                           SET fee_schedule_url = NULL, failure_reason = 'dead_url',
                               consecutive_failures = consecutive_failures + 1
                           WHERE id = ?""",
                        (target_id,),
                    )
                else:
                    db.execute(
                        "UPDATE crawl_targets SET consecutive_failures = consecutive_failures + 1 WHERE id = ?",
                        (target_id,),
                    )
                db.commit()
                return result

        if dl["unchanged"]:
            result["status"] = "unchanged"
            result["message"] = "UNCHANGED (hash match)"
            _save_result(db, run_id, target_id, "unchanged", url, content_hash=dl["content_hash"])
            db.commit()
            return result

        # Step 2: Extract text
        content = dl["content"]
        content_type = dl["content_type"] or ""

        if "application/pdf" in content_type or doc_type == "pdf":
            try:
                text = extract_text_from_pdf(content)
            except PDFProtectedError:
                result["status"] = "failed"
                result["message"] = "PDF is password-protected"
                _save_result(db, run_id, target_id, "failed", url, error="pdf_protected")
                db.execute(
                    "UPDATE crawl_targets SET failure_reason = 'pdf_protected' WHERE id = ?",
                    (target_id,),
                )
                db.commit()
                return result
            except Exception as e:
                result["status"] = "failed"
                result["message"] = f"PDF EXTRACT FAILED: {e}"
                _save_result(db, run_id, target_id, "failed", url, error=f"PDF extraction: {e}")
                db.commit()
                return result
        else:
            text = extract_text_from_html(content)

        if not text or len(text.strip()) < 50:
            # Try to find embedded PDF links in the HTML before giving up
            if "html" in (dl.get("content_type") or ""):
                pdf_url = _find_embedded_pdf_link(dl["content"], url)
                if pdf_url:
                    print(f"    Found embedded PDF: {pdf_url[:80]}")
                    pdf_dl = download_document(pdf_url, target_id, config, rate_limiter=rate_limiter)
                    if pdf_dl["success"] and pdf_dl["content"]:
                        try:
                            text = extract_text_from_pdf(pdf_dl["content"])
                            doc_type = "pdf"
                            dl = pdf_dl  # use the PDF download result
                        except Exception:
                            pass
            if not text or len(text.strip()) < 50:
                result["status"] = "failed"
                result["message"] = "NO TEXT EXTRACTED"
                _save_result(db, run_id, target_id, "failed", url, error="No text extracted from document")
                db.commit()
                return result

        # Step 2b: Document classification — skip non-fee documents to save API costs
        from fee_crawler.pipeline.classify_document import classify_document
        doc_class = classify_document(text)

        # Store classification results
        db.execute(
            """UPDATE crawl_targets
               SET document_type_detected = ?, doc_classification_confidence = ?
               WHERE id = ?""",
            (doc_class["doc_type_guess"], doc_class["confidence"], target_id),
        )

        if not doc_class["is_fee_schedule"]:
            # Before giving up, try embedded PDF links in the HTML
            if "html" in (dl.get("content_type") or "") and dl["content"]:
                pdf_url = _find_embedded_pdf_link(dl["content"], url)
                if pdf_url:
                    print(f"    Doc classified as {doc_class['doc_type_guess']}, trying embedded PDF: {pdf_url[:80]}")
                    pdf_dl = download_document(pdf_url, target_id, config, rate_limiter=rate_limiter)
                    if pdf_dl["success"] and pdf_dl["content"]:
                        try:
                            pdf_text = extract_text_from_pdf(pdf_dl["content"])
                            if pdf_text and len(pdf_text.strip()) >= 50:
                                pdf_class = classify_document(pdf_text)
                                if pdf_class["is_fee_schedule"]:
                                    text = pdf_text
                                    doc_type = "pdf"
                                    dl = pdf_dl
                                    doc_class = pdf_class
                        except Exception:
                            pass

            if not doc_class["is_fee_schedule"]:
                failure_reason = f"wrong_document:{doc_class['doc_type_guess']}"
                result["status"] = "failed"
                result["message"] = f"DOC CLASSIFY: {doc_class['doc_type_guess']} (conf={doc_class['confidence']:.2f})"
                _save_result(db, run_id, target_id, "failed", url,
                             content_hash=dl["content_hash"],
                             error=f"Document classifier: {doc_class['doc_type_guess']} ({doc_class['confidence']:.2f})")
                db.execute(
                    """UPDATE crawl_targets
                       SET fee_schedule_url = NULL, failure_reason = ?,
                           last_crawl_at = datetime('now')
                       WHERE id = ?""",
                    (failure_reason, target_id),
                )
                db.commit()
                return result

        # Step 3: LLM extraction (skip in dry run)
        if dry_run:
            result["status"] = "success"
            result["message"] = f"text={len(text):,} chars (dry run)"
            _save_result(
                db, run_id, target_id, "success", url,
                content_hash=dl["content_hash"],
                document_path=dl["path"],
            )
            strategy = _determine_crawl_strategy(dl, doc_type)
            db.execute(
                """UPDATE crawl_targets
                   SET last_content_hash = ?, last_crawl_at = datetime('now'),
                       last_success_at = datetime('now'), consecutive_failures = 0,
                       crawl_strategy = ?
                   WHERE id = ?""",
                (dl["content_hash"], strategy, target_id),
            )
            db.commit()
            return result

        charter = target.get("charter_type", "bank")

        # Step 3a: Try platform rule extraction first (free, no LLM cost)
        cms_platform = target.get("cms_platform")
        extracted_by = "llm"
        if cms_platform and "html" in (dl.get("content_type") or ""):
            try:
                from fee_crawler.pipeline.extract_platform import try_platform_extraction
                platform_row = db.fetchone(
                    "SELECT rule_enabled FROM platform_registry WHERE platform = ?",
                    (cms_platform,),
                )
                if platform_row and platform_row["rule_enabled"]:
                    rule_fees = try_platform_extraction(cms_platform, text, True)
                    if rule_fees and len(rule_fees) >= 3:
                        from fee_crawler.pipeline.extract_llm import ExtractedFee
                        fees = [
                            ExtractedFee(
                                fee_name=f.fee_name, amount=f.amount,
                                frequency=f.frequency, conditions=f.conditions,
                                confidence=f.confidence,
                            )
                            for f in rule_fees
                        ]
                        extracted_by = f"{cms_platform}_rule"
                        print(f"    Platform rule ({cms_platform}): {len(fees)} fees extracted (no LLM cost)")
                        # Skip LLM — jump to step 4
                        categories = [normalize_fee_name(f.fee_name) for f in fees]
                        fee_families = [get_fee_family(c) if c else None for c in categories]
                        validated = validate_and_classify_fees(fees, config, fee_categories=categories)
                        # Jump to merge (step 5)
                        from fee_crawler.commands.merge_fees import merge_institution_fees
                        db.execute("BEGIN")
                        try:
                            result_id = _save_result(
                                db, run_id, target_id, "success", url,
                                content_hash=dl["content_hash"],
                                document_path=dl["path"],
                                fees_extracted=len(fees),
                            )
                            merge_stats = merge_institution_fees(
                                db, target_id, result_id,
                                validated, categories, fee_families,
                                extracted_by=extracted_by,
                            )
                            r2_key = dl.get("r2_key")
                            strategy = _determine_crawl_strategy(dl, doc_type)
                            update_sql = """UPDATE crawl_targets
                                   SET last_content_hash = ?, last_crawl_at = datetime('now'),
                                       last_success_at = datetime('now'), consecutive_failures = 0,
                                       crawl_strategy = ?"""
                            if r2_key:
                                update_sql += ", document_r2_key = ?"
                                db.execute(update_sql + " WHERE id = ?", (dl["content_hash"], strategy, r2_key, target_id))
                            else:
                                db.execute(update_sql + " WHERE id = ?", (dl["content_hash"], strategy, target_id))
                            db.commit()
                        except Exception:
                            db.execute("ROLLBACK")
                            raise
                        result["status"] = "success"
                        result["fees"] = len(fees)
                        result["staged"] = merge_stats.get("staged", 0)
                        result["flagged"] = merge_stats.get("flagged", 0)
                        result["message"] = f"RULE: {len(fees)} fees ({cms_platform})"
                        return result
            except Exception as e:
                print(f"    Platform rule extraction failed: {e}")

        print(f"    LLM extraction: {len(text):,} chars, charter={charter}, doc_type={doc_type}")
        try:
            fees = extract_fees_with_llm(
                text, config,
                institution_name=name,
                charter_type=charter,
                document_type=doc_type,
            )
            print(f"    LLM returned: {len(fees)} fees")
        except Exception as e:
            result["status"] = "failed"
            result["message"] = f"LLM FAILED: {e}"
            _save_result(db, run_id, target_id, "failed", url, error=f"LLM extraction: {e}")
            db.commit()
            return result

        # Step 4: Categorize + validate fees (category enables auto-approve)
        categories = [normalize_fee_name(f.fee_name) for f in fees]
        fee_families = [get_fee_family(c) if c else None for c in categories]
        validated = validate_and_classify_fees(fees, config, fee_categories=categories)

        # Step 5: Merge new fees with existing (compare, snapshot, change events)
        from fee_crawler.commands.merge_fees import merge_institution_fees

        db.execute("BEGIN")
        try:
            result_id = _save_result(
                db, run_id, target_id, "success", url,
                content_hash=dl["content_hash"],
                document_path=dl["path"],
                fees_extracted=len(validated),
            )

            merge_stats = merge_institution_fees(
                db, target_id, result_id,
                validated, categories, fee_families,
            )

            r2_key = dl.get("r2_key")
            strategy = _determine_crawl_strategy(dl, doc_type)
            update_sql = """UPDATE crawl_targets
                   SET last_content_hash = ?, last_crawl_at = datetime('now'),
                       last_success_at = datetime('now'), consecutive_failures = 0,
                       crawl_strategy = ?"""
            if r2_key:
                update_sql += ", document_r2_key = ?"
                db.execute(update_sql + " WHERE id = ?", (dl["content_hash"], strategy, r2_key, target_id))
            else:
                db.execute(update_sql + " WHERE id = ?", (dl["content_hash"], strategy, target_id))
            db.commit()
        except Exception:
            db.execute("ROLLBACK")
            raise

        approved_count = merge_stats["approved"]
        staged_count = merge_stats["staged"]
        flagged_count = merge_stats["flagged"]

        result["status"] = "success"
        result["fees"] = len(validated)
        result["approved"] = approved_count
        result["staged"] = staged_count
        result["flagged"] = flagged_count
        result["unchanged"] = merge_stats["unchanged"]
        result["changed"] = merge_stats["changed"]
        result["new_fees"] = merge_stats["new"]
        status_summary = f"{len(validated)} fees"
        parts = []
        if approved_count:
            parts.append(f"{approved_count} auto-approved")
        if staged_count:
            parts.append(f"{staged_count} staged")
        if flagged_count:
            parts.append(f"{flagged_count} flagged")
        if parts:
            status_summary += f" ({', '.join(parts)})"
        result["message"] = status_summary
        return result

    except Exception as e:
        result["status"] = "failed"
        result["message"] = f"ERROR: {e}"
        try:
            _save_result(db, run_id, target_id, "failed", url, error=str(e))
            db.execute(
                "UPDATE crawl_targets SET consecutive_failures = consecutive_failures + 1 WHERE id = ?",
                (target_id,),
            )
            # Reliability Roadmap #14: auto-mark dormant at 14+ consecutive
            # failures so future scheduled runs skip entirely and humans can
            # triage from /admin/coverage.
            db.execute(
                "UPDATE crawl_targets SET status = 'dormant' "
                "WHERE id = ? AND consecutive_failures >= 14 AND status != 'dormant'",
                (target_id,),
            )
            db.commit()
        except Exception as db_err:
            print(f"  WARNING: Failed to record error for {name}: {db_err}")
        return result
    finally:
        pass  # Worker DB is thread-local; closed when thread exits


def run(
    db: Database,
    config: Config,
    *,
    target_id: int | None = None,
    limit: int | None = None,
    state: str | None = None,
    tier: str | None = None,
    doc_type: str | None = None,
    dry_run: bool = False,
    workers: int = 1,
    include_failing: bool = False,
    skip_with_fees: bool = True,
    new_only: bool = False,
    stealth: bool = False,
    pdf_probe: bool = False,
) -> None:
    """Run the crawl pipeline on institutions with discovered fee schedule URLs.

    Args:
        db: Database connection (used for initial query; workers create their own).
        config: Application config.
        limit: Max institutions to process.
        state: Filter by state code.
        tier: Filter by asset_size_tier (comma-separated for multiple).
        doc_type: Filter by document type ('pdf' or 'html').
        dry_run: Download and extract text but skip LLM extraction (no API cost).
        workers: Number of concurrent worker threads.
        include_failing: Include institutions with 5+ consecutive failures (skipped by default).
        skip_with_fees: Skip institutions that already have extracted fees.
        new_only: Only crawl institutions whose fee_schedule_url was set in the last 24 hours.
        stealth: Force stealth Playwright mode for all initial fetches.
        pdf_probe: Run PDF URL probing pre-step before the main crawl.
    """
    # Create a crawl run record
    run_id = db.insert_returning_id(
        "INSERT INTO crawl_runs (trigger_type, targets_total) VALUES (?, 0)",
        ("manual",),
    )
    db.commit()

    # PDF probe pre-step: discover direct PDF URLs for institutions missing them
    if pdf_probe:
        from fee_crawler.pipeline.url_discoverer import UrlDiscoverer

        print("\n=== PDF URL Probe Pre-Step ===")
        probe_rate_limiter = DomainRateLimiter(min_delay=1.0)

        # Target institutions with no URL or previously failed
        # Ordered by asset_size DESC (biggest banks first per D-05)
        probe_query = """
            SELECT id, institution_name, website_url, fee_schedule_url, asset_size
            FROM crawl_targets
            WHERE website_url IS NOT NULL
              AND (fee_schedule_url IS NULL
                   OR failure_reason IN ('dead_url', 'cloudflare_blocked'))
            ORDER BY asset_size DESC NULLS LAST
        """
        probe_params: list = []
        if limit:
            probe_query += " LIMIT ?"
            probe_params.append(limit)

        probe_targets = db.fetchall(probe_query, tuple(probe_params))
        print(f"  Probing {len(probe_targets)} institutions for PDF URLs...")

        discoverer = UrlDiscoverer(config)
        probe_found = 0
        for pt in probe_targets:
            base = pt["website_url"]
            if not base:
                continue
            pdfs = discoverer.probe_pdf_urls(base, rate_limiter=probe_rate_limiter)
            if pdfs:
                pdf_url = pdfs[0]
                db.execute(
                    """UPDATE crawl_targets
                       SET fee_schedule_url = ?, document_type = 'pdf',
                           failure_reason = NULL, consecutive_failures = 0
                       WHERE id = ?""",
                    (pdf_url, pt["id"]),
                )
                probe_found += 1
                print(f"    Found PDF: {pt['institution_name']}: {pdf_url[:80]}")
        db.commit()
        print(f"  PDF probe complete: {probe_found}/{len(probe_targets)} found\n")

    # Single institution mode -- force re-extraction by clearing content hash
    if target_id:
        row = db.fetchone(
            "SELECT id, institution_name, fee_schedule_url, document_type, last_content_hash, state_code, asset_size, charter_type FROM crawl_targets WHERE id = ?",
            (target_id,),
        )
        if not row:
            print(f"Institution {target_id} not found.")
            return
        if not row["fee_schedule_url"]:
            print(f"Institution {row['institution_name']} has no fee schedule URL.")
            return
        # Clear hash to force re-extraction (avoids UNCHANGED skip)
        db.execute("UPDATE crawl_targets SET last_content_hash = NULL WHERE id = ?", (target_id,))
        db.commit()
        print(f"Crawling single institution: {row['institution_name']} ({row['state_code']})")

    # Build query for targets with fee schedule URLs
    where_clauses = ["ct.fee_schedule_url IS NOT NULL", "ct.status = 'active'"]
    params: list = []

    if target_id:
        where_clauses = ["ct.id = ?"]
        params = [target_id]

    # Reliability Roadmap #14 — tiered backoff on repeated failures.
    # Skip institutions based on how many consecutive failures they have and
    # when they were last crawled. Prevents hammering dead URLs every day and
    # lets anti-bot systems cool off before we retry.
    #   0-2 failures  → crawl normally (healthy tail)
    #   3-6 failures  → crawl only if >=3 days since last attempt
    #   7-13 failures → crawl only if >=14 days since last attempt
    #   14+ failures  → never (marked status='dormant' by the error handler)
    # Also: skip rows already marked dormant unless --include-failing.
    if not include_failing:
        where_clauses.append("ct.status != 'dormant'")
        where_clauses.append(
            "("
            "ct.consecutive_failures < 3"
            " OR (ct.consecutive_failures BETWEEN 3 AND 6"
            "     AND (ct.last_crawl_at IS NULL OR ct.last_crawl_at < datetime('now', '-3 days')))"
            " OR (ct.consecutive_failures BETWEEN 7 AND 13"
            "     AND (ct.last_crawl_at IS NULL OR ct.last_crawl_at < datetime('now', '-14 days')))"
            ")"
        )

    if state:
        where_clauses.append("ct.state_code = ?")
        params.append(state.upper())

    if tier:
        tiers = [t.strip() for t in tier.split(",")]
        placeholders = ",".join("?" for _ in tiers)
        where_clauses.append(f"ct.asset_size_tier IN ({placeholders})")
        params.extend(tiers)

    if doc_type:
        if doc_type.lower() == "pdf":
            where_clauses.append(
                "(ct.document_type = 'pdf' OR ct.fee_schedule_url LIKE '%.pdf%')"
            )
        elif doc_type.lower() == "html":
            where_clauses.append(
                "(ct.document_type = 'html' OR (ct.document_type IS NULL AND ct.fee_schedule_url NOT LIKE '%.pdf%'))"
            )

    if skip_with_fees:
        where_clauses.append(
            "NOT EXISTS (SELECT 1 FROM extracted_fees ef WHERE ef.crawl_target_id = ct.id AND ef.review_status != 'rejected')"
        )

    if new_only:
        where_clauses.append("ct.fee_schedule_url IS NOT NULL AND ct.last_crawl_at IS NULL")

    where_sql = " AND ".join(where_clauses)

    # Priority order:
    # 1. Has fee URL but never crawled (last_success_at IS NULL)
    # 2. Stale data (last_success_at > 90 days ago)
    # 3. No extracted fees yet
    # 4. Everything else, by asset size
    query = f"""SELECT ct.id, ct.institution_name, ct.fee_schedule_url, ct.document_type,
                   ct.last_content_hash, ct.state_code, ct.asset_size, ct.charter_type
            FROM crawl_targets ct
            WHERE {where_sql}
            ORDER BY
              CASE WHEN ct.last_success_at IS NULL THEN 0
                   WHEN ct.last_success_at < datetime('now', '-90 days') THEN 1
                   WHEN NOT EXISTS (SELECT 1 FROM extracted_fees ef2 WHERE ef2.crawl_target_id = ct.id) THEN 2
                   ELSE 3 END,
              ct.last_success_at ASC NULLS FIRST,
              ct.asset_size DESC NULLS LAST"""
    if limit and limit > 0:
        query += " LIMIT ?"
        params.append(limit)

    targets = db.fetchall(query, tuple(params))

    total = len(targets)
    if total == 0:
        print("No institutions with fee schedule URLs to crawl.")
        return

    # Convert RealDictRow rows to plain dicts (needed for thread safety)
    targets = [dict(t) for t in targets]

    # Update run with target count
    db.execute("UPDATE crawl_runs SET targets_total = ? WHERE id = ?", (total, run_id))
    db.commit()

    # Log how many were skipped by circuit breaker
    if not include_failing:
        skipped = db.fetchone(
            "SELECT COUNT(*) as cnt FROM crawl_targets WHERE fee_schedule_url IS NOT NULL AND status = 'active' AND consecutive_failures >= 5"
        )
        skipped_count = skipped["cnt"] if skipped else 0
        if skipped_count > 0:
            print(f"Skipping {skipped_count} institutions with 5+ consecutive failures (use --include-failing to retry)")

    # Create shared rate limiter for polite crawling
    limiter = DomainRateLimiter(
        default_delay=config.crawl.delay_seconds,
        max_concurrent_domains=min(workers * 2, 20),
    )

    print(f"Crawling {total} institutions (run #{run_id})")
    print(f"  Workers: {workers}")
    print(f"  Rate limit: {config.crawl.delay_seconds}s/domain, max {min(workers * 2, 20)} concurrent domains")
    if dry_run:
        print("  DRY RUN: will extract text but skip LLM fee extraction")
    print()

    if stealth:
        print("  STEALTH MODE: all fetches will use Playwright stealth")
    if workers <= 1:
        _run_serial(targets, config, run_id, dry_run, total, db, limiter, stealth=stealth)
    else:
        _run_concurrent(targets, config, run_id, dry_run, total, workers, db, limiter, stealth=stealth)


def _run_serial(
    targets: list[dict],
    config: Config,
    run_id: int,
    dry_run: bool,
    total: int,
    db: Database,
    rate_limiter: DomainRateLimiter | None = None,
    stealth: bool = False,
) -> None:
    """Original serial crawl loop."""
    stats = {"crawled": 0, "succeeded": 0, "failed": 0, "unchanged": 0, "total_fees": 0, "duration_s": 0}
    _start = time.time()

    try:
        for i, target in enumerate(targets, 1):
            name = target["institution_name"]
            state_code = target["state_code"] or "??"
            doc_type = target["document_type"] or "unknown"

            print(f"[{i}/{total}] {name[:45]:45s} ({state_code}) {doc_type:4s}", end="  ")
            stats["crawled"] += 1

            result = _crawl_one(target, config, run_id, dry_run, rate_limiter=rate_limiter, stealth=stealth)

            if result["status"] == "success":
                stats["succeeded"] += 1
                stats["total_fees"] += result["fees"]
            elif result["status"] == "unchanged":
                stats["unchanged"] += 1
            else:
                stats["failed"] += 1

            print(result["message"])

            if i % 25 == 0:
                pct = stats["succeeded"] / i * 100 if i > 0 else 0
                print(
                    f"\n  --- Progress: {i}/{total} | "
                    f"Succeeded: {stats['succeeded']} ({pct:.0f}%) | "
                    f"Fees: {stats['total_fees']} ---\n"
                )

    except KeyboardInterrupt:
        print(f"\n\nInterrupted by user after {stats['crawled']} institutions.")

    stats["duration_s"] = time.time() - _start
    _finalize_run(db, run_id, stats, total)


def _run_concurrent(
    targets: list[dict],
    config: Config,
    run_id: int,
    dry_run: bool,
    total: int,
    workers: int,
    db: Database,
    rate_limiter: DomainRateLimiter | None = None,
    stealth: bool = False,
) -> None:
    """Concurrent crawl using ThreadPoolExecutor."""
    stats = {"crawled": 0, "succeeded": 0, "failed": 0, "unchanged": 0, "total_fees": 0, "duration_s": 0}
    completed = 0
    start_time = time.time()

    try:
        with ThreadPoolExecutor(max_workers=workers) as executor:
            futures = {
                executor.submit(_crawl_one, target, config, run_id, dry_run, rate_limiter=rate_limiter, stealth=stealth): target
                for target in targets
            }

            for future in as_completed(futures):
                completed += 1
                result = future.result()
                stats["crawled"] += 1

                name = result["name"]
                state_code = result["state_code"]
                doc_type = result["doc_type"]

                if result["status"] == "success":
                    stats["succeeded"] += 1
                    stats["total_fees"] += result["fees"]
                    print(
                        f"[{completed}/{total}] {name[:45]:45s} ({state_code}) {doc_type:4s}  "
                        f"{result['message']}"
                    )
                elif result["status"] == "unchanged":
                    stats["unchanged"] += 1
                    if completed <= 10:
                        print(
                            f"[{completed}/{total}] {name[:45]:45s} ({state_code}) {doc_type:4s}  "
                            f"UNCHANGED"
                        )
                else:
                    stats["failed"] += 1
                    if completed <= 20:
                        print(
                            f"[{completed}/{total}] {name[:45]:45s} ({state_code}) {doc_type:4s}  "
                            f"{result['message'][:70]}"
                        )

                # Progress summary every 25 institutions
                if completed % 25 == 0:
                    elapsed = time.time() - start_time
                    rate = completed / elapsed * 3600 if elapsed > 0 else 0
                    pct = stats["succeeded"] / completed * 100 if completed > 0 else 0
                    print(
                        f"\n  --- Progress: {completed}/{total} | "
                        f"Succeeded: {stats['succeeded']} ({pct:.0f}%) | "
                        f"Fees: {stats['total_fees']} | "
                        f"Rate: {rate:.0f}/hr ---\n"
                    )

    except KeyboardInterrupt:
        print(f"\n\nInterrupted by user after {completed} institutions.")

    stats["duration_s"] = time.time() - start_time
    _finalize_run(db, run_id, stats, total)

    elapsed = stats["duration_s"]
    if elapsed > 0 and completed > 0:
        rate = completed / elapsed * 3600
        print(f"\n  Elapsed: {elapsed / 60:.1f} min | Rate: {rate:.0f} institutions/hr")


def _finalize_run(db: Database, run_id: int, stats: dict, total: int) -> None:
    """Update crawl run record and print summary."""
    db.execute(
        """UPDATE crawl_runs
           SET status = 'completed',
               targets_crawled = ?, targets_succeeded = ?,
               targets_failed = ?, targets_unchanged = ?,
               fees_extracted = ?, completed_at = datetime('now')
           WHERE id = ?""",
        (stats["crawled"], stats["succeeded"], stats["failed"],
         stats["unchanged"], stats["total_fees"], run_id),
    )
    db.commit()

    duration_s = stats.get("duration_s", 0)
    mins = int(duration_s // 60)
    secs = int(duration_s % 60)

    print(f"\n{'='*60}")
    print(f"  CRAWL RUN #{run_id} REPORT")
    print(f"{'='*60}")
    print(f"  Duration:   {mins}m {secs}s")
    print(f"  Crawled:    {stats['crawled']}/{total}")
    print(f"  Succeeded:  {stats['succeeded']} ({stats['succeeded']*100//max(1,stats['crawled'])}%)")
    print(f"  Failed:     {stats['failed']}")
    print(f"  Unchanged:  {stats['unchanged']}")
    print(f"  Fees found: {stats['total_fees']}")

    # Fee status breakdown
    status_rows = db.fetchall(
        "SELECT review_status, COUNT(*) as cnt FROM extracted_fees GROUP BY review_status ORDER BY cnt DESC"
    )
    if status_rows:
        print(f"\n  Fee Inventory:")
        for row in status_rows:
            print(f"    {row['review_status']:<12s} {row['cnt']:>8,}")

    # Confidence distribution
    conf = db.fetchall("""
        SELECT
          CASE
            WHEN extraction_confidence >= 0.95 THEN '0.95+'
            WHEN extraction_confidence >= 0.90 THEN '0.90-0.94'
            WHEN extraction_confidence >= 0.85 THEN '0.85-0.89'
            WHEN extraction_confidence >= 0.70 THEN '0.70-0.84'
            ELSE '<0.70'
          END as range,
          COUNT(*) as cnt
        FROM extracted_fees WHERE review_status != 'rejected'
        GROUP BY range ORDER BY range DESC
    """)
    if conf:
        print(f"\n  Confidence Distribution:")
        for row in conf:
            print(f"    {row['range']:<12s} {row['cnt']:>6,}")

    # Top categories
    cats = db.fetchall("""
        SELECT fee_category, COUNT(DISTINCT crawl_target_id) as inst_cnt, COUNT(*) as cnt
        FROM extracted_fees
        WHERE fee_category IS NOT NULL AND review_status != 'rejected'
        GROUP BY fee_category ORDER BY inst_cnt DESC LIMIT 10
    """)
    if cats:
        print(f"\n  Top Categories:")
        print(f"    {'Category':<28s} {'Inst':>6s} {'Fees':>6s}")
        for row in cats:
            print(f"    {row['fee_category']:<28s} {row['inst_cnt']:>6,} {row['cnt']:>6,}")

    # Uncategorized remaining
    uncat = db.fetchone(
        "SELECT COUNT(*) as cnt FROM extracted_fees WHERE fee_category IS NULL AND review_status != 'rejected'"
    )
    if uncat and uncat["cnt"] > 0:
        print(f"\n  Uncategorized remaining: {uncat['cnt']:,}")

    print(f"{'='*60}")

    # Structured result for job runner
    result = {
        "version": 1,
        "command": "crawl",
        "status": "completed" if stats["failed"] == 0 else "partial",
        "duration_s": round(stats.get("duration_s", 0), 1),
        "processed": stats["crawled"],
        "succeeded": stats["succeeded"],
        "failed": stats["failed"],
        "skipped": stats["unchanged"],
        "fees_extracted": stats["total_fees"],
        "institutions_failed": stats["failed"],
    }
    from fee_crawler.job_result import emit_result
    emit_result(result)

    # Capture coverage snapshot (one per day, upsert)
    try:
        snapshot = db.fetchone("""
            SELECT
              (SELECT COUNT(*) FROM crawl_targets) as total,
              (SELECT COUNT(*) FROM crawl_targets WHERE fee_schedule_url IS NOT NULL AND fee_schedule_url != '') as with_url,
              (SELECT COUNT(DISTINCT crawl_target_id) FROM extracted_fees WHERE review_status != 'rejected') as with_fees,
              (SELECT COUNT(DISTINCT crawl_target_id) FROM extracted_fees WHERE review_status = 'approved') as with_approved,
              (SELECT COUNT(*) FROM extracted_fees WHERE review_status != 'rejected') as total_fees,
              (SELECT COUNT(*) FROM extracted_fees WHERE review_status = 'approved') as approved_fees
        """)
        if snapshot:
            db.execute(
                """INSERT INTO coverage_snapshots
                   (snapshot_date, total_institutions, with_fee_url, with_fees, with_approved, total_fees, approved_fees)
                   VALUES (date('now'), ?, ?, ?, ?, ?, ?)
                   ON CONFLICT(snapshot_date) DO UPDATE SET
                     total_institutions = excluded.total_institutions,
                     with_fee_url = excluded.with_fee_url,
                     with_fees = excluded.with_fees,
                     with_approved = excluded.with_approved,
                     total_fees = excluded.total_fees,
                     approved_fees = excluded.approved_fees""",
                (snapshot["total"], snapshot["with_url"], snapshot["with_fees"],
                 snapshot["with_approved"], snapshot["total_fees"], snapshot["approved_fees"]),
            )
            db.commit()
    except Exception:
        pass  # Don't fail the crawl if snapshot fails


def _find_embedded_pdf_link(content: bytes, page_url: str) -> str | None:
    """Scan HTML for embedded PDF links that look like fee schedules.

    Many bank websites link to a PDF fee schedule from a disclosures page.
    If the HTML itself has no fee data, following the PDF link often works.

    Uses BeautifulSoup for robust parsing and scores candidates by keyword
    relevance to find the best match.
    """
    from urllib.parse import urljoin

    try:
        html = content.decode("utf-8", errors="replace")
    except Exception:
        return None

    try:
        from bs4 import BeautifulSoup
    except ImportError:
        return None

    soup = BeautifulSoup(html, "html.parser")

    fee_keywords = {
        "fee": 3, "schedule": 3, "pricing": 2, "charges": 2,
        "disclosure": 1, "service charge": 2, "fee schedule": 5,
        "account agreement": 2, "truth in savings": 2,
    }

    def _score_candidate(href: str, text: str) -> int:
        """Score a PDF link by keyword relevance."""
        combined = (href + " " + text).lower()
        score = 0
        for keyword, weight in fee_keywords.items():
            if keyword in combined:
                score += weight
        return score

    candidates: list[tuple[int, str]] = []

    def _is_pdf_url(href: str) -> bool:
        """Check if a URL points to a PDF (by extension or query params)."""
        href_lower = href.lower()
        if href_lower.endswith(".pdf"):
            return True
        if ".pdf?" in href_lower or ".pdf#" in href_lower:
            return True
        if "docs.google.com" in href_lower and "/viewer" in href_lower:
            return True
        return False

    # Check <a> tags with PDF href
    for tag in soup.find_all("a", href=True):
        href = tag["href"]
        if not isinstance(href, str):
            continue
        if not _is_pdf_url(href):
            continue
        full_url = urljoin(page_url, href)
        link_text = tag.get_text(strip=True)
        score = _score_candidate(href, link_text)
        if score > 0:
            candidates.append((score, full_url))

    # Check <iframe>, <embed>, <object> for embedded PDFs
    for tag in soup.find_all(["iframe", "embed", "object"]):
        src = tag.get("src") or tag.get("data") or ""
        if not isinstance(src, str):
            continue
        if ".pdf" in src.lower():
            full_url = urljoin(page_url, src)
            score = _score_candidate(src, "")
            # Embedded PDFs get a relevance bonus since they are the primary content
            candidates.append((score + 2, full_url))

    if candidates:
        # Return the highest-scoring PDF link
        candidates.sort(key=lambda c: c[0], reverse=True)
        return candidates[0][1]

    return None


def _save_result(
    db: Database,
    run_id: int,
    target_id: int,
    status: str,
    url: str,
    *,
    content_hash: str | None = None,
    document_path: str | None = None,
    fees_extracted: int = 0,
    error: str | None = None,
) -> int:
    """Insert a crawl_results record and return its id."""
    return db.insert_returning_id(
        """INSERT INTO crawl_results
           (crawl_run_id, crawl_target_id, status, document_url,
            document_path, content_hash, fees_extracted, error_message)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (run_id, target_id, status, url, document_path,
         content_hash, fees_extracted, error),
    )
