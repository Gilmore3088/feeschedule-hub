"""Stage 4: PDF fee extraction specialist."""

import os
import logging
import tempfile
import requests
import anthropic
import pdfplumber

log = logging.getLogger(__name__)

_EXTRACT_TOOL = {
    "name": "extract_fees",
    "description": "Record all fees extracted from the fee schedule.",
    "input_schema": {
        "type": "object",
        "properties": {
            "fees": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "fee_name": {"type": "string"},
                        "amount": {"type": ["number", "null"]},
                        "frequency": {"type": "string", "enum": ["per_occurrence", "monthly", "annual", "one_time", "daily", "other"]},
                        "conditions": {"type": ["string", "null"]},
                        "confidence": {"type": "number"},
                    },
                    "required": ["fee_name", "amount", "frequency", "confidence"],
                },
            },
        },
        "required": ["fees"],
    },
}


def extract_pdf(url: str, institution: dict) -> list[dict]:
    """Download PDF and extract fees via Claude tool use."""
    # Download
    resp = requests.get(url, timeout=30, headers={"User-Agent": "BankFeeIndex/1.0"})
    resp.raise_for_status()

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
        f.write(resp.content)
        pdf_path = f.name

    # Extract text
    try:
        with pdfplumber.open(pdf_path) as pdf:
            text = "\n".join(page.extract_text() or "" for page in pdf.pages[:20])
    finally:
        os.unlink(pdf_path)

    if not text.strip():
        log.warning("PDF text extraction returned empty")
        return []

    return _extract_fees_with_llm(text, institution, "pdf")


def _extract_fees_with_llm(text: str, institution: dict, doc_type: str) -> list[dict]:
    """Send text to Claude for fee extraction via tool use."""
    client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))

    charter = institution.get("charter_type", "bank")
    name = institution.get("institution_name", "Unknown")

    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=4096,
        system="""You are a financial data extraction specialist. Extract ALL fees from fee schedule documents.
Use the extract_fees tool to record every fee you find.
Look for: monthly maintenance fees, overdraft fees, NSF fees, ATM fees, wire transfer fees,
stop payment fees, returned item fees, card replacement fees, statement fees, dormant/inactivity fees,
foreign transaction fees, cashier's check fees, money order fees, and any other service charges.
Even if amounts say "varies" or are ranges, extract them with amount=null.""",
        tools=[_EXTRACT_TOOL],
        tool_choice={"type": "tool", "name": "extract_fees"},
        messages=[{
            "role": "user",
            "content": f"Extract all fees from this {charter} fee schedule ({doc_type}) for {name}.\n\nDocument text:\n{text[:12000]}",
        }],
        timeout=60,
    )

    for block in response.content:
        if block.type == "tool_use" and block.name == "extract_fees":
            return block.input.get("fees", [])

    return []
