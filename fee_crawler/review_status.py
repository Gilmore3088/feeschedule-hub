"""Review status state machine for extracted fees.

Centralizes all valid status transitions and provides a single function
for changing fee status with audit trail. Every code path that mutates
review_status should go through transition_fee_status().
"""

from __future__ import annotations

from enum import StrEnum

from fee_crawler.db import Database


class ReviewStatus(StrEnum):
    PENDING = "pending"
    STAGED = "staged"
    FLAGGED = "flagged"
    APPROVED = "approved"
    REJECTED = "rejected"


class TransitionContext(StrEnum):
    EXTRACTION = "extraction"
    REVIEW = "review"
    RECRAWL = "recrawl"
    OUTLIER = "outlier"
    DECIMAL_ERROR = "decimal_error"
    MANUAL = "manual"


VALID_TRANSITIONS: dict[ReviewStatus, set[ReviewStatus]] = {
    ReviewStatus.PENDING: {
        ReviewStatus.STAGED,
        ReviewStatus.FLAGGED,
        ReviewStatus.APPROVED,
        ReviewStatus.REJECTED,
    },
    ReviewStatus.STAGED: {
        ReviewStatus.APPROVED,
        ReviewStatus.REJECTED,
        ReviewStatus.FLAGGED,
    },
    ReviewStatus.FLAGGED: {
        ReviewStatus.APPROVED,
        ReviewStatus.REJECTED,
        ReviewStatus.STAGED,
    },
    ReviewStatus.APPROVED: {
        ReviewStatus.STAGED,
    },
    ReviewStatus.REJECTED: {
        ReviewStatus.PENDING,
    },
}


def can_transition(
    current: ReviewStatus | str,
    target: ReviewStatus | str,
    actor: str = "system",
    context: TransitionContext | str = TransitionContext.REVIEW,
) -> bool:
    """Check if a status transition is valid.

    Manual approvals are protected from automated demotion unless the
    context is a re-crawl price change or a decimal error detection.
    """
    current = ReviewStatus(current)
    target = ReviewStatus(target)
    context = TransitionContext(context)

    if target not in VALID_TRANSITIONS.get(current, set()):
        return False

    if current == ReviewStatus.APPROVED and actor == "system":
        return context in (TransitionContext.RECRAWL, TransitionContext.DECIMAL_ERROR)

    return True


def transition_fee_status(
    db: Database,
    fee_id: int,
    current: str,
    target: str,
    actor: str,
    context: str,
    notes: str = "",
) -> bool:
    """Transition fee status and write audit trail. Returns True on success."""
    if not can_transition(current, target, actor, context):
        return False

    db.execute(
        "UPDATE extracted_fees SET review_status = ? WHERE id = ?",
        (target, fee_id),
    )
    db.execute(
        """INSERT INTO fee_reviews
           (fee_id, action, username, previous_status, new_status, notes, created_at)
           VALUES (?, 'status_change', ?, ?, ?, ?, datetime('now'))""",
        (fee_id, actor, current, target, notes),
    )
    return True
