"""Pydantic payload schemas per intent (D-09).

Phase 62b CONTEXT records the per-intent payload shapes:
  - challenge -> {subject_event_id, question}
  - prove     -> {evidence_refs: [{...}, ...]}  (non-empty)
  - accept    -> {summary?, fee_verified_id?}
  - reject    -> {reason, counter_evidence_refs?}
  - escalate  -> {digest_context, round_number}

coverage_request / clarify are left loose per CONTEXT (they exist on the intent
enum but have no fixed payload shape yet; validators return None so publisher
passes through).
"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class ChallengePayload(BaseModel):
    """Darwin/Knox asks another agent to justify a prior decision."""

    model_config = {"extra": "allow"}
    subject_event_id: str = Field(min_length=1)
    question: str = Field(min_length=1)


class ProvePayload(BaseModel):
    """Responder provides evidence. evidence_refs MUST be non-empty list."""

    model_config = {"extra": "allow"}
    evidence_refs: list[dict] = Field(..., min_length=1)


class AcceptPayload(BaseModel):
    """Resolve-accept. summary + optional fee_verified_id for TIER-05 handshakes."""

    model_config = {"extra": "allow"}
    summary: Optional[str] = None
    fee_verified_id: Optional[int] = None


class RejectPayload(BaseModel):
    """Resolve-reject. reason required; counter_evidence optional."""

    model_config = {"extra": "allow"}
    reason: str = Field(min_length=1)
    counter_evidence_refs: list[dict] = Field(default_factory=list)


class EscalatePayload(BaseModel):
    """Atlas flags a thread into James's daily digest."""

    model_config = {"extra": "allow"}
    digest_context: str = Field(min_length=1)
    round_number: int = Field(ge=1)


_INTENT_TO_MODEL: dict[str, type[BaseModel]] = {
    "challenge": ChallengePayload,
    "prove": ProvePayload,
    "accept": AcceptPayload,
    "reject": RejectPayload,
    "escalate": EscalatePayload,
}


def validate_payload_for_intent(
    intent: str, payload: Optional[dict]
) -> Optional[BaseModel]:
    """Validate payload shape against the matching intent schema.

    Raises pydantic.ValidationError on mismatch (publisher lets this propagate
    so the caller sees a clear 'bad message shape' failure BEFORE any DB write).

    Returns the parsed model on success, or None for intents without a fixed
    schema (coverage_request / clarify — passthrough).
    """
    model = _INTENT_TO_MODEL.get(intent)
    if model is None:
        return None
    return model.model_validate(payload or {})
