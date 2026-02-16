"""Discover fee schedule URLs for institutions in crawl_targets.

Iterates through institutions that have a website_url but no fee_schedule_url,
probes each site for fee schedule pages/PDFs, and updates the database.
"""

import time

from fee_crawler.config import Config
from fee_crawler.db import Database
from fee_crawler.pipeline.url_discoverer import UrlDiscoverer


def run(
    db: Database,
    config: Config,
    *,
    limit: int | None = None,
    state: str | None = None,
    source: str | None = None,
    force: bool = False,
) -> None:
    """Run URL discovery for institutions missing fee schedule URLs.

    Args:
        db: Database connection.
        config: Application config.
        limit: Max institutions to process (for testing).
        state: Filter by state code (e.g., "TX", "CA").
        source: Filter by source ("fdic" or "ncua").
        force: Re-discover even if fee_schedule_url already set.
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
    limit_sql = f"LIMIT {limit}" if limit else ""

    query = f"""
        SELECT id, institution_name, website_url, state_code, asset_size
        FROM crawl_targets
        WHERE {where_sql}
        {order_sql}
        {limit_sql}
    """

    targets = db.fetchall(query, tuple(params))
    total = len(targets)

    if total == 0:
        print("No institutions to process (all have fee_schedule_url or no website_url).")
        return

    print(f"Discovering fee schedule URLs for {total} institutions...")
    print(f"  Delay: {config.crawl.delay_seconds}s between requests")
    if state:
        print(f"  State filter: {state.upper()}")
    if source:
        print(f"  Source filter: {source}")
    print()

    discoverer = UrlDiscoverer(config)

    found_count = 0
    error_count = 0
    skip_count = 0

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
                # Update last_crawl_at and increment failures
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

            # Progress summary every 25 institutions
            if i % 25 == 0:
                pct = found_count / i * 100
                print(f"\n  --- Progress: {i}/{total} | Found: {found_count} ({pct:.0f}%) | Errors: {error_count} ---\n")

    except KeyboardInterrupt:
        print(f"\n\nInterrupted by user after {i} institutions.")
    finally:
        discoverer.close()

    # Final summary
    processed = found_count + error_count + skip_count
    print(f"\nDiscovery complete:")
    print(f"  Processed: {processed}/{total}")
    print(f"  Found:     {found_count} ({found_count * 100 // max(processed, 1)}%)")
    print(f"  Not found: {skip_count}")
    print(f"  Errors:    {error_count}")

    # Show total database stats
    total_with_fee = db.fetchone(
        "SELECT COUNT(*) as cnt FROM crawl_targets WHERE fee_schedule_url IS NOT NULL"
    )
    fee_count = total_with_fee["cnt"] if total_with_fee else 0
    total_all = db.count("crawl_targets")
    print(f"\n  Total in DB with fee URL: {fee_count}/{total_all} ({fee_count * 100 // max(total_all, 1)}%)")
