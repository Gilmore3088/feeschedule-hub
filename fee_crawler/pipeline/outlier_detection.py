"""Statistical outlier detection for extracted fees.

Cross-institutional validation to catch extraction errors at scale.
Flags amounts that are statistically improbable based on national data.
"""

import logging
from dataclasses import dataclass

from fee_crawler.db import Database

logger = logging.getLogger(__name__)

# IQR multiplier for outlier detection
_IQR_MULTIPLIER = 3.0

# Decimal error detection: if amount is 10x or 100x the median
_DECIMAL_MULTIPLIERS = [10, 100]

# Known fee categories where percentages are sometimes confused with dollars
_PERCENTAGE_CATEGORIES = {
    "card_foreign_txn",
    "card_balance_transfer",
    "card_cash_advance",
}


@dataclass
class OutlierFlag:
    """A detected outlier for review."""

    fee_id: int
    crawl_target_id: int
    fee_category: str
    amount: float
    flag_type: str  # statistical_outlier | decimal_error | percentage_confusion
    detail: str
    median: float
    p25: float
    p75: float


def _compute_category_stats(db: Database, category: str) -> dict | None:
    """Compute P25, median, P75 for a fee category from approved/staged fees."""
    rows = db.fetchall(
        """SELECT amount FROM extracted_fees
           WHERE fee_category = ? AND amount IS NOT NULL AND amount > 0
             AND review_status IN ('staged', 'approved')
           ORDER BY amount""",
        (category,),
    )
    if len(rows) < 5:
        return None  # Not enough data for meaningful stats

    amounts = [r["amount"] for r in rows]
    n = len(amounts)
    p25 = amounts[n // 4]
    median = amounts[n // 2]
    p75 = amounts[3 * n // 4]
    iqr = p75 - p25

    return {
        "p25": p25,
        "median": median,
        "p75": p75,
        "iqr": iqr,
        "count": n,
        "lower_bound": p25 - _IQR_MULTIPLIER * iqr,
        "upper_bound": p75 + _IQR_MULTIPLIER * iqr,
    }


def detect_outliers(
    db: Database,
    *,
    categories: list[str] | None = None,
    limit: int | None = None,
) -> list[OutlierFlag]:
    """Scan extracted fees for statistical outliers.

    Args:
        db: Database connection.
        categories: Specific categories to check (all if None).
        limit: Max outliers to return.

    Returns list of OutlierFlag objects for review.
    """
    # Get categories with enough data
    if categories:
        cat_rows = [{"fee_category": c} for c in categories]
    else:
        cat_rows = db.fetchall(
            """SELECT DISTINCT fee_category FROM extracted_fees
               WHERE fee_category IS NOT NULL AND amount IS NOT NULL
               GROUP BY fee_category HAVING COUNT(*) >= 5"""
        )

    outliers: list[OutlierFlag] = []

    for row in cat_rows:
        category = row["fee_category"]
        stats = _compute_category_stats(db, category)
        if stats is None:
            continue

        # Find fees outside the IQR bounds
        suspect_fees = db.fetchall(
            """SELECT id, crawl_target_id, amount FROM extracted_fees
               WHERE fee_category = ? AND amount IS NOT NULL AND amount > 0
                 AND review_status IN ('pending', 'staged', 'flagged')
                 AND (amount < ? OR amount > ?)""",
            (category, stats["lower_bound"], stats["upper_bound"]),
        )

        for fee in suspect_fees:
            amount = fee["amount"]
            flag_type = "statistical_outlier"
            detail = (
                f"Amount ${amount:.2f} is outside IQR bounds "
                f"[${stats['lower_bound']:.2f}, ${stats['upper_bound']:.2f}] "
                f"(median=${stats['median']:.2f}, n={stats['count']})"
            )

            # Check for decimal errors (10x or 100x the median)
            for mult in _DECIMAL_MULTIPLIERS:
                if abs(amount - stats["median"] * mult) < 0.01:
                    flag_type = "decimal_error"
                    detail = (
                        f"Amount ${amount:.2f} appears to be {mult}x the median "
                        f"${stats['median']:.2f} (likely decimal error)"
                    )
                    break
                if stats["median"] > 0 and abs(amount - stats["median"] / mult) < 0.01:
                    flag_type = "decimal_error"
                    detail = (
                        f"Amount ${amount:.2f} appears to be 1/{mult} of the median "
                        f"${stats['median']:.2f} (likely decimal error)"
                    )
                    break

            # Check for percentage confusion
            if category in _PERCENTAGE_CATEGORIES and amount < 1.0:
                flag_type = "percentage_confusion"
                detail = (
                    f"Amount ${amount:.2f} in {category} looks like a percentage "
                    f"(median=${stats['median']:.2f}). Should this be {amount * 100:.0f}%?"
                )

            outliers.append(OutlierFlag(
                fee_id=fee["id"],
                crawl_target_id=fee["crawl_target_id"],
                fee_category=category,
                amount=amount,
                flag_type=flag_type,
                detail=detail,
                median=stats["median"],
                p25=stats["p25"],
                p75=stats["p75"],
            ))

    if limit:
        outliers = outliers[:limit]

    return outliers


def run_outlier_detection(db: Database, *, auto_flag: bool = True) -> None:
    """Run outlier detection and flag/reject outliers.

    Always takes action:
    - decimal_error → auto-rejected
    - statistical_outlier → flagged for review (even if previously approved)

    Args:
        db: Database connection.
        auto_flag: Legacy param, always True now.
    """
    outliers = detect_outliers(db)

    if not outliers:
        print("No statistical outliers detected.")
        return

    print(f"Detected {len(outliers)} statistical outliers:")

    by_type: dict[str, int] = {}
    auto_rejected = 0
    newly_flagged = 0
    for o in outliers:
        by_type[o.flag_type] = by_type.get(o.flag_type, 0) + 1
        # Always apply flags (not just when auto_flag is set)
        import json
        existing = db.fetchone(
            "SELECT validation_flags, review_status FROM extracted_fees WHERE id = ?",
            (o.fee_id,),
        )
        if not existing or existing["review_status"] == "rejected":
            continue

        flags = []
        if existing["validation_flags"]:
            try:
                flags = json.loads(existing["validation_flags"])
            except json.JSONDecodeError:
                pass
        flags.append({
            "rule": o.flag_type,
            "severity": "error" if o.flag_type == "decimal_error" else "warning",
            "message": o.detail,
        })

        # Decimal errors → auto-reject (clearly wrong data)
        # Statistical outliers → flag for review (including approved ones)
        if o.flag_type == "decimal_error":
            new_status = "rejected"
            auto_rejected += 1
        else:
            new_status = "flagged"
            newly_flagged += 1

        db.execute(
            "UPDATE extracted_fees SET review_status = ?, validation_flags = ? WHERE id = ?",
            (new_status, json.dumps(flags), o.fee_id),
        )

    db.commit()

    for flag_type, count in sorted(by_type.items()):
        print(f"  {flag_type}: {count}")
    print(f"  Total: {len(outliers)}")
    print(f"  Auto-rejected (decimal errors): {auto_rejected}")
    print(f"  Flagged for review: {newly_flagged}")
