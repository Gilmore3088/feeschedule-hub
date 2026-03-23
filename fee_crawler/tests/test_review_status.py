"""Tests for the review status state machine."""

import pytest

from fee_crawler.review_status import (
    ReviewStatus,
    TransitionContext,
    can_transition,
)


class TestCanTransition:
    """Test valid and invalid status transitions."""

    def test_pending_to_staged(self):
        assert can_transition("pending", "staged") is True

    def test_pending_to_approved(self):
        assert can_transition("pending", "approved") is True

    def test_pending_to_flagged(self):
        assert can_transition("pending", "flagged") is True

    def test_pending_to_rejected(self):
        assert can_transition("pending", "rejected") is True

    def test_staged_to_approved(self):
        assert can_transition("staged", "approved") is True

    def test_staged_to_rejected(self):
        assert can_transition("staged", "rejected") is True

    def test_staged_to_flagged(self):
        assert can_transition("staged", "flagged") is True

    def test_flagged_to_approved(self):
        assert can_transition("flagged", "approved") is True

    def test_flagged_to_rejected(self):
        assert can_transition("flagged", "rejected") is True

    def test_rejected_to_pending(self):
        assert can_transition("rejected", "pending") is True

    # Invalid transitions
    def test_rejected_to_approved(self):
        assert can_transition("rejected", "approved") is False

    def test_rejected_to_staged(self):
        assert can_transition("rejected", "staged") is False

    def test_approved_to_rejected(self):
        assert can_transition("approved", "rejected") is False

    def test_approved_to_flagged(self):
        assert can_transition("approved", "flagged") is False


class TestManualProtection:
    """Test that manual approvals are protected from system demotion."""

    def test_system_cannot_demote_approved_via_review(self):
        assert can_transition(
            "approved", "staged", actor="system", context="review"
        ) is False

    def test_system_cannot_demote_approved_via_outlier(self):
        assert can_transition(
            "approved", "staged", actor="system", context="outlier"
        ) is False

    def test_system_can_demote_approved_via_recrawl(self):
        assert can_transition(
            "approved", "staged", actor="system", context="recrawl"
        ) is True

    def test_system_can_demote_approved_via_decimal_error(self):
        assert can_transition(
            "approved", "staged", actor="system", context="decimal_error"
        ) is True

    def test_human_can_demote_approved(self):
        assert can_transition(
            "approved", "staged", actor="admin", context="manual"
        ) is True

    def test_human_analyst_can_demote_approved(self):
        assert can_transition(
            "approved", "staged", actor="analyst", context="manual"
        ) is True


class TestStrEnumCompat:
    """Test that StrEnum values work as plain strings."""

    def test_enum_equals_string(self):
        assert ReviewStatus.PENDING == "pending"
        assert ReviewStatus.APPROVED == "approved"

    def test_string_args_work(self):
        assert can_transition("pending", "staged") is True

    def test_enum_args_work(self):
        assert can_transition(
            ReviewStatus.PENDING, ReviewStatus.STAGED
        ) is True

    def test_context_enum_as_string(self):
        assert can_transition(
            "approved", "staged", actor="system",
            context=TransitionContext.RECRAWL,
        ) is True
