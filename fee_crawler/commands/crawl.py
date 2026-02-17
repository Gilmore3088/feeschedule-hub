"""Run the full crawl pipeline: download -> extract -> store.

For each institution with a fee_schedule_url:
1. Download the document (PDF or HTML)
2. Check content hash for changes (skip if unchanged)
3. Extract text (pdfplumber for PDFs, BeautifulSoup for HTML)
4. Send to Claude for structured fee extraction
5. Store results in crawl_results and extracted_fees tables

Supports concurrent crawling via --workers flag.
"""

import time
from concurrent.futures import ThreadPoolExecutor, as_completed

from fee_crawler.config import Config
from fee_crawler.db import Database
from fee_crawler.pipeline.download import download_document
from fee_crawler.pipeline.extract_html import extract_text_from_html
from fee_crawler.pipeline.extract_llm import extract_fees_with_llm
from fee_crawler.pipeline.extract_pdf import extract_text_from_pdf
from fee_crawler.validation import validate_and_classify_fees, flags_to_json


def _crawl_one(
    target: dict,
    config: Config,
    run_id: int,
    dry_run: bool = False,
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

    db = Database(config)
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
        # Step 1: Download
        dl = download_document(url, target_id, config, last_hash=last_hash)

        if not dl["success"]:
            result["status"] = "failed"
            result["message"] = f"DOWNLOAD FAILED: {dl['error']}"
            _save_result(db, run_id, target_id, "failed", url, error=dl["error"])
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
            except Exception as e:
                result["status"] = "failed"
                result["message"] = f"PDF EXTRACT FAILED: {e}"
                _save_result(db, run_id, target_id, "failed", url, error=f"PDF extraction: {e}")
                db.commit()
                return result
        else:
            text = extract_text_from_html(content)

        if not text or len(text.strip()) < 50:
            result["status"] = "failed"
            result["message"] = "NO TEXT EXTRACTED"
            _save_result(db, run_id, target_id, "failed", url, error="No text extracted from document")
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
            db.execute(
                """UPDATE crawl_targets
                   SET last_content_hash = ?, last_crawl_at = datetime('now'),
                       last_success_at = datetime('now'), consecutive_failures = 0
                   WHERE id = ?""",
                (dl["content_hash"], target_id),
            )
            db.commit()
            return result

        try:
            fees = extract_fees_with_llm(text, config)
        except Exception as e:
            result["status"] = "failed"
            result["message"] = f"LLM FAILED: {e}"
            _save_result(db, run_id, target_id, "failed", url, error=f"LLM extraction: {e}")
            db.commit()
            return result

        # Step 4: Validate fees
        validated = validate_and_classify_fees(fees, config)

        # Step 5: Re-crawl overwrite - delete old fees for this institution
        old_fees = db.fetchall(
            "SELECT id, review_status FROM extracted_fees WHERE crawl_target_id = ?",
            (target_id,),
        )
        if old_fees:
            for old in old_fees:
                db.execute(
                    """INSERT INTO fee_reviews
                       (fee_id, action, username, previous_status, new_status, notes)
                       VALUES (?, 'reset', 'system', ?, 'deleted', 'Re-crawl replaced all fees')""",
                    (old["id"], old["review_status"]),
                )
            db.execute(
                "DELETE FROM extracted_fees WHERE crawl_target_id = ?",
                (target_id,),
            )

        # Step 6: Store validated results
        result_id = _save_result(
            db, run_id, target_id, "success", url,
            content_hash=dl["content_hash"],
            document_path=dl["path"],
            fees_extracted=len(validated),
        )

        staged_count = 0
        flagged_count = 0
        for fee, flags, review_status in validated:
            db.execute(
                """INSERT INTO extracted_fees
                   (crawl_result_id, crawl_target_id, fee_name, amount,
                    frequency, conditions, extraction_confidence,
                    review_status, validation_flags)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (result_id, target_id, fee.fee_name, fee.amount,
                 fee.frequency, fee.conditions, fee.confidence,
                 review_status, flags_to_json(flags)),
            )
            if review_status == "staged":
                staged_count += 1
            elif review_status == "flagged":
                flagged_count += 1

        db.execute(
            """UPDATE crawl_targets
               SET last_content_hash = ?, last_crawl_at = datetime('now'),
                   last_success_at = datetime('now'), consecutive_failures = 0
               WHERE id = ?""",
            (dl["content_hash"], target_id),
        )
        db.commit()

        result["status"] = "success"
        result["fees"] = len(validated)
        result["staged"] = staged_count
        result["flagged"] = flagged_count
        status_summary = f"{len(validated)} fees"
        if staged_count:
            status_summary += f" ({staged_count} staged"
            if flagged_count:
                status_summary += f", {flagged_count} flagged"
            status_summary += ")"
        elif flagged_count:
            status_summary += f" ({flagged_count} flagged)"
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
            db.commit()
        except Exception as db_err:
            print(f"  WARNING: Failed to record error for {name}: {db_err}")
        return result
    finally:
        db.close()


def run(
    db: Database,
    config: Config,
    *,
    limit: int | None = None,
    state: str | None = None,
    dry_run: bool = False,
    workers: int = 1,
) -> None:
    """Run the crawl pipeline on institutions with discovered fee schedule URLs.

    Args:
        db: Database connection (used for initial query; workers create their own).
        config: Application config.
        limit: Max institutions to process.
        state: Filter by state code.
        dry_run: Download and extract text but skip LLM extraction (no API cost).
        workers: Number of concurrent worker threads.
    """
    # Create a crawl run record
    run_id = db.insert_returning_id(
        "INSERT INTO crawl_runs (trigger, targets_total) VALUES (?, 0)",
        ("manual",),
    )
    db.commit()

    # Build query for targets with fee schedule URLs
    where_clauses = ["fee_schedule_url IS NOT NULL", "status = 'active'"]
    params: list = []

    if state:
        where_clauses.append("state_code = ?")
        params.append(state.upper())

    where_sql = " AND ".join(where_clauses)

    query = f"""SELECT id, institution_name, fee_schedule_url, document_type,
                   last_content_hash, state_code, asset_size
            FROM crawl_targets
            WHERE {where_sql}
            ORDER BY asset_size DESC NULLS LAST"""
    if limit and limit > 0:
        query += " LIMIT ?"
        params.append(limit)

    targets = db.fetchall(query, tuple(params))

    total = len(targets)
    if total == 0:
        print("No institutions with fee schedule URLs to crawl.")
        return

    # Convert sqlite3.Row objects to plain dicts (needed for thread safety)
    targets = [dict(t) for t in targets]

    # Update run with target count
    db.execute("UPDATE crawl_runs SET targets_total = ? WHERE id = ?", (total, run_id))
    db.commit()

    print(f"Crawling {total} institutions (run #{run_id})")
    print(f"  Workers: {workers}")
    if dry_run:
        print("  DRY RUN: will extract text but skip LLM fee extraction")
    print()

    if workers <= 1:
        _run_serial(targets, config, run_id, dry_run, total, db)
    else:
        _run_concurrent(targets, config, run_id, dry_run, total, workers, db)


def _run_serial(
    targets: list[dict],
    config: Config,
    run_id: int,
    dry_run: bool,
    total: int,
    db: Database,
) -> None:
    """Original serial crawl loop."""
    stats = {"crawled": 0, "succeeded": 0, "failed": 0, "unchanged": 0, "total_fees": 0}

    try:
        for i, target in enumerate(targets, 1):
            name = target["institution_name"]
            state_code = target["state_code"] or "??"
            doc_type = target["document_type"] or "unknown"

            print(f"[{i}/{total}] {name[:45]:45s} ({state_code}) {doc_type:4s}", end="  ")
            stats["crawled"] += 1

            result = _crawl_one(target, config, run_id, dry_run)

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

    _finalize_run(db, run_id, stats, total)


def _run_concurrent(
    targets: list[dict],
    config: Config,
    run_id: int,
    dry_run: bool,
    total: int,
    workers: int,
    db: Database,
) -> None:
    """Concurrent crawl using ThreadPoolExecutor."""
    stats = {"crawled": 0, "succeeded": 0, "failed": 0, "unchanged": 0, "total_fees": 0}
    completed = 0
    start_time = time.time()

    try:
        with ThreadPoolExecutor(max_workers=workers) as executor:
            futures = {
                executor.submit(_crawl_one, target, config, run_id, dry_run): target
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

    _finalize_run(db, run_id, stats, total)

    elapsed = time.time() - start_time
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

    print(f"\nCrawl run #{run_id} complete:")
    print(f"  Crawled:    {stats['crawled']}/{total}")
    print(f"  Succeeded:  {stats['succeeded']}")
    print(f"  Failed:     {stats['failed']}")
    print(f"  Unchanged:  {stats['unchanged']}")
    print(f"  Fees found: {stats['total_fees']}")


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
