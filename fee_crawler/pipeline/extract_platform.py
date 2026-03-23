"""Rule-based fee extraction for known CMS platforms.

For each platform, once you've validated extraction rules against 20+ real
institutions, flip rule_enabled = TRUE in platform_registry.

Validation process:
  1. Pick 20 institutions on the platform that already have LLM-extracted fees
  2. Run rule extractor on the same HTML
  3. Compare: does rule output match LLM output within 10%?
  4. If yes: flip rule_enabled = TRUE, all future institutions skip LLM
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field

from bs4 import BeautifulSoup, Tag

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Data types
# ---------------------------------------------------------------------------

ZERO_AMOUNT_TERMS = frozenset({
    "free", "no charge", "waived", "n/a", "none", "no fee",
    "$0", "$0.00", "0.00", "complimentary",
})

FEE_TABLE_KEYWORDS = frozenset({
    "fee", "charge", "amount", "cost", "price", "rate", "service",
})

SKIP_ROW_NAMES = frozenset({
    "fee", "service", "type", "description", "item", "charge",
    "amount", "cost", "price", "rate", "total", "category",
})

FREQUENCY_MONTHLY = frozenset({"month", "monthly", "/mo", "per month"})
FREQUENCY_ANNUAL = frozenset({"annual", "year", "/yr", "yearly", "per year", "per annum"})
FREQUENCY_DAILY = frozenset({"daily", "per day"})
FREQUENCY_ONE_TIME = frozenset({"one time", "one-time", "once", "initial", "per occurrence"})

DOLLAR_RE = re.compile(r"\$?\s*(\d{1,6}(?:,\d{3})*(?:\.\d{1,2})?)")
PERCENT_RE = re.compile(r"(\d{1,3}(?:\.\d{1,2})?)\s*%")


@dataclass
class PlatformFee:
    """A single fee extracted by platform-specific rules."""

    fee_name: str
    amount: float | None
    frequency: str
    conditions: str | None
    confidence: float
    extracted_by: str


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def try_platform_extraction(
    platform: str,
    html: str,
    rule_enabled: bool,
) -> list[PlatformFee] | None:
    """Attempt rule-based extraction for a known CMS platform.

    Returns a list of PlatformFee if rules are enabled and extraction succeeds,
    or None to fall through to LLM extraction.
    """
    if not rule_enabled:
        return None

    platform_key = platform.lower().strip()

    extractors: dict[str, _ExtractorFn] = {
        "banno": _extract_banno,
        "q2": _extract_q2,
        "wordpress": _extract_generic_tables,
        "drupal": _extract_generic_tables,
        "fiserv": _extract_generic_tables,
        "fis": _extract_generic_tables,
    }

    extractor = extractors.get(platform_key)
    if extractor is None:
        return None

    try:
        fees = extractor(html, platform_key)
    except Exception:
        logger.exception("Platform rule extraction failed for %s", platform_key)
        return None

    if not fees:
        return None

    # Deduplicate by fee_name (keep first occurrence)
    seen: set[str] = set()
    unique: list[PlatformFee] = []
    for fee in fees:
        key = fee.fee_name.lower().strip()
        if key not in seen:
            seen.add(key)
            unique.append(fee)

    return unique if unique else None


def validate_platform_rules(
    platform: str,
    rule_fees: list[PlatformFee],
    llm_fees: list[dict],
) -> dict:
    """Compare rule extraction vs LLM extraction for validation.

    Args:
        platform: Platform identifier.
        rule_fees: Fees extracted by platform rules.
        llm_fees: Fees extracted by LLM, each a dict with at least
                  'fee_name' and 'amount' keys.

    Returns:
        Dict with coverage, accuracy, false_positive_rate, and pass/fail.
    """
    if not llm_fees:
        return {
            "platform": platform,
            "llm_count": 0,
            "rule_count": len(rule_fees),
            "coverage": 0.0,
            "accuracy": 0.0,
            "false_positive_rate": 1.0 if rule_fees else 0.0,
            "passed": False,
            "reason": "no LLM fees to compare against",
        }

    # Build lookup of LLM fees by normalized name
    llm_by_name: dict[str, float | None] = {}
    for lf in llm_fees:
        name = lf.get("fee_name", "").lower().strip()
        if name:
            llm_by_name[name] = lf.get("amount")

    # Coverage: what % of LLM fees did rules also find?
    matched_llm = 0
    for llm_name in llm_by_name:
        for rf in rule_fees:
            if rf.fee_name.lower().strip() == llm_name:
                matched_llm += 1
                break

    coverage = matched_llm / len(llm_by_name) if llm_by_name else 0.0

    # Accuracy: what % of matched rule fees have amounts within $1?
    accurate = 0
    matched_pairs = 0
    for rf in rule_fees:
        rname = rf.fee_name.lower().strip()
        if rname in llm_by_name:
            matched_pairs += 1
            llm_amt = llm_by_name[rname]
            if rf.amount is None and llm_amt is None:
                accurate += 1
            elif rf.amount is not None and llm_amt is not None:
                if abs(rf.amount - llm_amt) <= 1.0:
                    accurate += 1

    accuracy = accurate / matched_pairs if matched_pairs else 0.0

    # False positives: rule fees NOT found in LLM output
    false_positives = sum(
        1 for rf in rule_fees
        if rf.fee_name.lower().strip() not in llm_by_name
    )
    fp_rate = false_positives / len(rule_fees) if rule_fees else 0.0

    passed = coverage >= 0.85 and accuracy >= 0.90

    return {
        "platform": platform,
        "llm_count": len(llm_by_name),
        "rule_count": len(rule_fees),
        "matched_llm": matched_llm,
        "matched_pairs": matched_pairs,
        "accurate_pairs": accurate,
        "false_positives": false_positives,
        "coverage": round(coverage, 4),
        "accuracy": round(accuracy, 4),
        "false_positive_rate": round(fp_rate, 4),
        "passed": passed,
        "reason": "passed" if passed else (
            f"coverage={coverage:.1%} < 85%"
            if coverage < 0.85
            else f"accuracy={accuracy:.1%} < 90%"
        ),
    }


# ---------------------------------------------------------------------------
# Type alias
# ---------------------------------------------------------------------------

from typing import Callable
_ExtractorFn = Callable[[str, str], list[PlatformFee]]


# ---------------------------------------------------------------------------
# Platform-specific extractors
# ---------------------------------------------------------------------------

def _extract_banno(html: str, platform: str = "banno") -> list[PlatformFee]:
    """Jack Henry Banno sites have consistent fee table structures.

    Common patterns:
    - <table class="fee-schedule-table"> with Fee Type | Amount | Frequency
    - <div class="fee-schedule"> wrapping standard tables
    - Banno-specific data attributes on table elements
    """
    soup = _make_soup(html)
    fees: list[PlatformFee] = []

    # Banno-specific selectors first, then generic table fallback
    selectors = [
        "table.fee-schedule-table",
        ".fee-schedule table",
        "table[data-fee-schedule]",
        ".banno-table table",
    ]

    tables: list[Tag] = []
    for sel in selectors:
        tables.extend(soup.select(sel))

    # If no Banno-specific tables found, fall back to all tables
    if not tables:
        tables = soup.find_all("table")

    for table in tables:
        col_map = _detect_columns(table)
        if col_map is None:
            continue

        rows = table.find_all("tr")
        for row in rows[1:]:  # skip header
            cells = _get_row_cells(row)
            if len(cells) < 2:
                continue

            fee_name = _safe_cell(cells, col_map.get("name", 0))
            if not _is_valid_fee_name(fee_name):
                continue

            amount_text = _safe_cell(cells, col_map.get("amount", 1))
            amount = _parse_dollar(amount_text)
            if amount is None and not _is_zero_amount(amount_text):
                # Check if amount is embedded in the name cell
                amount = _parse_dollar(fee_name)
                if amount is not None:
                    # Strip the amount from the name
                    fee_name = DOLLAR_RE.sub("", fee_name).strip().rstrip("-:").strip()
                elif "$" not in amount_text:
                    continue

            freq_text = _safe_cell(cells, col_map.get("frequency", 2))
            cond_text = _safe_cell(cells, col_map.get("conditions", 3))

            fees.append(PlatformFee(
                fee_name=fee_name,
                amount=amount if amount is not None else 0.0,
                frequency=_parse_frequency(freq_text or fee_name),
                conditions=cond_text or None,
                confidence=0.88,
                extracted_by="banno_rule",
            ))

    return fees


def _extract_q2(html: str, platform: str = "q2") -> list[PlatformFee]:
    """Q2 Banking sites use standardized disclosure tables.

    Common patterns:
    - <table class="disclosure-table">
    - <table class="fee-table">
    - Tables inside .fee-schedule containers
    """
    soup = _make_soup(html)
    fees: list[PlatformFee] = []

    selectors = [
        "table.disclosure-table",
        "table.fee-table",
        ".fee-schedule table",
        ".disclosure table",
    ]

    tables: list[Tag] = []
    for sel in selectors:
        tables.extend(soup.select(sel))

    if not tables:
        tables = soup.find_all("table")

    for table in tables:
        col_map = _detect_columns(table)
        if col_map is None:
            continue

        rows = table.find_all("tr")
        for row in rows[1:]:
            cells = _get_row_cells(row)
            if len(cells) < 2:
                continue

            fee_name = _safe_cell(cells, col_map.get("name", 0))
            if not _is_valid_fee_name(fee_name):
                continue

            amount_text = _safe_cell(cells, col_map.get("amount", 1))
            amount = _parse_dollar(amount_text)
            if amount is None and not _is_zero_amount(amount_text):
                continue

            freq_text = _safe_cell(cells, col_map.get("frequency", 2))
            cond_text = _safe_cell(cells, col_map.get("conditions", 3))

            fees.append(PlatformFee(
                fee_name=fee_name,
                amount=amount if amount is not None else 0.0,
                frequency=_parse_frequency(freq_text or fee_name),
                conditions=cond_text or None,
                confidence=0.85,
                extracted_by="q2_rule",
            ))

    return fees


def _extract_generic_tables(
    html: str,
    platform: str = "generic",
) -> list[PlatformFee]:
    """Generic HTML table extraction for WordPress, Drupal, Fiserv, FIS.

    Scans all tables, identifies fee-related ones by header content,
    and extracts fee name + amount pairs.
    """
    soup = _make_soup(html)
    fees: list[PlatformFee] = []

    for table in soup.find_all("table"):
        col_map = _detect_columns(table)
        if col_map is None:
            continue

        rows = table.find_all("tr")
        for row in rows[1:]:
            cells = _get_row_cells(row)
            if len(cells) < 2:
                continue

            fee_name = _safe_cell(cells, col_map.get("name", 0))
            if not _is_valid_fee_name(fee_name):
                continue

            amount_text = _safe_cell(cells, col_map.get("amount", 1))
            amount = _parse_dollar(amount_text)

            # Accept rows with dollar signs or zero-amount terms
            if amount is None and not _is_zero_amount(amount_text):
                if "$" not in amount_text and "%" not in amount_text:
                    continue
                # Handle percentage-based fees (e.g., foreign txn 3%)
                pct = _parse_percent(amount_text)
                if pct is not None:
                    amount = pct

            freq_text = _safe_cell(cells, col_map.get("frequency", 2))
            cond_text = _safe_cell(cells, col_map.get("conditions", 3))

            fees.append(PlatformFee(
                fee_name=fee_name,
                amount=amount if amount is not None else 0.0,
                frequency=_parse_frequency(freq_text or fee_name),
                conditions=cond_text or None,
                confidence=0.75,
                extracted_by=f"{platform}_rule",
            ))

    # Also try definition list patterns (<dl><dt>Fee Name</dt><dd>$25.00</dd>)
    fees.extend(_extract_definition_lists(soup, platform))

    return fees


# ---------------------------------------------------------------------------
# Definition list extraction (common in WordPress/Drupal)
# ---------------------------------------------------------------------------

def _extract_definition_lists(
    soup: BeautifulSoup,
    platform: str,
) -> list[PlatformFee]:
    """Extract fees from <dl> definition lists."""
    fees: list[PlatformFee] = []

    for dl in soup.find_all("dl"):
        dts = dl.find_all("dt")
        dds = dl.find_all("dd")

        for dt, dd in zip(dts, dds):
            fee_name = dt.get_text(strip=True)
            amount_text = dd.get_text(strip=True)

            if not _is_valid_fee_name(fee_name):
                continue

            amount = _parse_dollar(amount_text)
            if amount is None and not _is_zero_amount(amount_text):
                continue

            fees.append(PlatformFee(
                fee_name=fee_name,
                amount=amount if amount is not None else 0.0,
                frequency=_parse_frequency(amount_text),
                conditions=None,
                confidence=0.70,
                extracted_by=f"{platform}_rule",
            ))

    return fees


# ---------------------------------------------------------------------------
# Shared parsing helpers
# ---------------------------------------------------------------------------

def _make_soup(html: str) -> BeautifulSoup:
    """Create a BeautifulSoup instance with non-content tags removed."""
    soup = BeautifulSoup(html, "lxml")
    for tag in soup.find_all(["script", "style", "nav", "noscript"]):
        tag.decompose()
    return soup


def _detect_columns(table: Tag) -> dict[str, int] | None:
    """Detect column roles from table header row.

    Returns a mapping like {"name": 0, "amount": 1, "frequency": 2}
    or None if this doesn't look like a fee table.
    """
    rows = table.find_all("tr")
    if len(rows) < 2:
        return None

    header_cells = rows[0].find_all(["th", "td"])
    if not header_cells:
        return None

    headers = [c.get_text(strip=True).lower() for c in header_cells]
    header_text = " ".join(headers)

    # Must contain at least one fee-related keyword
    if not any(kw in header_text for kw in FEE_TABLE_KEYWORDS):
        return None

    col_map: dict[str, int] = {}

    for i, h in enumerate(headers):
        if not h:
            continue
        h_lower = h.lower()

        # Name/description column
        if any(kw in h_lower for kw in (
            "fee", "service", "description", "type", "item", "name", "product",
        )):
            if "name" not in col_map:
                col_map["name"] = i

        # Amount column
        if any(kw in h_lower for kw in (
            "amount", "charge", "cost", "price", "rate", "fee",
        )):
            if "amount" not in col_map or h_lower in ("amount", "charge", "cost", "price"):
                col_map["amount"] = i

        # Frequency column
        if any(kw in h_lower for kw in ("frequency", "when", "how often", "period")):
            col_map["frequency"] = i

        # Conditions column
        if any(kw in h_lower for kw in (
            "condition", "note", "detail", "comment", "applies",
        )):
            col_map["conditions"] = i

    # Ensure name and amount aren't the same column
    if col_map.get("name") == col_map.get("amount"):
        if len(headers) >= 2:
            col_map["name"] = 0
            col_map["amount"] = 1
        else:
            return None

    # Must have at least name or amount identified
    if "name" not in col_map and "amount" not in col_map:
        return None

    # Default: name=0, amount=1 if not detected
    col_map.setdefault("name", 0)
    col_map.setdefault("amount", 1 if col_map["name"] != 1 else 0)

    return col_map


def _get_row_cells(row: Tag) -> list[str]:
    """Extract cell text from a table row."""
    return [td.get_text(strip=True) for td in row.find_all(["td", "th"])]


def _safe_cell(cells: list[str], index: int) -> str:
    """Safely get a cell value by index."""
    if 0 <= index < len(cells):
        return cells[index].strip()
    return ""


def _is_valid_fee_name(name: str) -> bool:
    """Check if a string looks like a valid fee name."""
    if not name or len(name) < 3:
        return False
    if len(name) > 200:
        return False
    if name.lower() in SKIP_ROW_NAMES:
        return False
    # Skip rows that are just numbers
    if re.match(r"^[\d\s$%.,]+$", name):
        return False
    return True


def _is_zero_amount(text: str) -> bool:
    """Check if text represents a zero/free amount."""
    if not text:
        return False
    return text.lower().strip() in ZERO_AMOUNT_TERMS


def _parse_dollar(text: str) -> float | None:
    """Parse a dollar amount from text.

    Returns the float value, or None if no amount found.
    Recognizes zero-amount terms like 'Free', 'No Charge', 'Waived'.
    """
    if not text:
        return None
    text = text.strip()

    if text.lower() in ZERO_AMOUNT_TERMS:
        return 0.0

    match = DOLLAR_RE.search(text)
    if match:
        try:
            return float(match.group(1).replace(",", ""))
        except ValueError:
            return None

    return None


def _parse_percent(text: str) -> float | None:
    """Parse a percentage value from text (e.g., '3%' -> 3.0)."""
    if not text:
        return None
    match = PERCENT_RE.search(text)
    if match:
        try:
            return float(match.group(1))
        except ValueError:
            return None
    return None


def _parse_frequency(text: str) -> str:
    """Determine fee frequency from text."""
    if not text:
        return "per_occurrence"

    t = text.lower().strip()

    if any(w in t for w in FREQUENCY_MONTHLY):
        return "monthly"
    if any(w in t for w in FREQUENCY_ANNUAL):
        return "annual"
    if any(w in t for w in FREQUENCY_DAILY):
        return "daily"
    if any(w in t for w in FREQUENCY_ONE_TIME):
        return "one_time"

    # Check for "per item" pattern
    if "per item" in t or "each" in t or "per transaction" in t:
        return "per_occurrence"

    return "per_occurrence"


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def _test():
    """Smoke tests for platform extraction."""

    # -- Test _parse_dollar --
    assert _parse_dollar("$25.00") == 25.0
    assert _parse_dollar("$1,500.00") == 1500.0
    assert _parse_dollar("25") == 25.0
    assert _parse_dollar("Free") == 0.0
    assert _parse_dollar("No Charge") == 0.0
    assert _parse_dollar("Waived") == 0.0
    assert _parse_dollar("$0") == 0.0
    assert _parse_dollar("$0.00") == 0.0
    assert _parse_dollar("") is None
    assert _parse_dollar("N/A") == 0.0
    assert _parse_dollar("varies") is None
    assert _parse_dollar("$35 per item") == 35.0

    # -- Test _parse_frequency --
    assert _parse_frequency("monthly") == "monthly"
    assert _parse_frequency("per month") == "monthly"
    assert _parse_frequency("Annual Fee") == "annual"
    assert _parse_frequency("per year") == "annual"
    assert _parse_frequency("daily") == "daily"
    assert _parse_frequency("one-time") == "one_time"
    assert _parse_frequency("per item") == "per_occurrence"
    assert _parse_frequency("each transaction") == "per_occurrence"
    assert _parse_frequency("") == "per_occurrence"

    # -- Test _parse_percent --
    assert _parse_percent("3%") == 3.0
    assert _parse_percent("1.5% of amount") == 1.5
    assert _parse_percent("") is None

    # -- Test _is_valid_fee_name --
    assert _is_valid_fee_name("Overdraft Fee") is True
    assert _is_valid_fee_name("ab") is False
    assert _is_valid_fee_name("fee") is False
    assert _is_valid_fee_name("$25.00") is False
    assert _is_valid_fee_name("") is False

    # -- Test try_platform_extraction returns None when disabled --
    assert try_platform_extraction("banno", "<html></html>", False) is None

    # -- Test try_platform_extraction returns None for unknown platform --
    assert try_platform_extraction("unknown_cms", "<html></html>", True) is None

    # -- Test Banno extraction with realistic HTML --
    banno_html = """
    <html><body>
    <table class="fee-schedule-table">
        <tr><th>Fee Type</th><th>Amount</th><th>Frequency</th></tr>
        <tr><td>Monthly Maintenance Fee</td><td>$12.00</td><td>Monthly</td></tr>
        <tr><td>Overdraft Fee</td><td>$35.00</td><td>Per Item</td></tr>
        <tr><td>Wire Transfer Outgoing</td><td>$25.00</td><td>Per Occurrence</td></tr>
        <tr><td>ATM Non-Network</td><td>$2.50</td><td>Per Transaction</td></tr>
        <tr><td>Online Banking</td><td>Free</td><td>Monthly</td></tr>
    </table>
    </body></html>
    """
    banno_fees = try_platform_extraction("banno", banno_html, True)
    assert banno_fees is not None
    assert len(banno_fees) == 5
    assert banno_fees[0].fee_name == "Monthly Maintenance Fee"
    assert banno_fees[0].amount == 12.0
    assert banno_fees[0].frequency == "monthly"
    assert banno_fees[1].amount == 35.0
    assert banno_fees[4].amount == 0.0
    assert all(f.extracted_by == "banno_rule" for f in banno_fees)

    # -- Test Q2 extraction --
    q2_html = """
    <html><body>
    <table class="disclosure-table">
        <tr><th>Service</th><th>Charge</th></tr>
        <tr><td>NSF Fee</td><td>$30.00</td></tr>
        <tr><td>Stop Payment</td><td>$35.00</td></tr>
    </table>
    </body></html>
    """
    q2_fees = try_platform_extraction("q2", q2_html, True)
    assert q2_fees is not None
    assert len(q2_fees) == 2
    assert q2_fees[0].fee_name == "NSF Fee"
    assert q2_fees[0].amount == 30.0
    assert all(f.extracted_by == "q2_rule" for f in q2_fees)

    # -- Test generic table extraction --
    generic_html = """
    <html><body>
    <h2>Fee Schedule</h2>
    <table>
        <tr><th>Service Description</th><th>Fee Amount</th><th>Frequency</th><th>Notes</th></tr>
        <tr><td>Monthly Service Fee</td><td>$10.00</td><td>Monthly</td><td>Waived with $1,500 balance</td></tr>
        <tr><td>Overdraft</td><td>$32.00</td><td>Per Item</td><td>Max 4 per day</td></tr>
        <tr><td>Cashiers Check</td><td>$8.00</td><td></td><td></td></tr>
        <tr><td>Foreign Transaction</td><td>3%</td><td>Per Transaction</td><td></td></tr>
    </table>
    </body></html>
    """
    generic_fees = try_platform_extraction("wordpress", generic_html, True)
    assert generic_fees is not None
    assert len(generic_fees) == 4
    assert generic_fees[0].amount == 10.0
    assert generic_fees[0].conditions == "Waived with $1,500 balance"
    assert generic_fees[3].amount == 3.0  # percentage
    assert generic_fees[0].extracted_by == "wordpress_rule"

    # -- Test deduplication --
    dup_html = """
    <html><body>
    <table>
        <tr><th>Fee</th><th>Amount</th></tr>
        <tr><td>Overdraft Fee</td><td>$35.00</td></tr>
        <tr><td>Overdraft Fee</td><td>$35.00</td></tr>
    </table>
    </body></html>
    """
    dup_fees = try_platform_extraction("drupal", dup_html, True)
    assert dup_fees is not None
    assert len(dup_fees) == 1

    # -- Test empty table --
    empty_html = """
    <html><body>
    <table><tr><th>Name</th><th>Value</th></tr></table>
    </body></html>
    """
    assert try_platform_extraction("banno", empty_html, True) is None

    # -- Test non-fee table is skipped --
    nonfee_html = """
    <html><body>
    <table>
        <tr><th>Branch</th><th>Address</th><th>Phone</th></tr>
        <tr><td>Main</td><td>123 Main St</td><td>555-1234</td></tr>
    </table>
    </body></html>
    """
    assert try_platform_extraction("fiserv", nonfee_html, True) is None

    # -- Test definition list extraction --
    dl_html = """
    <html><body>
    <dl>
        <dt>Wire Transfer Fee</dt><dd>$25.00</dd>
        <dt>Account Research</dt><dd>$30.00 per hour</dd>
    </dl>
    </body></html>
    """
    dl_fees = try_platform_extraction("wordpress", dl_html, True)
    assert dl_fees is not None
    assert len(dl_fees) == 2

    # -- Test validate_platform_rules --
    rule_fees_sample = [
        PlatformFee("overdraft fee", 35.0, "per_occurrence", None, 0.88, "banno_rule"),
        PlatformFee("monthly maintenance fee", 12.0, "monthly", None, 0.88, "banno_rule"),
        PlatformFee("wire transfer", 25.0, "per_occurrence", None, 0.88, "banno_rule"),
    ]
    llm_fees_sample = [
        {"fee_name": "overdraft fee", "amount": 35.0},
        {"fee_name": "monthly maintenance fee", "amount": 12.0},
        {"fee_name": "wire transfer", "amount": 25.0},
    ]
    result = validate_platform_rules("banno", rule_fees_sample, llm_fees_sample)
    assert result["coverage"] == 1.0
    assert result["accuracy"] == 1.0
    assert result["false_positive_rate"] == 0.0
    assert result["passed"] is True

    # Test with partial match
    partial_rules = [
        PlatformFee("overdraft fee", 35.0, "per_occurrence", None, 0.88, "banno_rule"),
    ]
    partial_llm = [
        {"fee_name": "overdraft fee", "amount": 35.0},
        {"fee_name": "nsf fee", "amount": 30.0},
        {"fee_name": "wire transfer", "amount": 25.0},
    ]
    result2 = validate_platform_rules("banno", partial_rules, partial_llm)
    assert result2["coverage"] < 0.85
    assert result2["passed"] is False

    # Test with amount mismatch
    mismatch_rules = [
        PlatformFee("overdraft fee", 45.0, "per_occurrence", None, 0.88, "test"),
    ]
    mismatch_llm = [
        {"fee_name": "overdraft fee", "amount": 35.0},
    ]
    result3 = validate_platform_rules("test", mismatch_rules, mismatch_llm)
    assert result3["accuracy"] == 0.0

    print("All tests passed.")


if __name__ == "__main__":
    _test()
