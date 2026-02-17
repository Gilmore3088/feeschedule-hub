"""Per-category amount bounds for fee validation.

Each entry is (min_amount, max_amount, hard_ceiling, allows_zero):
  - min_amount / max_amount: outside this range -> warning (flagged for human review)
  - hard_ceiling: above this -> error (auto-reject candidate)
  - allows_zero: True if $0 is a legitimate value for this fee type

Bounds are based on CFPB, Bankrate, and FDIC survey data (2023-2025).
"""

from __future__ import annotations

# fmt: off
FEE_AMOUNT_RULES: dict[str, tuple[float, float, float, bool]] = {
    # --- Account Maintenance ---
    "monthly_maintenance":    (0.00,   25.00,   50.00, True),
    "minimum_balance":        (0.00,   25.00,   50.00, True),
    "early_closure":          (5.00,   50.00,  100.00, True),
    "dormant_account":        (2.00,   25.00,   50.00, False),
    "account_research":       (5.00,   50.00,  100.00, False),
    "paper_statement":        (1.00,   10.00,   25.00, True),
    "estatement_fee":         (0.00,    5.00,   10.00, True),

    # --- Overdraft & NSF ---
    "overdraft":              (5.00,   40.00,   75.00, False),
    "nsf":                    (5.00,   40.00,   75.00, False),
    "continuous_od":          (1.00,   15.00,   30.00, False),
    "od_protection_transfer": (0.00,   20.00,   50.00, True),
    "od_line_of_credit":      (0.00,   35.00,   75.00, True),
    "od_daily_cap":           (25.00, 300.00,  500.00, False),
    "nsf_daily_cap":          (25.00, 300.00,  500.00, False),

    # --- ATM & Card ---
    "atm_non_network":        (0.50,    5.00,   10.00, True),
    "atm_international":      (1.00,    7.00,   15.00, False),
    "card_replacement":       (0.00,   15.00,   30.00, True),
    "rush_card":              (10.00,  50.00,   75.00, False),
    "card_foreign_txn":       (0.50,    5.00,   10.00, True),
    "card_dispute":           (0.00,   25.00,   50.00, True),

    # --- Wire Transfers ---
    "wire_domestic_outgoing":  (5.00,  50.00,   75.00, False),
    "wire_domestic_incoming":  (0.00,  25.00,   50.00, True),
    "wire_intl_outgoing":     (10.00,  85.00,  125.00, False),
    "wire_intl_incoming":      (0.00,  30.00,   50.00, True),

    # --- Check Services ---
    "cashiers_check":          (3.00,  25.00,   50.00, False),
    "money_order":             (1.00,  15.00,   25.00, False),
    "check_printing":          (5.00,  50.00,  100.00, False),
    "stop_payment":           (10.00,  40.00,   75.00, False),
    "counter_check":           (0.50,  10.00,   20.00, False),
    "check_cashing":           (2.00,  25.00,   50.00, False),
    "check_image":             (1.00,  15.00,   30.00, False),

    # --- Digital & Electronic ---
    "ach_origination":         (0.00,  15.00,   30.00, True),
    "ach_return":              (2.00,  35.00,   50.00, False),
    "bill_pay":                (0.00,  15.00,   25.00, True),
    "mobile_deposit":          (0.00,   5.00,   10.00, True),
    "zelle_fee":               (0.00,   5.00,   10.00, True),

    # --- Cash & Deposit ---
    "coin_counting":           (0.00,  15.00,   30.00, True),
    "cash_advance":            (2.00,  50.00,  100.00, False),
    "deposited_item_return":   (3.00,  30.00,   50.00, False),
    "night_deposit":           (0.00,  25.00,   50.00, True),

    # --- Account Services ---
    "notary_fee":              (0.00,  15.00,   25.00, True),
    "safe_deposit_box":       (15.00, 500.00,  750.00, False),
    "garnishment_levy":       (15.00, 150.00,  250.00, False),
    "legal_process":          (15.00, 150.00,  250.00, False),
    "account_verification":    (2.00,  25.00,   50.00, True),
    "balance_inquiry":         (0.00,   5.00,   10.00, True),

    # --- Lending Fees ---
    "late_payment":            (5.00,  50.00,  100.00, False),
    "loan_origination":        (0.25,   5.00,   10.00, False),
    "appraisal_fee":         (200.00, 800.00, 1500.00, False),
}
# fmt: on

FALLBACK_RULES: tuple[float, float, float, bool] = (0.00, 500.00, 1000.00, True)

# Substrings that indicate misextracted non-fee data
NON_FEE_SUBSTRINGS = [
    "minimum balance",
    "min balance",
    "opening deposit",
    "opening balance",
    "daily limit",
    "daily balance",
    "interest rate",
    " apy",
    "ncua operating",
    "fdic assessment",
]
