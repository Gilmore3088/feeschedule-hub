"""Discover fee schedule URLs for institutions in crawl_targets.

Iterates through institutions that have a website_url but no fee_schedule_url,
probes each site for fee schedule pages/PDFs, and updates the database.

Supports:
- Discovery cache: tracks which methods have been tried per institution
- Cascade: only tries methods not yet attempted or expired (30-day TTL)
- Search API fallback: SerpAPI as last resort (gated by SERPAPI_API_KEY)
- Concurrent discovery via --workers flag
"""

import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.parse import urlparse

from fee_crawler.config import Config
from fee_crawler.db import Database, get_worker_db
from fee_crawler.pipeline.rate_limiter import DomainRateLimiter
from fee_crawler.pipeline.search_discovery import SearchDiscoverer
from fee_crawler.pipeline.url_discoverer import DISCOVERY_METHODS, UrlDiscoverer


_CACHE_TTL_DAYS = 30


def _get_skip_methods(db: Database, target_id: int, force: bool = False) -> set[str]:
    """Check discovery_cache for recently-tried methods that can be skipped.

    Returns a set of method names that have been tried within the TTL
    and returned 'not_found' (so we don't need to retry them yet).
    Methods that returned 'error' are also retried.
    """
    if force:
        return set()

    rows = db.fetchall(
        """SELECT discovery_method, result
           FROM discovery_cache
           WHERE crawl_target_id = ?
             AND attempted_at > datetime('now', ?)""",
        (target_id, f"-{_CACHE_TTL_DAYS} days"),
    )

    skip = set()
    for row in rows:
        # Only skip methods that definitively returned not_found
        # Retry methods that errored (they might work now)
        if row["result"] == "not_found":
            skip.add(row["discovery_method"])
    return skip


def _save_discovery_attempt(
    db: Database,
    target_id: int,
    method: str,
    result: str,
    found_url: str | None = None,
    error: str | None = None,
) -> None:
    """Record a discovery attempt in the cache (upsert)."""
    db.execute(
        """INSERT INTO discovery_cache
           (crawl_target_id, discovery_method, result, found_url, error_message)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(crawl_target_id, discovery_method) DO UPDATE SET
             attempted_at = datetime('now'),
             result = excluded.result,
             found_url = excluded.found_url,
             error_message = excluded.error_message""",
        (target_id, method, result, found_url, error),
    )


def _discover_one(
    target: dict,
    config: Config,
    concurrent: bool = False,
    force: bool = False,
    max_search_cost: float = 25.0,
    search_cost_so_far: float = 0.0,
    rate_limiter: DomainRateLimiter | None = None,
) -> tuple[dict, object, float]:
    """Worker function: discover fee schedule URL for a single institution.

    Creates its own UrlDiscoverer and Database connection (thread-safe).
    Returns (target_dict, DiscoveryResult, search_cost_incurred) for the caller.
    """
    target_id = target["id"]
    url = target["website_url"]
    search_cost = 0.0

    db = get_worker_db(config)
    disc_config = config.model_copy()
    if concurrent and not rate_limiter:
        # Only reduce delay if no rate limiter is managing timing
        disc_config.crawl = config.crawl.model_copy(update={"delay_seconds": 0.3})
    discoverer = UrlDiscoverer(disc_config, rate_limiter=rate_limiter)

    try:
        # Check which methods to skip based on cache
        skip_methods = _get_skip_methods(db, target_id, force)

        result = discoverer.discover(url, skip_methods=skip_methods)

        # Record each tried method in the cache
        for method in result.methods_tried:
            if result.found and result.method == method:
                _save_discovery_attempt(
                    db, target_id, method, "found", found_url=result.fee_schedule_url
                )
            else:
                _save_discovery_attempt(db, target_id, method, "not_found")

        # If standard discovery failed, try search API as last resort
        if not result.found and "search_api" not in skip_methods:
            domain = urlparse(url).netloc
            if domain:
                search_disc = SearchDiscoverer(db)
                if search_disc.available:
                    search_result = search_disc.discover(
                        target_id, domain,
                        max_cost=max_search_cost,
                        cost_so_far=search_cost_so_far,
                    )
                    search_cost = search_result.cost_incurred
                    if search_result.found and search_result.url:
                        result.found = True
                        result.fee_schedule_url = search_result.url
                        result.method = "search_api"
                        result.confidence = 0.70
                        # Determine doc type from URL
                        result.document_type = (
                            "pdf" if search_result.url.lower().endswith(".pdf") else "html"
                        )
                    result.methods_tried.append("search_api")
                    search_disc.close()

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
        return target, result, search_cost

    except Exception as e:
        db.execute(
            """UPDATE crawl_targets
               SET last_crawl_at = datetime('now'),
                   consecutive_failures = consecutive_failures + 1
               WHERE id = ?""",
            (target_id,),
        )
        db.commit()

        from fee_crawler.pipeline.url_discoverer import DiscoveryResult
        return target, DiscoveryResult(error=str(e)), 0.0
    finally:
        discoverer.close()
        # Worker DB is thread-local; no close needed


