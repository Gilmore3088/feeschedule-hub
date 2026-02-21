"""Data change detection for article regeneration.

Compares current fee statistics against the data_context stored in the most
recent article of a given type/category/district to decide if regeneration
is warranted.
"""

from __future__ import annotations

import json
import logging

from fee_crawler.db import Database

logger = logging.getLogger(__name__)

MEDIAN_CHANGE_THRESHOLD_PCT = 5.0
COUNT_CHANGE_THRESHOLD_PCT = 10.0


def _get_current_median_and_count(
    db: Database, fee_category: str, fed_district: int | None
) -> tuple[float | None, int]:
    """Query current median and institution count for a fee category."""
    if fed_district is not None:
        rows = db.execute(
            """SELECT ef.amount
               FROM extracted_fees ef
               JOIN crawl_targets ct ON ef.crawl_target_id = ct.id
               WHERE ef.fee_category = ?
                 AND ct.fed_district = ?
                 AND ef.review_status != 'rejected'
                 AND ef.amount IS NOT NULL
                 AND ef.amount > 0""",
            (fee_category, fed_district),
        ).fetchall()
    else:
        rows = db.execute(
            """SELECT ef.amount
               FROM extracted_fees ef
               WHERE ef.fee_category = ?
                 AND ef.review_status != 'rejected'
                 AND ef.amount IS NOT NULL
                 AND ef.amount > 0""",
            (fee_category,),
        ).fetchall()

    if not rows:
        return None, 0

    amounts = sorted(r["amount"] for r in rows)
    n = len(amounts)
    median = amounts[n // 2] if n % 2 else (amounts[n // 2 - 1] + amounts[n // 2]) / 2
    return median, n


def has_data_changed(
    article_type: str,
    fee_category: str | None,
    fed_district: int | None,
    db: Database,
) -> bool:
    """Check if fee data has changed enough to warrant article regeneration.

    Compares current national median (or district median) and institution count
    against the most recent article's stored data_context.

    Returns True if:
    - No previous article exists for this type/category/district
    - Median changed by more than MEDIAN_CHANGE_THRESHOLD_PCT (5%)
    - Institution count changed by more than COUNT_CHANGE_THRESHOLD_PCT (10%)
    """
    if not fee_category:
        return True  # charter_comparison has no category — always regenerate

    recent = db.execute(
        """SELECT data_context FROM articles
           WHERE article_type = ? AND fee_category = ?
             AND (fed_district IS ? OR (fed_district IS NULL AND ? IS NULL))
             AND status != 'rejected'
           ORDER BY generated_at DESC LIMIT 1""",
        (article_type, fee_category, fed_district, fed_district),
    ).fetchone()

    if not recent:
        return True

    try:
        old_ctx = json.loads(recent["data_context"])
    except (json.JSONDecodeError, TypeError):
        return True

    # Extract old median and count from data_context
    old_median = _extract_median(old_ctx)
    old_count = _extract_count(old_ctx)

    # Get current stats
    new_median, new_count = _get_current_median_and_count(db, fee_category, fed_district)

    if new_median is None:
        return False  # No data at all — nothing to generate

    # Compare medians
    if old_median and old_median > 0:
        pct_change = abs(new_median - old_median) / old_median * 100
        if pct_change > MEDIAN_CHANGE_THRESHOLD_PCT:
            logger.info(
                "  Median changed %.1f%% (%.2f -> %.2f) for %s/%s",
                pct_change, old_median, new_median, article_type, fee_category,
            )
            return True

    # Compare institution counts
    if old_count and old_count > 0:
        count_change = abs(new_count - old_count) / old_count * 100
        if count_change > COUNT_CHANGE_THRESHOLD_PCT:
            logger.info(
                "  Count changed %.1f%% (%d -> %d) for %s/%s",
                count_change, old_count, new_count, article_type, fee_category,
            )
            return True

    return False


def _extract_median(data_context: dict) -> float | None:
    """Extract national or district median from stored data_context."""
    # NationalBenchmarkData stores it in national.median
    national = data_context.get("national", {})
    if isinstance(national, dict) and national.get("median") is not None:
        return float(national["median"])

    # DistrictComparisonData stores it in district_stats.median
    district_stats = data_context.get("district_stats", {})
    if isinstance(district_stats, dict) and district_stats.get("median") is not None:
        return float(district_stats["median"])

    return None


def _extract_count(data_context: dict) -> int | None:
    """Extract institution count from stored data_context."""
    national = data_context.get("national", {})
    if isinstance(national, dict) and national.get("count") is not None:
        return int(national["count"])

    district_stats = data_context.get("district_stats", {})
    if isinstance(district_stats, dict) and district_stats.get("count") is not None:
        return int(district_stats["count"])

    return None
