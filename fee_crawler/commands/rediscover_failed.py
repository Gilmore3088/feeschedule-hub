"""Clear bad URLs and re-discover for institutions with failed crawls.

Targets institutions where:
1. Last crawl failed pre-screening (wrong page discovered)
2. Last crawl got HTTP 403/404 (dead URL)
3. Consecutive failures >= threshold

Clears their fee_schedule_url and discovery_cache so discover can try
fresh methods including search API fallback.
"""

from __future__ import annotations

import json
import time

from fee_crawler.config import Config
from fee_crawler.db import Database


def run(
    db: Database,
    config: Config,
    *,
    state: str | None = None,
    limit: int | None = None,
    dry_run: bool = False,
    include_http_errors: bool = True,
    include_prescreen: bool = True,
    min_failures: int = 0,
) -> None:
    """Clear bad URLs and prepare institutions for rediscovery."""
    t0 = time.time()

    conditions = []
    params: list = []

    # Must have a fee_schedule_url to clear
    conditions.append("ct.fee_schedule_url IS NOT NULL")
    conditions.append("ct.status = 'active'")

    # Build OR conditions for different failure types
    failure_conditions = []

    if include_prescreen:
        failure_conditions.append(
            "ct.failure_reason IN ('no_dollar_amounts', 'too_few_fee_keywords', "
            "'not_fee_related', 'unknown', 'scanned_pdf_no_ocr', 'empty_document')"
        )

    if include_http_errors:
        failure_conditions.append(
            "ct.id IN (SELECT DISTINCT crawl_target_id FROM crawl_results "
            "WHERE error_message LIKE '%403%' OR error_message LIKE '%404%')"
        )

    if min_failures > 0:
        failure_conditions.append(f"ct.consecutive_failures >= {min_failures}")

    if not failure_conditions:
        print("No failure types selected.")
        return

    conditions.append(f"({' OR '.join(failure_conditions)})")

    if state:
        conditions.append("ct.state_code = ?")
        params.append(state.upper())

    where_sql = " AND ".join(conditions)
    limit_sql = f" LIMIT {limit}" if limit else ""

    # Find affected institutions
    query = f"""
        SELECT ct.id, ct.institution_name, ct.state_code, ct.fee_schedule_url,
               ct.failure_reason, ct.consecutive_failures
        FROM crawl_targets ct
        WHERE {where_sql}
        ORDER BY ct.asset_size DESC NULLS LAST
        {limit_sql}
    """
    targets = db.fetchall(query, tuple(params))

    if not targets:
        print("No institutions found matching criteria.")
        return

    # Categorize what we found
    prescreen_count = sum(1 for t in targets if t["failure_reason"])
    http_count = len(targets) - prescreen_count

    print(f"Found {len(targets)} institutions with bad URLs:")
    print(f"  Pre-screen failures: {prescreen_count}")
    print(f"  HTTP errors / other: {http_count}")
    if state:
        print(f"  State filter: {state.upper()}")
    print()

    # Show sample
    for t in targets[:10]:
        reason = t["failure_reason"] or "http_error"
        print(f"  {t['institution_name'][:40]:<40s} ({t['state_code']}) {reason}")
    if len(targets) > 10:
        print(f"  ... and {len(targets) - 10} more")

    if dry_run:
        print(f"\n[DRY RUN] Would clear {len(targets)} URLs and discovery caches.")
        return

    # Clear fee_schedule_url and discovery_cache
    target_ids = [t["id"] for t in targets]
    cleared_urls = 0
    cleared_cache = 0

    for tid in target_ids:
        db.execute(
            """UPDATE crawl_targets
               SET fee_schedule_url = NULL, document_type = NULL,
                   failure_reason = NULL, consecutive_failures = 0,
                   last_content_hash = NULL
               WHERE id = ?""",
            (tid,),
        )
        cleared_urls += 1

        # Clear discovery cache so all methods are retried
        rows_deleted = db.execute(
            "DELETE FROM discovery_cache WHERE crawl_target_id = ?",
            (tid,),
        ).rowcount
        cleared_cache += rows_deleted

    db.commit()

    elapsed = time.time() - t0
    print(f"\nCleared {cleared_urls} URLs and {cleared_cache} cache entries in {elapsed:.1f}s")
    print(f"These institutions are now ready for: discover {'--state ' + state.upper() if state else ''}")
    print(f"Then: crawl {'--state ' + state.upper() if state else ''}")

    result = {
        "version": 1,
        "command": "rediscover-failed",
        "status": "completed",
        "duration_s": round(elapsed, 1),
        "processed": len(targets),
        "urls_cleared": cleared_urls,
        "cache_cleared": cleared_cache,
        "prescreen_failures": prescreen_count,
        "http_errors": http_count,
    }
    from fee_crawler.job_result import emit_result
    emit_result(result)
