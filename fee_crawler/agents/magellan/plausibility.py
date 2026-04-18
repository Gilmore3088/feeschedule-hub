"""Pure heuristic: does this look like a bank fee schedule?"""
from __future__ import annotations

_NEGATIVE_PATTERNS = (
    "404 not found", "not found",
    "access denied", "forbidden",
    "we use cookies", "accept all cookies", "cookie policy",
    "please enable javascript",
    "server error", "something went wrong",
    "sign in to continue", "login required",
)

_POSITIVE_PATTERNS = (
    "schedule of fees", "fee schedule",
    "account fees", "service charges",
    "pricing", "disclosure",
)

_FEE_NAME_MARKERS = (
    "maintenance", "overdraft", "nsf", "atm", "wire",
    "check", "paper statement", "stop payment",
    "foreign", "monthly", "fee", "charge",
)


def is_plausible_fee_schedule(fees: list[dict], text: str) -> bool:
    """Return True if (fees, text) looks like a real bank fee schedule."""
    if not fees:
        return False

    text_lower = text.lower() if text else ""

    if any(p in text_lower for p in _NEGATIVE_PATTERNS):
        return False

    fee_marker_hits = 0
    for fee in fees:
        name = (fee.get("name") or "").lower()
        if any(m in name for m in _FEE_NAME_MARKERS):
            fee_marker_hits += 1

    has_positive = any(p in text_lower for p in _POSITIVE_PATTERNS)

    if has_positive and fee_marker_hits >= 1:
        return True
    if fee_marker_hits >= 3:
        return True
    return False
