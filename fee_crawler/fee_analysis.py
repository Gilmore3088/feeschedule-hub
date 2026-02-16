"""Fee analysis: name normalization, peer comparison, percentile ranking."""

from __future__ import annotations

import re
import statistics
from dataclasses import dataclass

from fee_crawler.db import Database

# ---------------------------------------------------------------------------
# Fee name normalization
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Fee families: group related fees for reporting
# ---------------------------------------------------------------------------
FEE_FAMILIES: dict[str, list[str]] = {
    "Account Maintenance": [
        "monthly_maintenance",
        "minimum_balance",
        "early_closure",
        "dormant_account",
        "account_research",
        "paper_statement",
        "estatement_fee",
    ],
    "Overdraft & NSF": [
        "overdraft",
        "nsf",
        "continuous_od",
        "od_protection_transfer",
        "od_line_of_credit",
    ],
    "ATM & Card": [
        "atm_non_network",
        "atm_international",
        "card_replacement",
        "rush_card",
        "card_foreign_txn",
        "card_dispute",
    ],
    "Wire Transfers": [
        "wire_domestic_outgoing",
        "wire_domestic_incoming",
        "wire_intl_outgoing",
        "wire_intl_incoming",
    ],
    "Check Services": [
        "cashiers_check",
        "money_order",
        "check_printing",
        "stop_payment",
        "counter_check",
        "check_cashing",
        "check_image",
    ],
    "Digital & Electronic": [
        "ach_origination",
        "ach_return",
        "bill_pay",
        "mobile_deposit",
        "zelle_fee",
    ],
    "Cash & Deposit": [
        "coin_counting",
        "cash_advance",
        "deposited_item_return",
        "night_deposit",
    ],
    "Account Services": [
        "notary_fee",
        "safe_deposit_box",
        "garnishment_levy",
        "legal_process",
        "account_verification",
        "balance_inquiry",
    ],
    "Lending Fees": [
        "late_payment",
        "loan_origination",
        "appraisal_fee",
    ],
}

