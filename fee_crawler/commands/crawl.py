"""Run the full crawl pipeline: download -> extract -> store.

For each institution with a fee_schedule_url:
1. Download the document (PDF or HTML)
2. Check content hash for changes (skip if unchanged)
3. Extract text (pdfplumber for PDFs, BeautifulSoup for HTML)
4. Send to Claude for structured fee extraction
5. Store results in crawl_results and extracted_fees tables
"""

from fee_crawler.config import Config
from fee_crawler.db import Database
from fee_crawler.pipeline.download import download_document
from fee_crawler.pipeline.extract_html import extract_text_from_html
from fee_crawler.pipeline.extract_llm import extract_fees_with_llm
from fee_crawler.pipeline.extract_pdf import extract_text_from_pdf
from fee_crawler.validation import validate_and_classify_fees, flags_to_json


def run(
    db: Database,
    config: Config,
    *,
    limit: int | None = None,
    state: str | None = None,
    dry_run: bool = False,
) -> None:
    """Run the crawl pipeline on institutions with discovered fee schedule URLs.

    Args:
        db: Database connection.
        config: Application config.
        limit: Max institutions to process.
        state: Filter by state code.
        dry_run: Download and extract text but skip LLM extraction (no API cost).
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
    limit_sql = f"LIMIT {limit}" if limit else ""

    targets = db.fetchall(
        f"""SELECT id, institution_name, fee_schedule_url, document_type,
                   last_content_hash, state_code, asset_size
            FROM crawl_targets
            WHERE {where_sql}
            ORDER BY asset_size DESC NULLS LAST
            {limit_sql}""",
        tuple(params),
    )

    total = len(targets)
    if total == 0:
        print("No institutions with fee schedule URLs to crawl.")
        return

    # Update run with target count
    db.execute("UPDATE crawl_runs SET targets_total = ? WHERE id = ?", (total, run_id))
    db.commit()

    print(f"Crawling {total} institutions (run #{run_id})")
    if dry_run:
        print("  DRY RUN: will extract text but skip LLM fee extraction")
    print()

    stats = {
        "crawled": 0,
        "succeeded": 0,
        "failed": 0,
        "unchanged": 0,
        "total_fees": 0,
    }

    try:
        for i, target in enumerate(targets, 1):
            target_id = target["id"]
            name = target["institution_name"]
            url = target["fee_schedule_url"]
            doc_type = target["document_type"] or "unknown"
            last_hash = target["last_content_hash"]
            state_code = target["state_code"] or "??"

            print(f"[{i}/{total}] {name[:45]:45s} ({state_code}) {doc_type:4s}", end="  ")
            stats["crawled"] += 1

            # Step 1: Download
            dl = download_document(url, target_id, config, last_hash=last_hash)

            if not dl["success"]:
                print(f"DOWNLOAD FAILED: {dl['error']}")
                stats["failed"] += 1
                _save_result(db, run_id, target_id, "failed", url, error=dl["error"])
                db.execute(
                    "UPDATE crawl_targets SET consecutive_failures = consecutive_failures + 1 WHERE id = ?",
                    (target_id,),
                )
                db.commit()
                continue

            if dl["unchanged"]:
                print("UNCHANGED (hash match)")
                stats["unchanged"] += 1
                _save_result(db, run_id, target_id, "unchanged", url, content_hash=dl["content_hash"])
                db.commit()
                continue

            # Step 2: Extract text
            content = dl["content"]
            content_type = dl["content_type"] or ""

            if "application/pdf" in content_type or doc_type == "pdf":
                try:
                    text = extract_text_from_pdf(content)
                except Exception as e:
                    print(f"PDF EXTRACT FAILED: {e}")
                    stats["failed"] += 1
                    _save_result(db, run_id, target_id, "failed", url, error=f"PDF extraction: {e}")
                    db.commit()
                    continue
            else:
                text = extract_text_from_html(content)

            if not text or len(text.strip()) < 50:
                print("NO TEXT EXTRACTED")
                stats["failed"] += 1
                _save_result(db, run_id, target_id, "failed", url, error="No text extracted from document")
                db.commit()
                continue

            text_preview = text[:80].replace("\n", " ")
            print(f"text={len(text):,} chars", end="  ")

            # Step 3: LLM extraction (skip in dry run)
            if dry_run:
                print(f"EXTRACTED TEXT (dry run)")
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
                stats["succeeded"] += 1
                continue

            try:
                fees = extract_fees_with_llm(text, config)
            except Exception as e:
                print(f"LLM FAILED: {e}")
                stats["failed"] += 1
                _save_result(db, run_id, target_id, "failed", url, error=f"LLM extraction: {e}")
                db.commit()
                continue

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

            stats["succeeded"] += 1
            stats["total_fees"] += len(validated)
            status_summary = f"{len(validated)} fees"
            if staged_count:
                status_summary += f" ({staged_count} staged"
                if flagged_count:
                    status_summary += f", {flagged_count} flagged"
                status_summary += ")"
            elif flagged_count:
                status_summary += f" ({flagged_count} flagged)"
            print(status_summary)

    except KeyboardInterrupt:
        print(f"\n\nInterrupted by user after {stats['crawled']} institutions.")

    # Update crawl run
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

    # Summary
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