def run(
    db: Database,
    config: Config,
    *,
    limit: int | None = None,
    state: str | None = None,
    source: str | None = None,
    force: bool = False,
    workers: int = 1,
    max_search_cost: float = 25.0,
) -> None:
    """Run URL discovery for institutions missing fee schedule URLs.

    Args:
        db: Database connection (used for initial query; workers create their own).
        config: Application config.
        limit: Max institutions to process (for testing).
        state: Filter by state code (e.g., "TX", "CA").
        source: Filter by source ("fdic" or "ncua").
        force: Re-discover even if fee_schedule_url already set. Also retries cached methods.
        workers: Number of concurrent worker threads.
        max_search_cost: Maximum budget for search API queries (default $25).
    """
    # Build query for institutions to process
    where_clauses = ["website_url IS NOT NULL AND website_url != ''", "status = 'active'"]
    params: list = []

    if not force:
        where_clauses.append("fee_schedule_url IS NULL")

    if state:
        where_clauses.append("state_code = ?")
        params.append(state.upper())

    if source:
        where_clauses.append("source = ?")
        params.append(source.lower())

    # Exclude institutions already attempted (in discovery_cache) unless --force
    if not force:
        where_clauses.append(
            "id NOT IN (SELECT DISTINCT crawl_target_id FROM discovery_cache)"
        )

    where_sql = " AND ".join(where_clauses)
    order_sql = "ORDER BY asset_size DESC NULLS LAST"

    # Count total available before applying limit
    count_row = db.fetchone(
        f"SELECT COUNT(*) as cnt FROM crawl_targets WHERE {where_sql}",
        tuple(params),
    )
    available = count_row["cnt"] if count_row else 0

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

    if available == 0:
        print("No institutions to process (all have fee_schedule_url or no website_url).")
        return

    # Convert RealDictRow rows to plain dicts (needed for pickling across threads)
    targets = [dict(t) for t in targets]

    scope = state.upper() if state else "All states"
    if limit and limit > 0 and available > total:
        print(f"{scope}: {available} available, processing {total} (--limit {limit}), {available - total} remaining")
    else:
        print(f"{scope}: {available} available, processing all {total}")
    print()
    print(f"  Workers: {workers}")
    if workers == 1:
        print(f"  Delay: {config.crawl.delay_seconds}s between requests")
    else:
        print(f"  Delay: 0.3s per worker (concurrent mode, different domains)")
    if source:
        print(f"  Source filter: {source}")
    print()

    # Check if search API is available
    import os
    search_available = bool(os.environ.get("SERPAPI_API_KEY"))
    if search_available:
        print(f"  Search API: enabled (budget ${max_search_cost:.0f}/run)")

    # Create shared rate limiter for polite crawling
    limiter = DomainRateLimiter(
        default_delay=config.crawl.delay_seconds,
        max_concurrent_domains=min(workers * 2, 20),
    )
    print(f"  Rate limit: {config.crawl.delay_seconds}s/domain, max {min(workers * 2, 20)} concurrent domains")

    if workers <= 1:
        _run_serial(targets, config, total, force, max_search_cost, limiter)
    else:
        _run_concurrent(targets, config, total, workers, force, max_search_cost, limiter)


def _run_serial(
    targets: list[dict],
    config: Config,
    total: int,
    force: bool = False,
    max_search_cost: float = 25.0,
    rate_limiter: DomainRateLimiter | None = None,
) -> None:
    """Serial discovery loop with cache cascade and search fallback."""
    found_count = 0
    error_count = 0
    skip_count = 0
    total_search_cost = 0.0

    try:
        for i, target in enumerate(targets, 1):
            name = target["institution_name"]
            state_code = target["state_code"] or "??"
            assets = target["asset_size"]
            asset_str = f"${assets / 1_000:,.0f}M" if assets else "N/A"

            print(f"[{i}/{total}] {name[:45]:45s} ({state_code}) {asset_str:>10s}", end="  ")

            try:
                _target, result, search_cost = _discover_one(
                    target, config, concurrent=False, force=force,
                    max_search_cost=max_search_cost,
                    search_cost_so_far=total_search_cost,
                    rate_limiter=rate_limiter,
                )
                total_search_cost += search_cost
            except Exception as e:
                print(f"ERROR: {e}")
                error_count += 1
                continue

            if result.found and result.fee_schedule_url:
                found_count += 1
                methods_str = ",".join(result.methods_tried) if result.methods_tried else result.method
                print(
                    f"FOUND ({result.method}, {result.document_type}, "
                    f"conf={result.confidence:.0%}, pages={result.pages_checked})"
                )
            elif result.error:
                error_count += 1
                print(f"ERROR: {result.error} (pages={result.pages_checked})")
            else:
                skip_count += 1
                print(f"NOT FOUND (pages={result.pages_checked})")

            if i % 25 == 0:
                pct = found_count / i * 100
                cost_str = f" | Search: ${total_search_cost:.2f}" if total_search_cost > 0 else ""
                print(f"\n  --- Progress: {i}/{total} | Found: {found_count} ({pct:.0f}%) | Errors: {error_count}{cost_str} ---\n")

    except KeyboardInterrupt:
        print(f"\n\nInterrupted by user after processing.")

    _print_summary(found_count, error_count, skip_count, total, config, total_search_cost)