# Canonical fee categories and their known aliases
FEE_NAME_ALIASES: dict[str, str] = {
    # --- Account Maintenance ---
    "monthly maintenance fee": "monthly_maintenance",
    "monthly service charge": "monthly_maintenance",
    "monthly service fee": "monthly_maintenance",
    "monthly fee": "monthly_maintenance",
    "maintenance fee": "monthly_maintenance",
    "account maintenance fee": "monthly_maintenance",
    "service charge": "monthly_maintenance",
    "minimum balance fee": "minimum_balance",
    "below minimum balance fee": "minimum_balance",
    "minimum daily balance fee": "minimum_balance",
    "early account closure fee": "early_closure",
    "early closing fee": "early_closure",
    "account closing fee": "early_closure",
    "dormant account fee": "dormant_account",
    "inactive account fee": "dormant_account",
    "inactivity fee": "dormant_account",
    "account research fee": "account_research",
    "research fee": "account_research",
    "account research": "account_research",
    "paper statement fee": "paper_statement",
    "statement fee": "paper_statement",
    "printed statement fee": "paper_statement",
    "statement copy fee": "paper_statement",
    "electronic statement fee": "estatement_fee",
    "e-statement fee": "estatement_fee",
    # --- Overdraft & NSF ---
    "overdraft fee": "overdraft",
    "od fee": "overdraft",
    "overdraft charge": "overdraft",
    "overdraft item fee": "overdraft",
    "paid overdraft fee": "overdraft",
    "overdraft privilege fee": "overdraft",
    "nsf fee": "nsf",
    "non-sufficient funds fee": "nsf",
    "non sufficient funds": "nsf",
    "insufficient funds fee": "nsf",
    "returned item fee": "nsf",
    "returned check fee": "nsf",
    "returned deposit item": "nsf",
    "continuous overdraft fee": "continuous_od",
    "sustained overdraft fee": "continuous_od",
    "extended overdraft fee": "continuous_od",
    "daily overdraft fee": "continuous_od",
    "overdraft protection transfer fee": "od_protection_transfer",
    "overdraft transfer fee": "od_protection_transfer",
    "od transfer fee": "od_protection_transfer",
    "overdraft line of credit fee": "od_line_of_credit",
    "od loc fee": "od_line_of_credit",
    # --- ATM & Card ---
    "non-network atm fee": "atm_non_network",
    "out-of-network atm fee": "atm_non_network",
    "foreign atm fee": "atm_non_network",
    "atm fee non-network": "atm_non_network",
    "atm surcharge": "atm_non_network",
    "atm withdrawal fee": "atm_non_network",
    "international atm fee": "atm_international",
    "atm international withdrawal": "atm_international",
    "debit card replacement fee": "card_replacement",
    "card replacement fee": "card_replacement",
    "replacement card fee": "card_replacement",
    "rush card fee": "rush_card",
    "expedited card fee": "rush_card",
    "rush delivery fee": "rush_card",
    "foreign transaction fee": "card_foreign_txn",
    "international transaction fee": "card_foreign_txn",
    "international purchase transaction fee": "card_foreign_txn",
    "debit card dispute fee": "card_dispute",
    "chargeback fee": "card_dispute",
    # --- Wire Transfers ---
    "domestic wire transfer outgoing": "wire_domestic_outgoing",
    "outgoing domestic wire": "wire_domestic_outgoing",
    "wire transfer domestic outgoing": "wire_domestic_outgoing",
    "outgoing wire transfer": "wire_domestic_outgoing",
    "domestic wire out": "wire_domestic_outgoing",
    "domestic wire transfer incoming": "wire_domestic_incoming",
    "incoming domestic wire": "wire_domestic_incoming",
    "incoming wire transfer": "wire_domestic_incoming",
    "domestic wire in": "wire_domestic_incoming",
    "international wire transfer outgoing": "wire_intl_outgoing",
    "outgoing international wire": "wire_intl_outgoing",
    "international wire out": "wire_intl_outgoing",
    "international wire transfer incoming": "wire_intl_incoming",
    "incoming international wire": "wire_intl_incoming",
    "international wire in": "wire_intl_incoming",
    # --- Check Services ---
    "cashiers check fee": "cashiers_check",
    "cashiers check": "cashiers_check",
    "official check fee": "cashiers_check",
    "bank check fee": "cashiers_check",
    "treasurers check fee": "cashiers_check",
    "money order fee": "money_order",
    "money order": "money_order",
    "check printing": "check_printing",
    "check order fee": "check_printing",
    "personal checks": "check_printing",
    "check reorder fee": "check_printing",
    "stop payment fee": "stop_payment",
    "stop payment": "stop_payment",
    "stop payment order": "stop_payment",
    "counter check fee": "counter_check",
    "temporary check fee": "counter_check",
    "counter checks": "counter_check",
    "check cashing fee": "check_cashing",
    "non-customer check cashing": "check_cashing",
    "check image fee": "check_image",
    "check copy fee": "check_image",
    "copy of check": "check_image",
    # --- Digital & Electronic ---
    "ach origination fee": "ach_origination",
    "ach transfer fee": "ach_origination",
    "ach debit fee": "ach_origination",
    "ach return fee": "ach_return",
    "returned ach fee": "ach_return",
    "ach returned item": "ach_return",
    "bill pay fee": "bill_pay",
    "online bill pay fee": "bill_pay",
    "bill payment fee": "bill_pay",
    "mobile deposit fee": "mobile_deposit",
    "remote deposit fee": "mobile_deposit",
    "zelle fee": "zelle_fee",
    # --- Cash & Deposit ---
    "coin counting fee": "coin_counting",
    "coin machine fee": "coin_counting",
    "coin wrapping fee": "coin_counting",
    "cash advance fee": "cash_advance",
    "deposited item return fee": "deposited_item_return",
    "deposited item returned": "deposited_item_return",
    "cashed check return fee": "deposited_item_return",
    "night deposit fee": "night_deposit",
    "night depository fee": "night_deposit",
    # --- Account Services ---
    "notary fee": "notary_fee",
    "notary service": "notary_fee",
    "safe deposit box": "safe_deposit_box",
    "safe deposit box fee": "safe_deposit_box",
    "safety deposit box": "safe_deposit_box",
    "garnishment fee": "garnishment_levy",
    "levy processing fee": "garnishment_levy",
    "legal process fee": "legal_process",
    "subpoena processing fee": "legal_process",
    "account verification fee": "account_verification",
    "verification of deposit": "account_verification",
    "balance inquiry fee": "balance_inquiry",
    "teller balance inquiry": "balance_inquiry",
    # --- Lending Fees ---
    "late payment fee": "late_payment",
    "late fee": "late_payment",
    "loan origination fee": "loan_origination",
    "origination fee": "loan_origination",
    "appraisal fee": "appraisal_fee",
}

