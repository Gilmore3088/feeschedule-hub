"""Run the full crawl pipeline: download -> extract -> store.

For each institution with a fee_schedule_url:
1. Download the document (PDF or HTML)
2. Check content hash for changes (skip if unchanged)
3. Extract text (pdfplumber for PDFs, BeautifulSoup for HTML)
4. Send to Claude for structured fee extraction
5. Categorize and validate fees
6. Store results in crawl_results and extracted_fees tables

Supports concurrent crawling via --workers flag.
"""

import logging
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

from fee_crawler.config import Config
from fee_crawler.db import Database
from fee_crawler.pipeline.steps import (
    step_classify_and_validate,
    step_download,
    step_extract_text,
    step_llm_extract,
)
from fee_crawler.pipeline.types import CrawlContext, CrawlOutcome
from fee_crawler.validation import flags_to_json

logger = logging.getLogger(__name__)


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
    ctx = CrawlContext(
        target_id=target["id"],
        institution_name=target["institution_name"],
        url=target["fee_schedule_url"],
        doc_type=target["document_type"] or "unknown",
        state_code=target["state_code"] or "??",
        last_content_hash=target["last_content_hash"],
        run_id=run_id,
        dry_run=dry_run,
    )

    db = Database(config)
    outcome = CrawlOutcome(
        target_id=ctx.target_id,
        name=ctx.institution_name,
        state_code=ctx.state_code,
        doc_type=ctx.doc_type,
        status="failed",
    )

    try:
        # Step 1: Download
        dl = step_download(ctx, config)
        if dl.status == "fail":
            outcome.message = dl.error or "Download failed"
            _record_failure(db, ctx, dl.error or "Download failed")
            return _to_dict(outcome)
        if dl.status == "skip":
            outcome.status = "unchanged"
            outcome.message = "UNCHANGED (hash match)"
            _save_result(
                db, run_id, ctx.target_id, "unchanged", ctx.url,
                content_hash=dl.content_hash,
            )
            db.commit()
            return _to_dict(outcome)

        # Step 2: Extract text
        ext = step_extract_text(ctx, dl)
        if ext.status == "fail":
            outcome.message = ext.error or "Extraction failed"
            _record_failure(db, ctx, ext.error or "Extraction failed")
            return _to_dict(outcome)

        # Step 3: LLM extraction (skip in dry run)
        if dry_run:
            outcome.status = "success"
            outcome.message = f"text={len(ext.text or ''):,} chars (dry run)"
            _save_result(
                db, run_id, ctx.target_id, "success", ctx.url,
                content_hash=dl.content_hash,
                document_path=dl.document_path,
            )
            db.execute(
                """UPDATE crawl_targets
                   SET last_content_hash = ?, last_crawl_at = datetime('now'),
                       last_success_at = datetime('now'), consecutive_failures = 0
                   WHERE id = ?""",
                (dl.content_hash, ctx.target_id),
            )
            db.commit()
            return _to_dict(outcome)

        llm = step_llm_extract(ext, config)
        if llm.status == "fail":
            outcome.message = llm.error or "LLM extraction failed"
            _record_failure(db, ctx, llm.error or "LLM extraction failed")
            return _to_dict(outcome)

        # Step 4+5: Categorize + validate
        classified = step_classify_and_validate(llm.fees, config)

        # Step 6: Re-crawl overwrite -- delete old fees for this institution
        old_fees = db.fetchall(
            "SELECT id, review_status FROM extracted_fees WHERE crawl_target_id = ?",
            (ctx.target_id,),
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
                (ctx.target_id,),
            )

        # Step 7: Store validated results
        result_id = _save_result(
            db, run_id, ctx.target_id, "success", ctx.url,
            content_hash=dl.content_hash,
            document_path=dl.document_path,
            fees_extracted=len(classified),
        )

        staged_count = 0
        flagged_count = 0
        approved_count = 0
        for fee, category, family, flags, review_status in classified:
            db.execute(
                """INSERT INTO extracted_fees
                   (crawl_result_id, crawl_target_id, fee_name, amount,
                    frequency, conditions, extraction_confidence,
                    review_status, validation_flags, fee_category, fee_family)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (result_id, ctx.target_id, fee.fee_name, fee.amount,
                 fee.frequency, fee.conditions, fee.confidence,
                 review_status, flags_to_json(flags), category, family),
            )
            if review_status == "staged":
                staged_count += 1
            elif review_status == "flagged":
                flagged_count += 1
            elif review_status == "approved":
                approved_count += 1

        db.execute(
            """UPDATE crawl_targets
               SET last_content_hash = ?, last_crawl_at = datetime('now'),
                   last_success_at = datetime('now'), consecutive_failures = 0
               WHERE id = ?""",
            (dl.content_hash, ctx.target_id),
        )
        db.commit()

        outcome.status = "success"
        outcome.fees = len(classified)
        outcome.staged = staged_count
        outcome.flagged = flagged_count
        status_summary = f"{len(classified)} fees"
        parts = []
        if approved_count:
            parts.append(f"{approved_count} approved")
        if staged_count:
            parts.append(f"{staged_count} staged")
        if flagged_count:
            parts.append(f"{flagged_count} flagged")
        if parts:
            status_summary += f" ({', '.join(parts)})"
        outcome.message = status_summary
        return _to_dict(outcome)

    except Exception as e:
        outcome.message = f"ERROR: {e}"
        try:
            _record_failure(db, ctx, str(e))
        except Exception as db_err:
            logger.warning("Failed to record error for %s: %s", ctx.institution_name, db_err)
        return _to_dict(outcome)
    finally:
        db.close()


def _record_failure(db: Database, ctx: CrawlContext, error: str) -> None:
    """Record a crawl failure: save result + increment failure counter."""
    _save_result(db, ctx.run_id, ctx.target_id, "failed", ctx.url, error=error)
    db.execute(
        "UPDATE crawl_targets SET consecutive_failures = consecutive_failures + 1 WHERE id = ?",
        (ctx.target_id,),
    )
    db.commit()


def _to_dict(outcome: CrawlOutcome) -> dict:
    """Convert CrawlOutcome to dict for backward compatibility with run functions."""
    return {
        "target_id": outcome.target_id,
        "name": outcome.name,
        "state_code": outcome.state_code,
        "doc_type": outcome.doc_type,
        "status": outcome.status,
        "fees": outcome.fees,
        "staged": outcome.staged,
        "flagged": outcome.flagged,
        "message": outcome.message,
    }


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