def _run_concurrent(
    targets: list[dict],
    config: Config,
    total: int,
    workers: int,
    force: bool = False,
    max_search_cost: float = 25.0,
    rate_limiter: DomainRateLimiter | None = None,
) -> None:
    """Concurrent discovery using ThreadPoolExecutor."""
    found_count = 0
    error_count = 0
    skip_count = 0
    completed = 0
    total_search_cost = 0.0
    start_time = time.time()

    try:
        with ThreadPoolExecutor(max_workers=workers) as executor:
            futures = {
                executor.submit(
                    _discover_one, target, config, True, force,
                    max_search_cost, 0.0,
                    rate_limiter=rate_limiter,
                ): target
                for target in targets
            }

            for future in as_completed(futures):
                completed += 1
                target, result, search_cost = future.result()
                total_search_cost += search_cost

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
                    if completed <= 10:
                        print(
                            f"[{completed}/{total}] {name[:45]:45s} ({state_code}) {asset_str:>10s}  "
                            f"NOT FOUND"
                        )

                if completed % 50 == 0:
                    elapsed = time.time() - start_time
                    rate = completed / elapsed * 3600
                    pct = found_count / completed * 100 if completed > 0 else 0
                    cost_str = f" | Search: ${total_search_cost:.2f}" if total_search_cost > 0 else ""
                    print(
                        f"\n  --- Progress: {completed}/{total} | "
                        f"Found: {found_count} ({pct:.0f}%) | "
                        f"Errors: {error_count} | "
                        f"Rate: {rate:.0f}/hr{cost_str} ---\n"
                    )

    except KeyboardInterrupt:
        print(f"\n\nInterrupted by user after {completed} institutions.")

    _print_summary(found_count, error_count, skip_count, total, config, total_search_cost)

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
    search_cost: float = 0.0,
) -> None:
    """Print final discovery summary."""
    processed = found_count + error_count + skip_count
    print(f"\nDiscovery complete:")
    print(f"  Processed: {processed}/{total}")
    print(f"  Found:     {found_count} ({found_count * 100 // max(processed, 1)}%)")
    print(f"  Not found: {skip_count}")
    print(f"  Errors:    {error_count}")
    if search_cost > 0:
        print(f"  Search API cost: ${search_cost:.2f}")

    # Show total database stats + remaining untouched
    db = Database(config)
    try:
        total_with_fee = db.fetchone(
            "SELECT COUNT(*) as cnt FROM crawl_targets WHERE fee_schedule_url IS NOT NULL AND fee_schedule_url != ''"
        )
        fee_count = total_with_fee["cnt"] if total_with_fee else 0
        total_all = db.count("crawl_targets")

        never_tried = db.fetchone(
            """SELECT COUNT(*) as cnt FROM crawl_targets
               WHERE (fee_schedule_url IS NULL OR fee_schedule_url = '')
               AND website_url IS NOT NULL AND website_url != ''
               AND id NOT IN (SELECT DISTINCT crawl_target_id FROM discovery_cache)"""
        )
        remaining = never_tried["cnt"] if never_tried else 0

        attempted_no_url = db.fetchone(
            """SELECT COUNT(*) as cnt FROM crawl_targets
               WHERE (fee_schedule_url IS NULL OR fee_schedule_url = '')
               AND id IN (SELECT DISTINCT crawl_target_id FROM discovery_cache)"""
        )
        tried_failed = attempted_no_url["cnt"] if attempted_no_url else 0

        print(f"\n  Total with fee URL: {fee_count}/{total_all} ({fee_count * 100 // max(total_all, 1)}%)")
        print(f"  Never attempted:   {remaining}")
        print(f"  Attempted, failed: {tried_failed}")
    finally:
        db.close()