CANONICAL_DISPLAY_NAMES: dict[str, str] = {
    # Account Maintenance
    "monthly_maintenance": "Monthly Maintenance",
    "minimum_balance": "Minimum Balance",
    "early_closure": "Early Account Closure",
    "dormant_account": "Dormant Account",
    "account_research": "Account Research",
    "paper_statement": "Paper Statement",
    "estatement_fee": "E-Statement",
    # Overdraft & NSF
    "overdraft": "Overdraft (OD)",
    "nsf": "NSF / Returned Item",
    "continuous_od": "Continuous Overdraft",
    "od_protection_transfer": "OD Protection Transfer",
    "od_line_of_credit": "OD Line of Credit",
    # ATM & Card
    "atm_non_network": "Non-Network ATM",
    "atm_international": "International ATM",
    "card_replacement": "Debit Card Replacement",
    "rush_card": "Rush Card Delivery",
    "card_foreign_txn": "Foreign Transaction",
    "card_dispute": "Card Dispute",
    # Wire Transfers
    "wire_domestic_outgoing": "Wire Transfer (Domestic Out)",
    "wire_domestic_incoming": "Wire Transfer (Domestic In)",
    "wire_intl_outgoing": "Wire Transfer (Int'l Out)",
    "wire_intl_incoming": "Wire Transfer (Int'l In)",
    # Check Services
    "cashiers_check": "Cashier's Check",
    "money_order": "Money Order",
    "check_printing": "Check Printing",
    "stop_payment": "Stop Payment",
    "counter_check": "Counter/Temporary Check",
    "check_cashing": "Check Cashing",
    "check_image": "Check Image/Copy",
    # Digital & Electronic
    "ach_origination": "ACH Origination",
    "ach_return": "ACH Return",
    "bill_pay": "Bill Pay",
    "mobile_deposit": "Mobile Deposit",
    "zelle_fee": "Zelle",
    # Cash & Deposit
    "coin_counting": "Coin Counting",
    "cash_advance": "Cash Advance",
    "deposited_item_return": "Deposited Item Return",
    "night_deposit": "Night Deposit",
    # Account Services
    "notary_fee": "Notary Service",
    "safe_deposit_box": "Safe Deposit Box",
    "garnishment_levy": "Garnishment/Levy",
    "legal_process": "Legal Process/Subpoena",
    "account_verification": "Account Verification",
    "balance_inquiry": "Balance Inquiry",
    # Lending Fees
    "late_payment": "Late Payment",
    "loan_origination": "Loan Origination",
    "appraisal_fee": "Appraisal",
}


def get_fee_family(canonical: str) -> str | None:
    """Get the fee family for a canonical fee name."""
    for family, members in FEE_FAMILIES.items():
        if canonical in members:
            return family
    return None


def normalize_fee_name(raw_name: str) -> str:
    """Map a raw fee name to its canonical form.

    Returns the canonical key (e.g., "overdraft") if matched,
    or a cleaned version of the raw name if no alias matches.
    """
    cleaned = re.sub(r"[^\w\s]", "", raw_name.lower()).strip()
    cleaned = re.sub(r"\s+", " ", cleaned)

    # Direct alias match
    if cleaned in FEE_NAME_ALIASES:
        return FEE_NAME_ALIASES[cleaned]

    # Fuzzy: check if any alias is contained in the cleaned name
    for alias, canonical in FEE_NAME_ALIASES.items():
        if alias in cleaned:
            return canonical

    # No match - return cleaned version as-is
    return cleaned.replace(" ", "_")


def get_display_name(canonical: str) -> str:
    """Get human-readable name for a canonical fee key."""
    if canonical in CANONICAL_DISPLAY_NAMES:
        return CANONICAL_DISPLAY_NAMES[canonical]
    return canonical.replace("_", " ").title()


# ---------------------------------------------------------------------------
# Fee comparison
# ---------------------------------------------------------------------------

@dataclass
class FeeComparison:
    """Comparison of a single fee type across a peer group."""

    canonical_name: str
    display_name: str
    target_amount: float | None
    peer_min: float
    peer_max: float
    peer_median: float
    peer_p25: float
    peer_p75: float
    peer_count: int
    percentile_rank: int  # 0-100, where target falls among peers


