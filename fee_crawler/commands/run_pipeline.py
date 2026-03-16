"""Orchestrate the full pipeline: discover → crawl → categorize.

Designed for unattended cron execution with cost controls and logging.
"""

import logging
import os
import time
from datetime import datetime

import requests

from fee_crawler.config import Config
from fee_crawler.db import Database

logger = logging.getLogger(__name__)


def run(
    db: Database,
    config: Config,
    *,
    limit: int | None = None,
    workers: int = 4,
    max_llm_calls: int = 500,
    max_search_cost: float = 10.0,
    skip_discover: bool = False,
    skip_crawl: bool = False,
    skip_categorize: bool = False,
    state: str | None = None,
) -> dict:
    """Run the full pipeline with cost controls.

    Args:
        db: Database connection.
        config: Application config.
        limit: Max institutions per stage.
        workers: Concurrent worker threads.
        max_llm_calls: Max LLM API calls for crawl stage (cost control).
        max_search_cost: Max budget for search API in discovery ($).
        skip_discover: Skip URL discovery stage.
        skip_crawl: Skip crawl/extraction stage.
        skip_categorize: Skip batch categorization stage.
        state: Filter by state code.

    Returns dict with timing and counts for each stage.
    """
    results: dict = {
        "started_at": datetime.now().isoformat(),
        "stages": {},
    }

    run_start = time.monotonic()

    # Stage 1: Discover fee schedule URLs
    if not skip_discover:
        stage_start = time.monotonic()
        print("\n=== Stage 1: URL Discovery ===")
        try:
            from fee_crawler.commands.discover_urls import run as discover_run

            discover_run(
                db, config,
                limit=limit,
                state=state,
                workers=workers,
                max_search_cost=max_search_cost,
            )
            results["stages"]["discover"] = {
                "status": "success",
                "elapsed_s": round(time.monotonic() - stage_start, 1),
            }
        except Exception as e:
            logger.error("Discovery failed: %s", e)
            results["stages"]["discover"] = {
                "status": "failed",
                "error": str(e),
                "elapsed_s": round(time.monotonic() - stage_start, 1),
            }

    # Stage 2: Crawl and extract fees
    if not skip_crawl:
        stage_start = time.monotonic()
        print("\n=== Stage 2: Crawl & Extract ===")

        # Apply LLM call limit via the crawl limit
        crawl_limit = min(limit, max_llm_calls) if limit else max_llm_calls

        try:
            from fee_crawler.commands.crawl import run as crawl_run

            crawl_run(
                db, config,
                limit=crawl_limit,
                state=state,
                workers=workers,
                skip_with_fees=True,  # Smart: only crawl institutions without existing fees
            )
            results["stages"]["crawl"] = {
                "status": "success",
                "limit_applied": crawl_limit,
                "elapsed_s": round(time.monotonic() - stage_start, 1),
            }
        except Exception as e:
            logger.error("Crawl failed: %s", e)
            results["stages"]["crawl"] = {
                "status": "failed",
                "error": str(e),
                "elapsed_s": round(time.monotonic() - stage_start, 1),
            }

    # Stage 3: Batch categorize any uncategorized fees
    if not skip_categorize:
        stage_start = time.monotonic()
        print("\n=== Stage 3: Categorize Fees ===")
        try:
            from fee_crawler.commands.categorize_fees import run as categorize_run

            categorize_run(db, dry_run=False, force=False, limit=None)
            results["stages"]["categorize"] = {
                "status": "success",
                "elapsed_s": round(time.monotonic() - stage_start, 1),
            }
        except Exception as e:
            logger.error("Categorize failed: %s", e)
            results["stages"]["categorize"] = {
                "status": "failed",
                "error": str(e),
                "elapsed_s": round(time.monotonic() - stage_start, 1),
            }

    # Stage 4: Auto-review staged/flagged fees
    stage_start = time.monotonic()
    print("\n=== Stage 4: Auto-Review ===")
    try:
        from fee_crawler.commands.auto_review import run as review_run

        review_run(db, config)
        results["stages"]["auto_review"] = {
            "status": "success",
            "elapsed_s": round(time.monotonic() - stage_start, 1),
        }
    except Exception as e:
        logger.error("Auto-review failed: %s", e)
        results["stages"]["auto_review"] = {
            "status": "failed",
            "error": str(e),
            "elapsed_s": round(time.monotonic() - stage_start, 1),
        }

    total_elapsed = round(time.monotonic() - run_start, 1)
    results["total_elapsed_s"] = total_elapsed
    results["completed_at"] = datetime.now().isoformat()

    # Summary
    print(f"\n=== Pipeline Complete ({total_elapsed}s) ===")
    for stage_name, stage_result in results.get("stages", {}).items():
        status = stage_result.get("status", "unknown")
        elapsed = stage_result.get("elapsed_s", 0)
        print(f"  {stage_name}: {status} ({elapsed}s)")

    # Coverage snapshot
    total = db.fetchone("SELECT COUNT(*) as cnt FROM crawl_targets")
    with_fees = db.fetchone(
        "SELECT COUNT(DISTINCT crawl_target_id) as cnt FROM extracted_fees"
    )
    if total and with_fees:
        pct = with_fees["cnt"] / total["cnt"] * 100 if total["cnt"] > 0 else 0
        print(f"\n  Coverage: {with_fees['cnt']:,} / {total['cnt']:,} ({pct:.1f}%)")

    # Post-crawl: revalidate Next.js cache
    _revalidate_cache()

    return results


def _revalidate_cache() -> None:
    """Call the Next.js revalidation endpoint to bust stale caches."""
    base_url = os.environ.get("BFI_APP_URL", "").rstrip("/")
    token = os.environ.get("BFI_REVALIDATE_TOKEN", "")

    if not base_url or not token:
        logger.info("Skipping cache revalidation (BFI_APP_URL or BFI_REVALIDATE_TOKEN not set)")
        return

    url = f"{base_url}/api/revalidate"
    paths = ["/", "/fees", "/admin"]

    try:
        resp = requests.post(
            url,
            json={"paths": paths},
            headers={"Authorization": f"Bearer {token}"},
            timeout=10,
        )
        if resp.ok:
            print(f"  Cache revalidated: {paths}")
        else:
            logger.warning("Revalidation returned %d: %s", resp.status_code, resp.text)
    except requests.RequestException as e:
        logger.warning("Cache revalidation failed: %s", e)
