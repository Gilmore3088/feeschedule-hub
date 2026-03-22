"""
Document classifier for fee schedule detection.

Determines whether a downloaded document is actually a fee schedule
before sending it to the LLM for extraction. Prevents wrong-document
extraction (Problem 1 from accuracy audit).

Returns classification with confidence score and signals.
"""

import re
from typing import TypedDict


class DocumentClassification(TypedDict):
    is_fee_schedule: bool
    confidence: float
    doc_type_guess: str  # fee_schedule | account_agreement | tis_disclosure | rate_sheet | other
    signals: list[str]


# Definitive fee schedule titles — bypass scoring, always classify as fee schedule
DEFINITIVE_TITLES = [
    "schedule of fees",
    "fee schedule",
    "schedule of charges",
    "consumer fee schedule",
    "deposit account fees",
    "schedule of service charges",
    "consumer deposit account fees",
    "personal fee schedule",
    "account fees and charges",
    "business fee schedule",
    "commercial fee schedule",
    "fee disclosure",
]

# Positive signals: presence of fee-related structure
POSITIVE_SIGNALS: list[tuple[str, float]] = [
    ("per item", 0.1),
    ("per occurrence", 0.1),
    ("per month", 0.1),
    ("waived if", 0.1),
    ("fee waiver", 0.1),
    ("no charge", 0.05),
    ("service charge", 0.1),
    ("maintenance fee", 0.1),
    ("overdraft fee", 0.15),
    ("nsf fee", 0.1),
    ("insufficient funds", 0.1),
    ("wire transfer fee", 0.1),
    ("atm fee", 0.1),
    ("foreign transaction", 0.1),
    ("stop payment", 0.1),
    ("returned item", 0.1),
    ("account closure", 0.05),
    ("dormant account", 0.05),
    ("each occurrence", 0.1),
    ("per check", 0.1),
]

# Negative signals: these are NOT fee schedules
NEGATIVE_SIGNALS: list[tuple[str, float]] = [
    ("annual percentage rate", -0.3),
    ("truth in lending", -0.3),
    ("credit agreement", -0.3),
    ("loan agreement", -0.3),
    ("annual percentage yield", -0.2),
    ("arbitration", -0.15),
    ("governing law", -0.15),
    ("truth in savings", -0.15),
    ("privacy notice", -0.3),
    ("privacy policy", -0.3),
    ("terms and conditions", -0.1),
    ("electronic fund transfer", -0.1),
    ("regulation e", -0.1),
    ("regulation d", -0.1),
    ("mortgage disclosure", -0.3),
    ("home equity", -0.2),
    ("credit card agreement", -0.3),
]


def classify_document(text: str) -> DocumentClassification:
    """
    Classify whether a document text is a fee schedule.

    Args:
        text: Extracted text content from PDF or HTML

    Returns:
        DocumentClassification with is_fee_schedule, confidence, doc_type_guess, signals
    """
    if not text or len(text.strip()) < 50:
        return {
            "is_fee_schedule": False,
            "confidence": 0.0,
            "doc_type_guess": "other",
            "signals": ["too_short"],
        }

    lower = text.lower()
    score = 0.0
    signals: list[str] = []

    # Check definitive titles first — short-circuit
    for title in DEFINITIVE_TITLES:
        if title in lower:
            return {
                "is_fee_schedule": True,
                "confidence": 0.95,
                "doc_type_guess": "fee_schedule",
                "signals": [f"definitive_title: {title}"],
            }

    # Title-area signals (first 500 chars more likely to contain the title)
    title_area = lower[:500]
    TITLE_KEYWORDS = [
        "fee schedule",
        "schedule of fees",
        "fee disclosure",
        "account fees",
        "service charges",
    ]
    for kw in TITLE_KEYWORDS:
        if kw in title_area:
            score += 0.3
            signals.append(f"title_area: {kw}")
            break

    # Positive structure signals
    for sig, weight in POSITIVE_SIGNALS:
        if sig in lower:
            score += weight
            signals.append(f"positive: {sig}")

    # Cap positive signals at 0.8 (need title or dollar amounts to reach higher)
    if score > 0.8:
        score = 0.8

    # Dollar amount density — fee schedules have many distinct amounts
    distinct_amounts = len(set(re.findall(r"\$\d+(?:\.\d{2})?", text)))
    if distinct_amounts >= 10:
        score += 0.3
        signals.append(f"amounts: {distinct_amounts}")
    elif distinct_amounts >= 5:
        score += 0.15
        signals.append(f"amounts: {distinct_amounts}")
    elif distinct_amounts >= 2:
        score += 0.05
        signals.append(f"amounts: {distinct_amounts}")

    # Negative signals
    for sig, weight in NEGATIVE_SIGNALS:
        if sig in lower:
            score += weight  # weight is already negative
            signals.append(f"negative: {sig}")

    # Clamp
    score = max(0.0, min(1.0, score))

    # Determine document type
    if score >= 0.4:
        doc_type = "fee_schedule"
    elif "truth in savings" in lower or " apy" in lower:
        doc_type = "tis_disclosure"
    elif "annual percentage rate" in lower or "loan agreement" in lower:
        doc_type = "rate_sheet"
    elif "account agreement" in lower or "terms and conditions" in lower:
        doc_type = "account_agreement"
    else:
        doc_type = "other"

    return {
        "is_fee_schedule": score >= 0.4,
        "confidence": round(score, 3),
        "doc_type_guess": doc_type,
        "signals": signals,
    }


def is_likely_fee_schedule_quick(text: str) -> bool:
    """
    Quick pre-screen before LLM call. More permissive than classify_document.

    Returns True if the document is worth sending to the LLM.
    Only filters out clearly non-financial pages.
    """
    if not text or len(text.strip()) < 100:
        return False

    lower = text.lower()

    # Definitive titles always pass
    for title in DEFINITIVE_TITLES:
        if title in lower:
            return True

    # At least 1 dollar amount and 1 fee keyword
    has_dollar = bool(re.search(r"\$\d", text))
    fee_keywords = [
        "fee", "charge", "service charge", "overdraft", "nsf",
        "maintenance", "wire", "atm", "penalty",
    ]
    has_keyword = any(kw in lower for kw in fee_keywords)

    return has_dollar and has_keyword
