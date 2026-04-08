"""Stage 4: PDF fee extraction specialist."""

import os
import logging
import tempfile
import requests
import anthropic
import pdfplumber

from fee_crawler.pipeline.extract_pdf import extract_text_from_pdf as _pipeline_extract_text

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
                        "account_product": {"type": ["string", "null"], "description": "Account type this fee applies to, e.g. free_checking, premier_checking, savings, money_market. null if applies to all accounts."},
                        "is_cap": {"type": "boolean", "description": "True if this is a daily/monthly cap on fees, not a per-occurrence fee. E.g. 'max $210/day overdraft fees' is a cap."},
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

    # Extract text using pipeline's full extractor (tables + OCR fallback)
    try:
        with open(pdf_path, "rb") as fh:
            pdf_bytes = fh.read()
        text = _pipeline_extract_text(pdf_bytes)
    finally:
        os.unlink(pdf_path)

    if not text.strip():
        log.warning("PDF text extraction returned empty (including OCR fallback)")
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

WHAT TO EXTRACT:
Monthly maintenance fees, overdraft fees, NSF fees, ATM fees, wire transfer fees,
stop payment fees, returned item fees, card replacement fees, statement fees, dormant/inactivity fees,
foreign transaction fees, cashier's check fees, money order fees, and any other service charges.
Even if amounts say "varies" or are ranges, extract them with amount=null.

ACCOUNT PRODUCTS:
If fees differ by account type (Free Checking vs Premier Checking vs Savings etc.), tag each fee
with account_product (e.g. "free_checking", "premier_checking", "interest_checking", "savings",
"money_market"). Use null if the fee applies to all accounts.
SKIP business/commercial account fees entirely — only extract personal/consumer accounts.

DAILY FEE CAPS vs ACTUAL FEES:
Banks often state "overdraft fee: $35, maximum $210 per day." The $35 is the actual per-occurrence fee.
The $210 is a DAILY CAP (maximum total fees per day), NOT a fee itself.
- Record the per-occurrence fee ($35) with is_cap=false
- Record the daily cap ($210) separately with is_cap=true and fee_name like "Overdraft Daily Cap"
- NEVER record a daily cap amount as the per-occurrence fee amount

NSF vs OVERDRAFT — CRITICAL DISTINCTION:
- Overdraft (OD): Bank COVERS the transaction, charges a fee. Payment goes through.
- NSF (Non-Sufficient Funds): Bank BOUNCES/RETURNS the transaction, charges a fee. Payment is rejected.
These are DIFFERENT fees. NEVER infer one from the other.
- If the document says "Overdraft Fee: $35" and says nothing about NSF/returned items, do NOT create an NSF fee.
- Only extract fees that are EXPLICITLY stated in the document. Never infer or assume related fees exist.""",
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
