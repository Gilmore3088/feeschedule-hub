"""Send extracted text to Claude for structured fee extraction using tool_use.

Uses the Anthropic tool_use API with a strict JSON Schema so Claude returns
structured, validated fee data with inline categorization against the
49-category taxonomy.
"""

from dataclasses import dataclass

import anthropic

from fee_crawler.config import Config
from fee_crawler.fee_analysis import FEE_FAMILIES

# Build the canonical category enum from the taxonomy
_ALL_CATEGORIES: list[str] = []
for _members in FEE_FAMILIES.values():
    _ALL_CATEGORIES.extend(_members)
_ALL_CATEGORIES.sort()

EXTRACTION_PROMPT = """\
You are a financial data extraction specialist. Extract ALL fees from this \
bank/credit union fee schedule into structured data.

For each fee, assign the best-matching fee_category from this taxonomy, \
or null if none fit:

Account Maintenance: monthly_maintenance, minimum_balance, early_closure, \
dormant_account, account_research, paper_statement, estatement_fee
Overdraft & NSF: overdraft, nsf, continuous_od, od_protection_transfer, \
od_line_of_credit, od_daily_cap, nsf_daily_cap
ATM & Card: atm_non_network, atm_international, card_replacement, rush_card, \
card_foreign_txn, card_dispute
Wire Transfers: wire_domestic_outgoing, wire_domestic_incoming, \
wire_intl_outgoing, wire_intl_incoming
Check Services: cashiers_check, money_order, check_printing, stop_payment, \
counter_check, check_cashing, check_image
Digital & Electronic: ach_origination, ach_return, bill_pay, mobile_deposit, \
zelle_fee
Cash & Deposit: coin_counting, cash_advance, deposited_item_return, \
night_deposit
Account Services: notary_fee, safe_deposit_box, garnishment_levy, \
legal_process, account_verification, balance_inquiry
Lending Fees: late_payment, loan_origination, appraisal_fee

Be thorough: extract every fee mentioned, including account maintenance, \
overdraft, NSF, ATM, wire transfer, stop payment, cashier's check, \
statement, account closing, dormant/inactive, and any other fees listed.

Fee schedule text:
{text}"""

# Tool schema for structured extraction
RECORD_FEES_TOOL = {
    "name": "record_fees",
    "description": "Record all extracted fees from the fee schedule document.",
    "input_schema": {
        "type": "object",
        "properties": {
            "fees": {
                "type": "array",
                "description": "List of all fees extracted from the document.",
                "items": {
                    "type": "object",
                    "properties": {
                        "fee_name": {
                            "type": "string",
                            "description": "Exact name as shown in the document.",
                        },
                        "amount": {
                            "type": ["number", "null"],
                            "description": "Dollar amount as a float. Null if free, waived, or N/A.",
                        },
                        "frequency": {
                            "type": "string",
                            "enum": ["per_occurrence", "monthly", "annual", "one_time", "other"],
                            "description": "How often the fee is charged.",
                        },
                        "conditions": {
                            "type": ["string", "null"],
                            "description": "Any conditions, waivers, or qualifications.",
                        },
                        "confidence": {
                            "type": "number",
                            "description": "Extraction confidence from 0.0 to 1.0.",
                        },
                        "fee_category": {
                            "type": ["string", "null"],
                            "enum": _ALL_CATEGORIES + [None],
                            "description": "Best-matching canonical fee category, or null if none fit.",
                        },
                    },
                    "required": ["fee_name", "amount", "frequency", "confidence", "fee_category"],
                },
            },
        },
        "required": ["fees"],
    },
}

MAX_TEXT_LENGTH = 50_000  # ~12K tokens, well within Sonnet's 200K context


@dataclass
class ExtractedFee:
    """A single fee extracted by the LLM."""

    fee_name: str
    amount: float | None
    frequency: str | None
    conditions: str | None
    confidence: float
    llm_category: str | None = None


def _parse_tool_use_response(message: anthropic.types.Message) -> list[ExtractedFee]:
    """Parse a tool_use response into ExtractedFee instances."""
    for block in message.content:
        if block.type == "tool_use" and block.name == "record_fees":
            return _parse_fees_input(block.input)
    return []


def _parse_fees_input(tool_input: dict) -> list[ExtractedFee]:
    """Parse the tool input dict into ExtractedFee instances."""
    fees_raw = tool_input.get("fees", [])
    if not isinstance(fees_raw, list):
        return []

    fees: list[ExtractedFee] = []
    for item in fees_raw:
        if not isinstance(item, dict):
            continue

        fee_name = item.get("fee_name", "")
        if isinstance(fee_name, str):
            fee_name = fee_name.strip()
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

        llm_category = item.get("fee_category")
        if llm_category is not None and llm_category not in _ALL_CATEGORIES:
            llm_category = None

        fees.append(ExtractedFee(
            fee_name=fee_name,
            amount=amount,
            frequency=item.get("frequency"),
            conditions=item.get("conditions"),
            confidence=confidence,
            llm_category=llm_category,
        ))

    return fees


def extract_fees_with_llm(text: str, config: Config) -> list[ExtractedFee]:
    """Send text to Claude and parse structured fee data via tool_use.

    Requires ANTHROPIC_API_KEY environment variable.

    Returns list of ExtractedFee dataclass instances.
    """
    if not text or not text.strip():
        return []

    if len(text) > MAX_TEXT_LENGTH:
        text = text[:MAX_TEXT_LENGTH] + "\n\n[Document truncated]"

    client = anthropic.Anthropic()

    message = client.messages.create(
        model=config.claude.model,
        max_tokens=config.claude.max_tokens,
        tools=[RECORD_FEES_TOOL],
        tool_choice={"type": "tool", "name": "record_fees"},
        messages=[
            {
                "role": "user",
                "content": EXTRACTION_PROMPT.format(text=text),
            }
        ],
    )

    return _parse_tool_use_response(message)
