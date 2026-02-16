"""Send extracted text to Claude for structured fee extraction.

Takes raw text from PDF/HTML extraction and returns structured JSON
with fee names, amounts, frequencies, conditions, and confidence scores.
"""

import json
from dataclasses import dataclass

import anthropic

from fee_crawler.config import Config

EXTRACTION_PROMPT = """\
You are a financial data extraction specialist. Extract ALL fees from this \
bank/credit union fee schedule into structured JSON.

Return ONLY a valid JSON array. For each fee include:
- fee_name: exact name as shown in document (e.g., "Monthly Maintenance Fee")
- amount: numeric value as a float (null if free, waived, or N/A)
- frequency: one of "per_occurrence" | "monthly" | "annual" | "one_time" | "other"
- conditions: any conditions, waivers, or qualifications as a string (null if none)
- confidence: your confidence in this extraction from 0.0 to 1.0

Be thorough: extract every fee mentioned, including:
- Account maintenance/service fees
- Overdraft and NSF fees
- ATM fees (own and foreign)
- Wire transfer fees (domestic and international)
- Stop payment fees
- Cashier's check fees
- Statement fees
- Account closing fees
- Dormant/inactive account fees
- Any other fees listed

Example output format:
[
  {{"fee_name": "Monthly Maintenance Fee", "amount": 12.00, "frequency": "monthly", "conditions": "Waived with $1,500 minimum daily balance", "confidence": 0.95}},
  {{"fee_name": "Overdraft Fee", "amount": 35.00, "frequency": "per_occurrence", "conditions": "Maximum 3 per day", "confidence": 0.90}}
]

Fee schedule text:
{text}"""

MAX_TEXT_LENGTH = 50_000  # ~12K tokens, well within Sonnet's 200K context


@dataclass
class ExtractedFee:
    """A single fee extracted by the LLM."""

    fee_name: str
    amount: float | None
    frequency: str | None
    conditions: str | None
    confidence: float


def extract_fees_with_llm(text: str, config: Config) -> list[ExtractedFee]:
    """Send text to Claude and parse structured fee data.

    Requires ANTHROPIC_API_KEY environment variable.

    Returns list of ExtractedFee dataclass instances.
    """
    if not text or not text.strip():
        return []

    # Trim very long documents
    if len(text) > MAX_TEXT_LENGTH:
        text = text[:MAX_TEXT_LENGTH] + "\n\n[Document truncated]"

    client = anthropic.Anthropic()

    message = client.messages.create(
        model=config.claude.model,
        max_tokens=config.claude.max_tokens,
        messages=[
            {
                "role": "user",
                "content": EXTRACTION_PROMPT.format(text=text),
            }
        ],
    )

    # Parse response
    response_text = message.content[0].text.strip()

    # Handle cases where Claude wraps JSON in markdown code blocks
    if response_text.startswith("```"):
        lines = response_text.splitlines()
        # Remove first and last lines (```json and ```)
        lines = [l for l in lines if not l.strip().startswith("```")]
        response_text = "\n".join(lines).strip()

    try:
        fees_raw = json.loads(response_text)
    except json.JSONDecodeError:
        # Try to find JSON array in the response
        start = response_text.find("[")
        end = response_text.rfind("]")
        if start != -1 and end != -1:
            try:
                fees_raw = json.loads(response_text[start : end + 1])
            except json.JSONDecodeError:
                return []
        else:
            return []

    if not isinstance(fees_raw, list):
        return []

    fees: list[ExtractedFee] = []
    for item in fees_raw:
        if not isinstance(item, dict):
            continue
        fee_name = item.get("fee_name", "").strip()
        if not fee_name:
            continue

        amount = item.get("amount")
        if amount is not None:
            try:
                amount = float(amount)
            except (ValueError, TypeError):
                amount = None

        confidence = item.get("confidence", 0.5)
        try:
            confidence = float(confidence)
            confidence = max(0.0, min(1.0, confidence))
        except (ValueError, TypeError):
            confidence = 0.5

        fees.append(ExtractedFee(
            fee_name=fee_name,
            amount=amount,
            frequency=item.get("frequency"),
            conditions=item.get("conditions"),
            confidence=confidence,
        ))

    return fees
