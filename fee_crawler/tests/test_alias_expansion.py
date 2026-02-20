"""Tests for expanded fee name aliases added in Phase 1.

Covers every new alias mapping plus regression tests for existing aliases.
"""

import pytest

from fee_crawler.fee_analysis import normalize_fee_name, FEE_FAMILIES


def _all_canonical() -> set[str]:
    cats: set[str] = set()
    for members in FEE_FAMILIES.values():
        cats.update(members)
    return cats


CANONICAL_SET = _all_canonical()


# --- New aliases: Account Maintenance ---

@pytest.mark.parametrize("raw, expected", [
    ("Membership", "monthly_maintenance"),
    ("Annual Fee", "monthly_maintenance"),
    ("Annual Maintenance Fee", "monthly_maintenance"),
    ("Dormant Fee", "dormant_account"),
    ("Dormancy Fee", "dormant_account"),
    ("Account Balancing Assistance", "account_research"),
    ("Fax Fee", "account_research"),
    ("Fax Service", "account_research"),
    ("Returned Mail Fee", "account_research"),
    ("Returned Mail", "account_research"),
    ("Return Mail Fee", "account_research"),
    ("Return Mail", "account_research"),
    ("Bad Address Fee", "account_research"),
    ("Bad Address", "account_research"),
    ("Account Closed Within 90 Days of Opening", "early_closure"),
])
def test_account_maintenance_new_aliases(raw: str, expected: str) -> None:
    assert normalize_fee_name(raw) == expected


# --- New aliases: Overdraft & NSF ---

@pytest.mark.parametrize("raw, expected", [
    ("Overdraft Protection", "od_protection_transfer"),
    ("Overdraft Privilege", "overdraft"),
    ("ACH Overdraft", "overdraft"),
    ("ACH Overdraft Fee", "overdraft"),
    ("Returned Payment Fee", "nsf"),
    ("Returned Payment", "nsf"),
])
def test_overdraft_nsf_new_aliases(raw: str, expected: str) -> None:
    assert normalize_fee_name(raw) == expected


# --- New aliases: ATM & Card ---

@pytest.mark.parametrize("raw, expected", [
    ("ATM Withdrawal", "atm_non_network"),
    ("ATM Withdrawal Fee", "atm_non_network"),
    ("Visa Gift Card", "card_replacement"),
    ("Visa Gift Cards", "card_replacement"),
    ("Gift Card", "card_replacement"),
    ("Gift Cards", "card_replacement"),
    ("Gift Card Fee", "card_replacement"),
])
def test_atm_card_new_aliases(raw: str, expected: str) -> None:
    assert normalize_fee_name(raw) == expected


# --- New aliases: Check Services ---

@pytest.mark.parametrize("raw, expected", [
    ("Copy of Draft", "check_image"),
    ("Draft Copy", "check_image"),
    ("Foreign Check Collection", "check_cashing"),
    ("Foreign Check", "check_cashing"),
])
def test_check_services_new_aliases(raw: str, expected: str) -> None:
    assert normalize_fee_name(raw) == expected


# --- New aliases: Digital & Electronic ---

@pytest.mark.parametrize("raw, expected", [
    ("Telephone Transfer", "ach_origination"),
    ("Telephone Transfer Fee", "ach_origination"),
    ("Phone Transfer", "ach_origination"),
    ("Excessive Withdrawal Fee", "ach_return"),
    ("Excessive Withdrawal", "ach_return"),
])
def test_digital_electronic_new_aliases(raw: str, expected: str) -> None:
    assert normalize_fee_name(raw) == expected


# --- New aliases: Cash & Deposit ---

@pytest.mark.parametrize("raw, expected", [
    ("Deposit Item Return", "deposited_item_return"),
    ("Deposit Item Return Fee", "deposited_item_return"),
    ("Returned Deposit", "deposited_item_return"),
])
def test_cash_deposit_new_aliases(raw: str, expected: str) -> None:
    assert normalize_fee_name(raw) == expected


# --- New aliases: Account Services ---

@pytest.mark.parametrize("raw, expected", [
    ("Tax Levy", "garnishment_levy"),
    ("Tax Levy Fee", "garnishment_levy"),
])
def test_account_services_new_aliases(raw: str, expected: str) -> None:
    assert normalize_fee_name(raw) == expected


# --- New aliases: Lending Fees ---

@pytest.mark.parametrize("raw, expected", [
    ("Loan Application Fee", "loan_origination"),
    ("Loan Application", "loan_origination"),
    ("Subordination Fee", "loan_origination"),
    ("Lien Release Fee", "loan_origination"),
    ("Lien Release", "loan_origination"),
])
def test_lending_new_aliases(raw: str, expected: str) -> None:
    assert normalize_fee_name(raw) == expected


# --- Regression: existing aliases still work ---

@pytest.mark.parametrize("raw, expected", [
    ("Monthly Maintenance Fee", "monthly_maintenance"),
    ("Overdraft Fee", "overdraft"),
    ("NSF Fee", "nsf"),
    ("Non-Network ATM Fee", "atm_non_network"),
    ("Foreign Transaction Fee", "card_foreign_txn"),
    ("Outgoing Wire Transfer", "wire_domestic_outgoing"),
    ("International Wire Transfer Incoming", "wire_intl_incoming"),
    ("Cashier's Check Fee", "cashiers_check"),
    ("Stop Payment Fee", "stop_payment"),
    ("Safe Deposit Box", "safe_deposit_box"),
    ("Garnishment Fee", "garnishment_levy"),
    ("Late Payment Fee", "late_payment"),
    ("Courtesy Pay Fee", "overdraft"),
    ("Debit Card Replacement Fee", "card_replacement"),
    ("Paper Statement Fee", "paper_statement"),
])
def test_existing_aliases_regression(raw: str, expected: str) -> None:
    assert normalize_fee_name(raw) == expected


# --- Ensure all new aliases map to valid canonical categories ---

def test_all_aliases_map_to_canonical() -> None:
    from fee_crawler.fee_analysis import FEE_NAME_ALIASES
    for alias, canonical in FEE_NAME_ALIASES.items():
        assert canonical in CANONICAL_SET, (
            f"Alias '{alias}' maps to '{canonical}' which is not a valid canonical category"
        )


# --- Non-fee substrings should be flagged ---

def test_non_fee_substrings() -> None:
    from fee_crawler.fee_amount_rules import NON_FEE_SUBSTRINGS
    assert "amortization schedule" in NON_FEE_SUBSTRINGS
    assert "par value" in NON_FEE_SUBSTRINGS
    assert "membership share" in NON_FEE_SUBSTRINGS
