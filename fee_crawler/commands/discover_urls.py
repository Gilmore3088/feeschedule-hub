"""Discover fee schedule URLs for institutions in crawl_targets.

Iterates through institutions that have a website_url but no fee_schedule_url,
probes each site for fee schedule pages/PDFs, and updates the database.

Supports concurrent discovery via --workers flag.
"""

import time
from concurrent.futures import ThreadPoolExecutor, as_completed

from fee_crawler.config import Config
from fee_crawler.db import Database
from fee_crawler.pipeline.url_discoverer import UrlDiscoverer


def _discover_one(
    target: dict,
    config: Config,
    concurrent: bool = False,
) -> tuple[dict, object]:
    """Worker function: discover fee schedule URL for a single institution.

    Creates its own UrlDiscoverer and Database connection (thread-safe).
    Returns (target_dict, DiscoveryResult) for the caller to aggregate.
    """
    target_id = target["id"]
    url = target["website_url"]

    db = Database(config)
    # Use shorter delay in concurrent mode (different domains, no conflict)
    disc_config = config.model_copy()
    if concurrent:
        disc_config.crawl = config.crawl.model_copy(update={"delay_seconds": 0.3})
    discoverer = UrlDiscoverer(disc_config)

    try:
        result = discoverer.discover(url)

        if result.found and result.fee_schedule_url:
            db.execute(
                """UPDATE crawl_targets
                   SET fee_schedule_url = ?,
                       document_type = ?,
                       last_crawl_at = datetime('now'),
                       last_success_at = datetime('now'),
                       consecutive_failures = 0
                   WHERE id = ?""",
                (result.fee_schedule_url, result.document_type, target_id),
            )
        elif result.error:
            db.execute(
                """UPDATE crawl_targets
                   SET last_crawl_at = datetime('now'),
                       consecutive_failures = consecutive_failures + 1
                   WHERE id = ?""",
                (target_id,),
            )
        else:
            db.execute(
                """UPDATE crawl_targets
                   SET last_crawl_at = datetime('now')
                   WHERE id = ?""",
                (target_id,),
            )
        db.commit()
        return target, result

    except Exception as e:
        # Catch all exceptions so one failure doesn't crash the pool
        db.execute(
            """UPDATE crawl_targets
               SET last_crawl_at = datetime('now'),
                   consecutive_failures = consecutive_failures + 1
               WHERE id = ?""",
            (target_id,),
        )
        db.commit()

        from fee_crawler.pipeline.url_discoverer import DiscoveryResult
        return target, DiscoveryResult(error=str(e))
    finally:
        discoverer.close()
        db.close()


def run(
    db: Database,
    config: Config,
    *,
    limit: int | None = None,
    state: str | None = None,
    source: str | None = None,
    force: bool = False,
    workers: int = 1,
) -> None:
    """Run URL discovery for institutions missing fee schedule URLs.

    Args:
        db: Database connection (used for initial query; workers create their own).
        config: Application config.
        limit: Max institutions to process (for testing).
        state: Filter by state code (e.g., "TX", "CA").
        source: Filter by source ("fdic" or "ncua").
        force: Re-discover even if fee_schedule_url already set.
        workers: Number of concurrent worker threads.
    """
    # Build query for institutions to process
    where_clauses = ["website_url IS NOT NULL", "status = 'active'"]
    params: list = []

    if not force:
        where_clauses.append("fee_schedule_url IS NULL")

    if state:
        where_clauses.append("state_code = ?")
        params.append(state.upper())

    if source:
        where_clauses.append("source = ?")
        params.append(source.lower())

    where_sql = " AND ".join(where_clauses)
    order_sql = "ORDER BY asset_size DESC NULLS LAST"

    query = f"""
        SELECT id, institution_name, website_url, state_code, asset_size
        FROM crawl_targets
        WHERE {where_sql}
        {order_sql}
    """
    if limit and limit > 0:
        query += " LIMIT ?"
        params.append(limit)

    targets = db.fetchall(query, tuple(params))
    total = len(targets)

    if total == 0:
        print("No institutions to process (all have fee_schedule_url or no website_url).")
        return

    # Convert sqlite3.Row objects to plain dicts (needed for pickling across threads)
    targets = [dict(t) for t in targets]

    print(f"Discovering fee schedule URLs for {total} institutions...")
    print(f"  Workers: {workers}")
    if workers == 1:
        print(f"  Delay: {config.crawl.delay_seconds}s between requests")
    else:
        print(f"  Delay: 0.3s per worker (concurrent mode, different domains)")
    if state:
        print(f"  State filter: {state.upper()}")
    if source:
        print(f"  Source filter: {source}")
    print()

    if workers <= 1:
        _run_serial(targets, config, total)
    else:
        _run_concurrent(targets, config, total, workers)


