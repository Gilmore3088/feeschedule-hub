"""Quality gates for article content validation.

Deterministic checks run after LLM generation, before status assignment.
Separate from the LLM-based fact-check (which remains in generator.py).
"""

from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass
class GateResult:
    name: str
    passed: bool
    message: str


@dataclass
class QualityReport:
    passed: bool
    gates: list[GateResult]

    def to_dict(self) -> dict:
        return {
            "passed": self.passed,
            "gates": [
                {"name": g.name, "passed": g.passed, "message": g.message}
                for g in self.gates
            ],
        }


PROHIBITED_PHRASES = [
    "financial advice",
    "we recommend",
    "you should",
    "best bank",
    "worst bank",
    "guaranteed",
    "risk-free",
    "ignore previous",
    "system prompt",
    "as an ai",
    "as a language model",
]


def check_word_count(content_md: str, min_words: int = 400, max_words: int = 2000) -> GateResult:
    """Check that article word count is within acceptable range."""
    words = len(content_md.split())
    if words < min_words:
        return GateResult(
            name="word_count",
            passed=False,
            message=f"Too short: {words} words (minimum {min_words})",
        )
    if words > max_words:
        return GateResult(
            name="word_count",
            passed=False,
            message=f"Too long: {words} words (maximum {max_words})",
        )
    return GateResult(
        name="word_count",
        passed=True,
        message=f"{words} words",
    )


def check_no_prohibited_phrases(content_md: str) -> GateResult:
    """Check that content doesn't contain prohibited phrases."""
    content_lower = content_md.lower()
    found = [p for p in PROHIBITED_PHRASES if p in content_lower]
    if found:
        return GateResult(
            name="prohibited_phrases",
            passed=False,
            message=f"Found prohibited phrases: {', '.join(found)}",
        )
    return GateResult(
        name="prohibited_phrases",
        passed=True,
        message="No prohibited phrases found",
    )


def check_dollar_formatting(content_md: str) -> GateResult:
    """Check that dollar amounts use $X.XX format (not $X or $X.X)."""
    # Find dollar amounts that are NOT properly formatted
    # Valid: $35.00, $1,234.56, $0.50
    # Invalid: $35, $35.5, $35.123
    bad_amounts = re.findall(r"\$\d[\d,]*(?:\.\d(?:\d{2,}|\b)|\b(?!\.\d{2}\b))", content_md)
    # More precise: find $N or $N.N patterns (missing cents)
    bad_no_cents = re.findall(r"\$\d[\d,]*(?:\.\d(?!\d)|\s|,\s|\.(?:\s|$)|\))", content_md)
    if bad_no_cents:
        return GateResult(
            name="dollar_formatting",
            passed=False,
            message=f"Found {len(bad_no_cents)} improperly formatted dollar amount(s)",
        )
    return GateResult(
        name="dollar_formatting",
        passed=True,
        message="Dollar amounts properly formatted",
    )


def run_quality_gates(content_md: str) -> QualityReport:
    """Run all deterministic quality gates on article content.

    Returns a QualityReport with overall pass/fail and per-gate results.
    """
    gates = [
        check_word_count(content_md),
        check_no_prohibited_phrases(content_md),
        check_dollar_formatting(content_md),
    ]
    return QualityReport(
        passed=all(g.passed for g in gates),
        gates=gates,
    )
