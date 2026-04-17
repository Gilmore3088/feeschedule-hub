"""Pydantic schemas for canary corpus fixtures and verdicts (D-20).

The canary corpus is the frozen input to ``canary_runner.run_canary``: a list
of institution_id + expected_fees entries. Pydantic validates the JSON
contract at load time; actual corpus content lands in Phase 63.

The verdict is the runner's output — the pass/fail flag plus the three
regression deltas (coverage, confidence, extraction_count).
"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class CanaryExpectation(BaseModel):
    """Per-institution expectation row in a canary corpus."""

    model_config = {"extra": "forbid"}

    institution_id: int
    expected_fees: list[dict] = Field(default_factory=list)
    min_coverage: float = 1.0
    min_confidence: float = 0.85


class CanaryCorpus(BaseModel):
    """Top-level canary corpus fixture (loaded from JSON)."""

    model_config = {"extra": "forbid"}

    version: str
    description: str
    expectations: list[CanaryExpectation] = Field(default_factory=list)


class CanaryVerdict(BaseModel):
    """Output of ``run_canary`` — pass flag + three regression deltas."""

    model_config = {"extra": "forbid"}

    passed: bool
    coverage: float
    confidence_mean: float
    extraction_count: int
    coverage_delta: Optional[float] = None
    confidence_delta: Optional[float] = None
    extraction_count_delta: Optional[int] = None
    reason: Optional[str] = None


__all__ = ["CanaryCorpus", "CanaryExpectation", "CanaryVerdict"]