def _run_serial(targets: list[dict], config: Config, total: int) -> None:
    """Original serial discovery loop."""
    discoverer = UrlDiscoverer(config)

    found_count = 0
    error_count = 0
    skip_count = 0

    db = Database(config)
    try:
        for i, target in enumerate(targets, 1):
            name = target["institution_name"]
            url = target["website_url"]
            target_id = target["id"]
            state_code = target["state_code"] or "??"
            assets = target["asset_size"]
            asset_str = f"${assets / 1_000:,.0f}M" if assets else "N/A"

            print(f"[{i}/{total}] {name[:45]:45s} ({state_code}) {asset_str:>10s}", end="  ")

            try:
                result = discoverer.discover(url)
            except Exception as e:
                print(f"ERROR: {e}")
                error_count += 1
                db.execute(
                    """UPDATE crawl_targets
                       SET last_crawl_at = datetime('now'),
                           consecutive_failures = consecutive_failures + 1
                       WHERE id = ?""",
                    (target_id,),
                )
                db.commit()
                continue

            if result.found and result.fee_schedule_url:
                found_count += 1
                db.execute(
                    """UPDATE crawl_targets
                       SET fee_schedule_url = ?,
                           document_type = ?,
                           last_crawl_at = datetime('now'),
                           last_success_at = datetime('now'),
                           consecutive_failures = 0
                       WHERE id = ?""",
                    (result.fee_schedule_url, result.document_type, target_id),
                )
                db.commit()
                print(
                    f"FOUND ({result.method}, {result.document_type}, "
                    f"conf={result.confidence:.0%}, pages={result.pages_checked})"
                )
            elif result.error:
                error_count += 1
                db.execute(
                    """UPDATE crawl_targets
                       SET last_crawl_at = datetime('now'),
                           consecutive_failures = consecutive_failures + 1
                       WHERE id = ?""",
                    (target_id,),
                )
                db.commit()
                print(f"ERROR: {result.error} (pages={result.pages_checked})")
            else:
                skip_count += 1
                db.execute(
                    """UPDATE crawl_targets
                       SET last_crawl_at = datetime('now')
                       WHERE id = ?""",
                    (target_id,),
                )
                db.commit()
                print(f"NOT FOUND (pages={result.pages_checked})")

            if i % 25 == 0:
                pct = found_count / i * 100
                print(f"\n  --- Progress: {i}/{total} | Found: {found_count} ({pct:.0f}%) | Errors: {error_count} ---\n")

    except KeyboardInterrupt:
        print(f"\n\nInterrupted by user after processing.")
    finally:
        discoverer.close()
        db.close()

    _print_summary(found_count, error_count, skip_count, total, config)


def _run_concurrent(
    targets: list[dict], config: Config, total: int, workers: int
) -> None:
    """Concurrent discovery using ThreadPoolExecutor."""
    found_count = 0
    error_count = 0
    skip_count = 0
    completed = 0
    start_time = time.time()

    try:
        with ThreadPoolExecutor(max_workers=workers) as executor:
            futures = {
                executor.submit(_discover_one, target, config, True): target
                for target in targets
            }

            for future in as_completed(futures):
                completed += 1
                target, result = future.result()

                name = target["institution_name"]
                state_code = target["state_code"] or "??"
                assets = target["asset_size"]
                asset_str = f"${assets / 1_000:,.0f}M" if assets else "N/A"

                if result.found and result.fee_schedule_url:
                    found_count += 1
                    print(
                        f"[{completed}/{total}] {name[:45]:45s} ({state_code}) {asset_str:>10s}  "
                        f"FOUND ({result.method}, {result.document_type}, "
                        f"conf={result.confidence:.0%})"
                    )
                elif result.error:
                    error_count += 1
                    if completed <= 20 or "ERROR" not in str(result.error):
                        print(
                            f"[{completed}/{total}] {name[:45]:45s} ({state_code}) {asset_str:>10s}  "
                            f"ERROR: {str(result.error)[:60]}"
                        )
                else:
                    skip_count += 1
                    # Only print NOT FOUND for first 10 then suppress to reduce noise
                    if completed <= 10:
                        print(
                            f"[{completed}/{total}] {name[:45]:45s} ({state_code}) {asset_str:>10s}  "
                            f"NOT FOUND"
                        )

                # Progress summary every 50 institutions
                if completed % 50 == 0:
                    elapsed = time.time() - start_time
                    rate = completed / elapsed * 3600
                    pct = found_count / completed * 100 if completed > 0 else 0
                    print(
                        f"\n  --- Progress: {completed}/{total} | "
                        f"Found: {found_count} ({pct:.0f}%) | "
                        f"Errors: {error_count} | "
                        f"Rate: {rate:.0f}/hr ---\n"
                    )

    except KeyboardInterrupt:
        print(f"\n\nInterrupted by user after {completed} institutions.")

    _print_summary(found_count, error_count, skip_count, total, config)

    elapsed = time.time() - start_time
    if elapsed > 0 and completed > 0:
        rate = completed / elapsed * 3600
        print(f"\n  Elapsed: {elapsed / 60:.1f} min | Rate: {rate:.0f} institutions/hr")


def _print_summary(
    found_count: int,
    error_count: int,
    skip_count: int,
    total: int,
    config: Config,
) -> None:
    """Print final discovery summary."""
    processed = found_count + error_count + skip_count
    print(f"\nDiscovery complete:")
    print(f"  Processed: {processed}/{total}")
    print(f"  Found:     {found_count} ({found_count * 100 // max(processed, 1)}%)")
    print(f"  Not found: {skip_count}")
    print(f"  Errors:    {error_count}")

    # Show total database stats
    db = Database(config)
    try:
        total_with_fee = db.fetchone(
            "SELECT COUNT(*) as cnt FROM crawl_targets WHERE fee_schedule_url IS NOT NULL"
        )
        fee_count = total_with_fee["cnt"] if total_with_fee else 0
        total_all = db.count("crawl_targets")
        print(f"\n  Total in DB with fee URL: {fee_count}/{total_all} ({fee_count * 100 // max(total_all, 1)}%)")
    finally:
        db.close()
