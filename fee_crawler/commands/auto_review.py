"""Intelligent auto-review of staged and flagged fees.

Uses per-category amount bounds + confidence scores to auto-approve
fees within normal ranges and auto-reject clear errors. Remaining
fees stay for manual review.
"""

from __future__ import annotations

from fee_crawler.config import Config
from fee_crawler.db import Database
from fee_crawler.fee_amount_rules import FEE_AMOUNT_RULES, FALLBACK_RULES, NON_FEE_SUBSTRINGS


def run(db: Database, config: Config, *, dry_run: bool = False) -> None:
    """Auto-review staged and flagged fees."""
    auto_approved = 0
    auto_rejected = 0
    kept_staged = 0
    kept_flagged = 0

    # Process staged fees
    staged = db.fetchall(
        """SELECT id, fee_name, amount, extraction_confidence, fee_category
           FROM extracted_fees WHERE review_status = 'staged'"""
    )

    print(f"Processing {len(staged)} staged fees...")

    for row in staged:
        fid = row["id"]
        name = (row["fee_name"] or "").lower()
        amount = row["amount"]
        conf = row["extraction_confidence"]
        cat = row["fee_category"]

        action = _decide(name, amount, conf, cat)

        if action == "approve":
            if not dry_run:
                db.execute("UPDATE extracted_fees SET review_status = 'approved' WHERE id = ?", (fid,))
            auto_approved += 1
        elif action == "reject":
            if not dry_run:
                db.execute("UPDATE extracted_fees SET review_status = 'rejected' WHERE id = ?", (fid,))
            auto_rejected += 1
        else:
            kept_staged += 1

    # Process flagged fees
    flagged = db.fetchall(
        """SELECT id, fee_name, amount, extraction_confidence, fee_category
           FROM extracted_fees WHERE review_status = 'flagged'"""
    )

    print(f"Processing {len(flagged)} flagged fees...")

    for row in flagged:
        fid = row["id"]
        name = (row["fee_name"] or "").lower()
        amount = row["amount"]
        conf = row["extraction_confidence"]
        cat = row["fee_category"]

        action = _decide_flagged(name, amount, conf, cat)

        if action == "reject":
            if not dry_run:
                db.execute("UPDATE extracted_fees SET review_status = 'rejected' WHERE id = ?", (fid,))
            auto_rejected += 1
        else:
            kept_flagged += 1

    if not dry_run:
        db.commit()

    prefix = "[DRY RUN] " if dry_run else ""
    print(f"\n{prefix}Auto-Review Complete:")
    print(f"  Auto-approved: {auto_approved:,}")
    print(f"  Auto-rejected: {auto_rejected:,}")
    print(f"  Still staged: {kept_staged:,}")
    print(f"  Still flagged: {kept_flagged:,}")

    if not dry_run:
        for status in ["approved", "staged", "flagged", "rejected"]:
            cnt = db.fetchone(f"SELECT COUNT(*) as c FROM extracted_fees WHERE review_status = '{status}'")
            print(f"  Total {status}: {cnt['c']:,}")


def _decide(name: str, amount: float | None, conf: float | None, cat: str | None) -> str:
    """Decide action for a staged fee: 'approve', 'reject', or 'keep'."""

    # Reject: non-fee content (minimum balance requirements, APY, etc.)
    if any(sub in name for sub in NON_FEE_SUBSTRINGS):
        return "reject"

    # Category-based rules
    if cat and cat in FEE_AMOUNT_RULES:
        min_amt, max_amt, hard_ceiling, allows_zero = FEE_AMOUNT_RULES[cat]

        # Reject: exceeds hard ceiling
        if amount is not None and amount > hard_ceiling:
            return "reject"

        # Reject: negative
        if amount is not None and amount < 0:
            return "reject"

        # Approve: high confidence + within normal range
        if conf and conf >= 0.85:
            if amount is None and allows_zero:
                return "approve"
            if amount is not None and amount == 0 and allows_zero:
                return "approve"
            if amount is not None and min_amt <= amount <= max_amt:
                return "approve"

    # Approve: very high confidence + reasonable amount (no category rules)
    if conf and conf >= 0.95 and amount is not None and 0 <= amount < 100:
        return "approve"

    return "keep"


def _decide_flagged(name: str, amount: float | None, conf: float | None, cat: str | None) -> str:
    """Decide action for a flagged fee: 'reject' or 'keep'."""

    # Reject: non-fee content
    if any(sub in name for sub in NON_FEE_SUBSTRINGS):
        return "reject"

    # Reject: hard ceiling exceeded
    if cat and cat in FEE_AMOUNT_RULES:
        _, _, hard_ceiling, _ = FEE_AMOUNT_RULES[cat]
        if amount is not None and amount > hard_ceiling:
            return "reject"

    # Reject: negative
    if amount is not None and amount < 0:
        return "reject"

    return "keep"
