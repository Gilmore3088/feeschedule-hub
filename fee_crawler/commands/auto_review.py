"""Intelligent auto-review of staged and flagged fees.

Uses per-category amount bounds + confidence scores to auto-approve
fees within normal ranges and auto-reject clear errors. Remaining
fees stay for manual review.

Writes audit trail to fee_reviews for every status change.
"""

from __future__ import annotations

import json
import time

from fee_crawler.config import Config
from fee_crawler.db import Database
from fee_crawler.fee_amount_rules import FEE_AMOUNT_RULES, FALLBACK_RULES, NON_FEE_SUBSTRINGS

BATCH_SIZE = 500


def run(db: Database, config: Config, *, dry_run: bool = False) -> None:
    """Auto-review staged and flagged fees."""
    t0 = time.time()
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

    batch: list[tuple[str, int, str]] = []  # (action, fee_id, reason)

    for row in staged:
        fid = row["id"]
        name = (row["fee_name"] or "").lower()
        amount = row["amount"]
        conf = row["extraction_confidence"]
        cat = row["fee_category"]

        action = _decide(name, amount, conf, cat)

        if action == "approve":
            batch.append(("approved", fid, "auto-review: confidence + bounds check passed"))
            auto_approved += 1
        elif action == "reject":
            batch.append(("rejected", fid, "auto-review: failed bounds or non-fee content"))
            auto_rejected += 1
        else:
            kept_staged += 1

        if not dry_run and len(batch) >= BATCH_SIZE:
            _flush_batch(db, batch)
            batch = []

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
            batch.append(("rejected", fid, "auto-review: flagged fee failed bounds"))
            auto_rejected += 1
        else:
            kept_flagged += 1

        if not dry_run and len(batch) >= BATCH_SIZE:
            _flush_batch(db, batch)
            batch = []

    # Flush remaining
    if not dry_run and batch:
        _flush_batch(db, batch)

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

    # Structured result for job runner
    result = {
        "version": 1,
        "command": "auto-review",
        "status": "completed",
        "duration_s": round(time.time() - t0, 1),
        "processed": auto_approved + auto_rejected + kept_staged + kept_flagged,
        "succeeded": auto_approved + auto_rejected,
        "failed": 0,
        "skipped": kept_staged + kept_flagged,
        "auto_approved": auto_approved,
        "auto_rejected": auto_rejected,
        "kept_staged": kept_staged,
        "kept_flagged": kept_flagged,
    }
    print(f"##RESULT_JSON##{json.dumps(result)}")


def _flush_batch(db: Database, batch: list[tuple[str, int, str]]) -> None:
    """Write a batch of status changes + audit records in a single transaction."""
    db.execute("BEGIN IMMEDIATE")
    try:
        for new_status, fee_id, reason in batch:
            # Get current status for audit trail
            row = db.fetchone(
                "SELECT review_status FROM extracted_fees WHERE id = ?", (fee_id,)
            )
            if not row:
                continue
            prev_status = row["review_status"]

            db.execute(
                "UPDATE extracted_fees SET review_status = ? WHERE id = ?",
                (new_status, fee_id),
            )
            db.execute(
                """INSERT INTO fee_reviews
                   (fee_id, action, user_id, username, previous_status, new_status, notes)
                   VALUES (?, ?, 0, 'system', ?, ?, ?)""",
                (fee_id, f"auto_{new_status.rstrip('d')}", prev_status, new_status, reason),
            )
        db.commit()
    except Exception:
        db.execute("ROLLBACK")
        raise


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