def compare_fees_across_peers(
    db: Database,
    target_id: int,
    peer_ids: list[int],
) -> list[FeeComparison]:
    """For each fee the target has, compute percentiles across the peer group.

    Returns a list of FeeComparison objects sorted by canonical_name.
    """
    if not peer_ids:
        return []

    # Get target's fees
    target_fees = db.fetchall(
        "SELECT fee_name, amount FROM extracted_fees WHERE crawl_target_id = ?",
        (target_id,),
    )
    if not target_fees:
        return []

    # Build map: canonical_name -> target_amount
    target_map: dict[str, float | None] = {}
    for row in target_fees:
        canonical = normalize_fee_name(row["fee_name"])
        if canonical not in target_map or row["amount"] is not None:
            target_map[canonical] = row["amount"]

    # Get all peer fees
    placeholders = ",".join("?" for _ in peer_ids)
    peer_fees = db.fetchall(
        f"""SELECT fee_name, amount, crawl_target_id
            FROM extracted_fees
            WHERE crawl_target_id IN ({placeholders})""",
        tuple(peer_ids),
    )

    # Build map: canonical_name -> list of amounts
    peer_amounts: dict[str, list[float]] = {}
    for row in peer_fees:
        canonical = normalize_fee_name(row["fee_name"])
        if row["amount"] is not None:
            peer_amounts.setdefault(canonical, []).append(row["amount"])

    # Build comparisons for fees the target has
    comparisons = []
    for canonical, target_amount in sorted(target_map.items()):
        amounts = peer_amounts.get(canonical, [])
        if not amounts:
            continue

        amounts_sorted = sorted(amounts)
        n = len(amounts_sorted)
        median = statistics.median(amounts_sorted)
        p25 = amounts_sorted[n // 4] if n >= 4 else amounts_sorted[0]
        p75 = amounts_sorted[3 * n // 4] if n >= 4 else amounts_sorted[-1]

        # Compute percentile rank of target
        if target_amount is not None and n > 0:
            below = sum(1 for a in amounts_sorted if a < target_amount)
            percentile = int(below / n * 100)
        else:
            percentile = -1

        comparisons.append(FeeComparison(
            canonical_name=canonical,
            display_name=get_display_name(canonical),
            target_amount=target_amount,
            peer_min=amounts_sorted[0],
            peer_max=amounts_sorted[-1],
            peer_median=median,
            peer_p25=p25,
            peer_p75=p75,
            peer_count=n,
            percentile_rank=percentile,
        ))

    return comparisons


# ---------------------------------------------------------------------------
# Summary generation
# ---------------------------------------------------------------------------

def generate_peer_summary(
    db: Database,
    target_id: int,
    peer_ids: list[int],
) -> dict:
    """Generate a full peer comparison summary for an institution.

    Returns a dict suitable for JSON serialization and storage in analysis_results.
    """
    target = db.fetchone(
        """SELECT id, institution_name, charter_type, asset_size,
                  asset_size_tier, fed_district, state_code
           FROM crawl_targets WHERE id = ?""",
        (target_id,),
    )
    if not target:
        return {"error": "Institution not found"}

    comparisons = compare_fees_across_peers(db, target_id, peer_ids)

    # Identify notable fees (above 75th or below 25th percentile)
    highlights = []
    for c in comparisons:
        if c.target_amount is None or c.percentile_rank < 0:
            continue
        if c.percentile_rank >= 75:
            highlights.append({
                "fee": c.display_name,
                "direction": "above",
                "amount": c.target_amount,
                "peer_median": c.peer_median,
                "percentile": c.percentile_rank,
            })
        elif c.percentile_rank <= 25:
            highlights.append({
                "fee": c.display_name,
                "direction": "below",
                "amount": c.target_amount,
                "peer_median": c.peer_median,
                "percentile": c.percentile_rank,
            })

    return {
        "institution": {
            "id": target["id"],
            "name": target["institution_name"],
            "charter_type": target["charter_type"],
            "asset_size": target["asset_size"],
            "asset_size_tier": target["asset_size_tier"],
            "fed_district": target["fed_district"],
            "state_code": target["state_code"],
        },
        "peer_count": len(peer_ids),
        "fee_comparisons": [
            {
                "canonical_name": c.canonical_name,
                "display_name": c.display_name,
                "target_amount": c.target_amount,
                "peer_min": c.peer_min,
                "peer_max": c.peer_max,
                "peer_median": c.peer_median,
                "peer_p25": c.peer_p25,
                "peer_p75": c.peer_p75,
                "peer_count": c.peer_count,
                "percentile_rank": c.percentile_rank,
            }
            for c in comparisons
        ],
        "highlights": highlights,
    }
