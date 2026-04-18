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
        "od_daily_cap",
        "nsf_daily_cap",
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
    "Mortgage Servicing": [
        "mortgage_modification",
        "mortgage_payoff",
        "mortgage_lien_release",
        "refinance_fee",
        "reconveyance",
    ],
    "Retirement & IRA": [
        "ira_administration",
        "ira_termination",
        "ira_distribution",
    ],
    "Vehicle & Title": [
        "vehicle_title",
        "duplicate_title",
        "dmv_filing",
    ],
    "Gift & Prepaid Cards": [
        "gift_card_purchase",
        "prepaid_card_reload",
    ],
    "Other Fees": [
        "courier_delivery",
        "document_reproduction",
        "other_lending_fee",
    ],
}

# ---------------------------------------------------------------------------
# Canonical key map: stable aggregation keys for downstream queries.
# For the 49 base categories, canonical_fee_key == fee_category (identity).
# Synonym clusters map multiple fee_category slugs to a single canonical key.
# ---------------------------------------------------------------------------
CANONICAL_KEY_MAP: dict[str, str] = {
    # Account Maintenance
    "monthly_maintenance": "monthly_maintenance",
    "minimum_balance": "minimum_balance",
    "early_closure": "early_closure",
    "dormant_account": "dormant_account",
    "account_research": "account_research",
    "paper_statement": "paper_statement",
    "estatement_fee": "estatement_fee",
    # Overdraft & NSF
    "overdraft": "overdraft",
    "nsf": "nsf",
    "continuous_od": "continuous_od",
    "od_protection_transfer": "od_protection_transfer",
    "od_line_of_credit": "od_line_of_credit",
    "od_daily_cap": "od_daily_cap",
    "nsf_daily_cap": "nsf_daily_cap",
    # ATM & Card
    "atm_non_network": "atm_non_network",
    "atm_international": "atm_international",
    "card_replacement": "card_replacement",
    "rush_card": "rush_card",
    "card_foreign_txn": "card_foreign_txn",
    "card_dispute": "card_dispute",
    # Wire Transfers
    "wire_domestic_outgoing": "wire_domestic_outgoing",
    "wire_domestic_incoming": "wire_domestic_incoming",
    "wire_intl_outgoing": "wire_intl_outgoing",
    "wire_intl_incoming": "wire_intl_incoming",
    # Check Services
    "cashiers_check": "cashiers_check",
    "money_order": "money_order",
    "check_printing": "check_printing",
    "stop_payment": "stop_payment",
    "counter_check": "counter_check",
    "check_cashing": "check_cashing",
    "check_image": "check_image",
    # Digital & Electronic
    "ach_origination": "ach_origination",
    "ach_return": "ach_return",
    "bill_pay": "bill_pay",
    "mobile_deposit": "mobile_deposit",
    "zelle_fee": "zelle_fee",
    # Cash & Deposit
    "coin_counting": "coin_counting",
    "cash_advance": "cash_advance",
    "deposited_item_return": "deposited_item_return",
    "night_deposit": "night_deposit",
    # Account Services
    "notary_fee": "notary_fee",
    "safe_deposit_box": "safe_deposit_box",
    "garnishment_levy": "garnishment_levy",
    "legal_process": "legal_process",
    "account_verification": "account_verification",
    "balance_inquiry": "balance_inquiry",
    # Lending Fees
    "late_payment": "late_payment",
    "loan_origination": "loan_origination",
    "appraisal_fee": "appraisal_fee",
    # Mortgage Servicing (v2 taxonomy — rescues ~49 previously uncategorized fees)
    "mortgage_modification": "mortgage_modification",
    "mortgage_payoff": "mortgage_payoff",
    "mortgage_lien_release": "mortgage_lien_release",
    "refinance_fee": "refinance_fee",
    "reconveyance": "reconveyance",
    # Retirement & IRA (v2 taxonomy — rescues ~23 previously uncategorized fees)
    "ira_administration": "ira_administration",
    "ira_termination": "ira_termination",
    "ira_distribution": "ira_distribution",
    # Vehicle & Title (v2 taxonomy — rescues ~40 previously uncategorized fees)
    "vehicle_title": "vehicle_title",
    "duplicate_title": "duplicate_title",
    "dmv_filing": "dmv_filing",
    # Gift & Prepaid Cards (v2 taxonomy — fixes Darwin bug where these wrongly mapped to account_research)
    "gift_card_purchase": "gift_card_purchase",
    "prepaid_card_reload": "prepaid_card_reload",
    # Other Fees (v2 taxonomy — overflow buckets)
    "courier_delivery": "courier_delivery",
    "document_reproduction": "document_reproduction",
    "other_lending_fee": "other_lending_fee",
    # Synonym clusters: production fee_category slugs -> canonical key
    # These are actual slugs found in extracted_fees that normalize to a base category.
    # --- Slug duplicates / abbreviations ---
    "rush_card_delivery": "rush_card",
    "estatement": "estatement_fee",
    "check_image_charge": "check_image",
    "safe_deposit": "safe_deposit_box",
    "monthly_maintenance_charge": "monthly_maintenance",
    "month_fee": "monthly_maintenance",
    "premier_fee": "monthly_maintenance",
    "savings_fee": "monthly_maintenance",
    "money_market_fee": "monthly_maintenance",
    # --- NSF / returned item variants ---
    "nonsufficient_fee": "nsf",
    "return_item_charge": "nsf",
    # --- Overdraft variants ---
    "overdraft_each_overdraft_paid": "overdraft",
    "overdraft_privilege": "overdraft",
    "over_fee": "overdraft",
    "excessive_withdrawal_fee": "overdraft",
    # --- Card / debit variants ---
    "debit_fee": "card_replacement",
    "debit_card_fee": "card_replacement",
    "visa_debit_card_fee": "card_replacement",
    "replacement_fee": "card_replacement",
    "pin_fee": "card_replacement",
    "pin_replacement": "card_replacement",
    "pin_replacement_fee": "card_replacement",
    "debit_card_rush_fee": "rush_card",
    # --- Card foreign / gift ---
    "international_fee": "card_foreign_txn",
    # v2 taxonomy fix: gift/prepaid cards incorrectly mapped to account_research previously.
    # These are distinct financial products, not account lookups.
    "visa_gift_card": "gift_card_purchase",
    "visa_gift_cards": "gift_card_purchase",
    "gift_card": "gift_card_purchase",
    "gift_cards": "gift_card_purchase",
    "gift_pay": "gift_card_purchase",
    "reload_fee": "prepaid_card_reload",
    # --- Wire / outgoing variants ---
    "outgoing_fee": "wire_domestic_outgoing",
    "outgoing_domestic": "wire_domestic_outgoing",
    "returned_wire": "wire_domestic_outgoing",
    "express_mail": "wire_domestic_outgoing",
    # --- Transfer / ACH variants ---
    "transfer_fee": "od_protection_transfer",
    "transaction_fee": "account_research",
    "transactions_fee": "account_research",
    "per_transaction_fee": "account_research",
    "ach_batch_fee": "ach_origination",
    # --- Address / mail return variants ---
    "returned_mail": "account_research",
    "returned_mail_fee": "account_research",
    "return_mail": "account_research",
    "bad_address": "account_research",
    "bad_address_fee": "account_research",
    "incorrect_address": "account_research",
    "incorrect_address_fee": "account_research",
    "invalid_address_fee": "account_research",
    "undeliverable_mail": "account_research",
    # --- Dormant / escheatment variants ---
    "inactive_fee": "dormant_account",
    "dormant_fee": "dormant_account",
    "escheatment": "dormant_account",
    "escheat_processing_fee": "dormant_account",
    "abandoned_property_fee": "dormant_account",
    # --- Skip-a-pay / late payment variants ---
    "skip_a_pay": "late_payment",
    "skipapay": "late_payment",
    "skipapayment": "late_payment",
    "reinstatement": "late_payment",
    # --- Fax / research / admin variants ---
    "fax_fee": "account_research",
    "account_balancing_assistance": "account_research",
    "account_balancing_assistance_per_hour": "account_research",
    "balancing_assistance_fee": "account_research",
    "inquiries_fee": "account_research",
    "document_copy": "account_research",
    "more_fee": "account_research",
    "less_fee": "account_research",
    # --- Early closure / club variants ---
    "club_account": "early_closure",
    "christmas_club_early_withdrawal_fee": "early_closure",
    "christmas_club_withdrawal": "early_closure",
    "club_account_early_withdrawal": "early_closure",
    "account_closed_within_90_days_of_opening": "early_closure",
    "account_closed_within_90_days": "early_closure",
    # --- Check variants ---
    "check_fee": "check_printing",
    "copy_of_paid_check": "check_image",
    "check_by_phone": "check_cashing",
    "corporate_check": "cashiers_check",
    "cashed_fee": "check_cashing",
    "foreign_check_collection": "check_cashing",
    "items_sent_for_collection": "deposited_item_return",
    # --- Safe deposit / key variants ---
    "lost_key_fee": "safe_deposit_box",
    "lost_key": "safe_deposit_box",
    "lost_fee": "safe_deposit_box",
    "key_replacement": "safe_deposit_box",
    "replacement_key": "safe_deposit_box",
    "drilling_fee": "safe_deposit_box",
    "box_drilling": "safe_deposit_box",
    "zipper_bag": "night_deposit",
    # --- Safe deposit box size slugs ---
    "3_x_5": "safe_deposit_box",
    "3_x_5_box": "safe_deposit_box",
    "3_x_10": "safe_deposit_box",
    "5_x_5": "safe_deposit_box",
    "5_x_10": "safe_deposit_box",
    "5_x_10_box": "safe_deposit_box",
    "10_x_10": "safe_deposit_box",
    "10_x_10_box": "safe_deposit_box",
    # --- Legal / subordination variants ---
    "subordination_fee": "legal_process",
    "subordination": "legal_process",
    "mortgage_subordination": "legal_process",
    "mortgage_subordination_fee": "legal_process",
    "duplicate_lien_release": "legal_process",
    "lien_fee": "legal_process",
    # --- Lending variants ---
    "loan_modification_fee": "loan_origination",
    "credit_card_fee": "cash_advance",
    "credit_fee": "cash_advance",
    # --- Coin / deposit variants ---
    "coin_deposited_fee": "coin_counting",
    "deposited_fee": "deposited_item_return",
    "collection_fee": "deposited_item_return",
    # --- ATM variants ---
    "all_other_atms": "atm_non_network",
    "atm_deposit_adjustment": "deposited_item_return",
    # --- Statement variants ---
    "returned_statement": "paper_statement",
    "mailed_paper_statement": "paper_statement",
    # --- Balance inquiry variants ---
    "shared_branch_fee": "balance_inquiry",
    # --- Misc (fastpay = expedited payment) ---
    "fastpay_fee": "ach_origination",
    "withdrawal_fee": "account_research",
    "silverbronze_rewards_fee": "monthly_maintenance",
    "charitable_donation": "account_research",
    "operate_fee": "account_research",
    # --- Production Postgres audit (2026-04-10) ---
    # High-frequency non-taxonomy slugs found in Supabase production data.
    "fax": "account_research",
    "fax_service": "account_research",
    "fax_services": "account_research",
    "christmas_club_early_withdrawal": "early_closure",
    "christmas_club_withdrawal_fee": "early_closure",
    "skipapayment_fee": "late_payment",
    "skipapay_fee": "late_payment",
    "undeliverable_mail": "account_research",
    "zipper_bags": "night_deposit",
    "membership_share": "monthly_maintenance",
    "western_union": "wire_domestic_outgoing",
    "outgoing_fee": "wire_domestic_outgoing",
    "document_copy_fee": "account_research",
    "visa_travel_card": "card_replacement",
    "loan_extension": "loan_origination",
    "excessive_transaction_fee": "account_research",
    "reopen_account": "early_closure",
    "loan_cancellation_fee": "loan_origination",
}

# Categories that must NEVER share aliases -- regulatory or semantic boundaries.
# Guard test in tests/test_never_merge.py enforces this before any alias expansion.
NEVER_MERGE_PAIRS: list[tuple[str, str]] = [
    ("nsf", "overdraft"),
    ("wire_domestic_outgoing", "wire_intl_outgoing"),
    ("wire_domestic_incoming", "wire_intl_incoming"),
    ("atm_non_network", "card_replacement"),
    ("od_protection_transfer", "overdraft"),
    ("od_daily_cap", "overdraft"),
    ("nsf_daily_cap", "nsf"),
]

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
    "membership fee": "monthly_maintenance",
    "minimum balance fee": "minimum_balance",
    "below minimum balance fee": "minimum_balance",
    "minimum daily balance fee": "minimum_balance",
    "early account closure fee": "early_closure",
    "early closing fee": "early_closure",
    "account closing fee": "early_closure",
    "account closing": "early_closure",
    "early closure fee": "early_closure",
    "account closure": "early_closure",
    "account closure fee": "early_closure",
    "dormant account fee": "dormant_account",
    "dormant account": "dormant_account",
    "inactive account fee": "dormant_account",
    "inactive account": "dormant_account",
    "inactivity fee": "dormant_account",
    "escheatment fee": "dormant_account",
    "escheat fee": "dormant_account",
    "account research fee": "account_research",
    "research fee": "account_research",
    "account research": "account_research",
    "research": "account_research",
    "account reconciliation": "account_research",
    "account activity printout": "account_research",
    "account history printout": "account_research",
    "account history": "account_research",
    "paper statement fee": "paper_statement",
    "statement fee": "paper_statement",
    "printed statement fee": "paper_statement",
    "statement copy fee": "paper_statement",
    "statement copy": "paper_statement",
    "statement copies": "paper_statement",
    "copy of statement": "paper_statement",
    "electronic statement fee": "estatement_fee",
    "e-statement fee": "estatement_fee",
    "estatements": "estatement_fee",
    "duplicate statement": "paper_statement",
    "paper statements": "paper_statement",
    "statement reprint": "paper_statement",
    "statement reprints": "paper_statement",
    "reprint statement": "paper_statement",
    "copies": "check_image",
    # --- Overdraft & NSF ---
    "overdraft fee": "overdraft",
    "od fee": "overdraft",
    "overdraft charge": "overdraft",
    "overdraft item fee": "overdraft",
    "paid overdraft fee": "overdraft",
    "overdraft privilege fee": "overdraft",
    "courtesy pay": "overdraft",
    "courtesy pay fee": "overdraft",
    "courtesy pay item": "overdraft",
    "negative balance fee": "overdraft",
    "overdraft/courtesy pay": "overdraft",
    "nsf fee": "nsf",
    "non-sufficient funds fee": "nsf",
    "non sufficient funds": "nsf",
    "nonsufficient funds": "nsf",
    "insufficient funds fee": "nsf",
    "insufficient funds": "nsf",
    "returned item fee": "nsf",
    "returned item": "nsf",
    "returned check fee": "nsf",
    "returned check": "nsf",
    "nsf/returned item": "nsf",
    "daily nsf fee": "nsf",
    "nsf returned item fee": "nsf",
    "continuous overdraft fee": "continuous_od",
    "continuous overdraft charge": "continuous_od",
    "continuous overdraft": "continuous_od",
    "continuous od charge": "continuous_od",
    "continuous od fee": "continuous_od",
    "continuous negative balance fee": "continuous_od",
    "sustained overdraft fee": "continuous_od",
    "sustained overdraft charge": "continuous_od",
    "sustained od fee": "continuous_od",
    "extended overdraft fee": "continuous_od",
    "extended overdraft charge": "continuous_od",
    "daily overdraft fee": "continuous_od",
    "daily overdraft charge": "continuous_od",
    "daily negative balance fee": "continuous_od",
    "daily continuous overdraft": "continuous_od",
    "recurring overdraft fee": "continuous_od",
    "continuous od": "continuous_od",
    "continuous od overdraft": "continuous_od",
    "overdraft fee daily": "continuous_od",
    "daily fee for negative balance": "continuous_od",
    "overdraft protection transfer fee": "od_protection_transfer",
    "overdraft transfer fee": "od_protection_transfer",
    "overdraft transfer": "od_protection_transfer",
    "overdraft protection transfer": "od_protection_transfer",
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
    "atm fee": "atm_non_network",
    "non-network atm": "atm_non_network",
    "international atm fee": "atm_international",
    "atm international withdrawal": "atm_international",
    "debit card replacement fee": "card_replacement",
    "card replacement fee": "card_replacement",
    "replacement card fee": "card_replacement",
    "debit card replacement": "card_replacement",
    "card replacement": "card_replacement",
    "replacement card": "card_replacement",
    "replacement debit card": "card_replacement",
    "lost card replacement": "card_replacement",
    "rush card fee": "rush_card",
    "expedited card fee": "rush_card",
    "rush delivery fee": "rush_card",
    "rush replacement card": "rush_card",
    "expedited card delivery": "rush_card",
    "emergency card replacement fee": "rush_card",
    "emergency card replacement": "rush_card",
    "emergency replacement card": "rush_card",
    "emergency replacement": "rush_card",
    "foreign transaction fee": "card_foreign_txn",
    "international transaction fee": "card_foreign_txn",
    "international purchase transaction fee": "card_foreign_txn",
    "cross border fee": "card_foreign_txn",
    "currency conversion fee": "card_foreign_txn",
    "debit card dispute fee": "card_dispute",
    "chargeback fee": "card_dispute",
    # --- Wire Transfers ---
    "domestic wire transfer outgoing": "wire_domestic_outgoing",
    "outgoing domestic wire": "wire_domestic_outgoing",
    "wire transfer domestic outgoing": "wire_domestic_outgoing",
    "outgoing wire transfer": "wire_domestic_outgoing",
    "outgoing wire": "wire_domestic_outgoing",
    "domestic wire out": "wire_domestic_outgoing",
    "wire transfer outgoing": "wire_domestic_outgoing",
    "wire transfer  outgoing": "wire_domestic_outgoing",
    "domestic wire transfer incoming": "wire_domestic_incoming",
    "incoming domestic wire": "wire_domestic_incoming",
    "incoming wire transfer": "wire_domestic_incoming",
    "incoming wire": "wire_domestic_incoming",
    "domestic wire in": "wire_domestic_incoming",
    "wire transfer incoming": "wire_domestic_incoming",
    "wire transfer  incoming": "wire_domestic_incoming",
    "international wire transfer outgoing": "wire_intl_outgoing",
    "outgoing international wire": "wire_intl_outgoing",
    "international wire out": "wire_intl_outgoing",
    "international wire": "wire_intl_outgoing",
    "international wire transfer incoming": "wire_intl_incoming",
    "incoming international wire": "wire_intl_incoming",
    "international wire in": "wire_intl_incoming",
    "wire transfers incoming": "wire_domestic_incoming",
    "wire transfers  incoming": "wire_domestic_incoming",
    "wire transfers outgoing": "wire_domestic_outgoing",
    "wire transfers  outgoing": "wire_domestic_outgoing",
    "wire transfer domestic incoming": "wire_domestic_incoming",
    "wire transfer domestic": "wire_domestic_outgoing",
    "domestic wire transfer": "wire_domestic_outgoing",
    "wire transfer": "wire_domestic_outgoing",
    "wire transfer international": "wire_intl_outgoing",
    "international wire transfer": "wire_intl_outgoing",
    # --- Check Services ---
    "cashiers check fee": "cashiers_check",
    "cashiers check": "cashiers_check",
    "cashiers checks": "cashiers_check",
    "official check fee": "cashiers_check",
    "official check": "cashiers_check",
    "bank check fee": "cashiers_check",
    "bank check": "cashiers_check",
    "treasurers check fee": "cashiers_check",
    "treasurers check": "cashiers_check",
    "certified check": "cashiers_check",
    "certified check fee": "cashiers_check",
    "money order fee": "money_order",
    "money order": "money_order",
    "money orders": "money_order",
    "check printing": "check_printing",
    "check order fee": "check_printing",
    "check order": "check_printing",
    "check orders": "check_printing",
    "personal checks": "check_printing",
    "check reorder fee": "check_printing",
    "check reorder": "check_printing",
    "share draft printing": "check_printing",
    "share drafts": "check_printing",
    "stop payment fee": "stop_payment",
    "stop payment": "stop_payment",
    "stop payment order": "stop_payment",
    "stop payments": "stop_payment",
    "counter check fee": "counter_check",
    "temporary check fee": "counter_check",
    "counter checks": "counter_check",
    "temporary checks": "counter_check",
    "temporary check": "counter_check",
    "starter checks": "counter_check",
    "check cashing fee": "check_cashing",
    "check cashing": "check_cashing",
    "non-customer check cashing": "check_cashing",
    "check image fee": "check_image",
    "check copy fee": "check_image",
    "check copy": "check_image",
    "check copies": "check_image",
    "copy of check": "check_image",
    "photocopies": "check_image",
    "photocopy": "check_image",
    "paid check copy": "check_image",
    # --- Digital & Electronic ---
    "ach origination fee": "ach_origination",
    "ach transfer fee": "ach_origination",
    "ach debit fee": "ach_origination",
    "ach return fee": "ach_return",
    "returned ach fee": "ach_return",
    "ach returned item": "ach_return",
    "bill pay fee": "bill_pay",
    "online bill pay fee": "bill_pay",
    "online bill pay": "bill_pay",
    "bill payment fee": "bill_pay",
    "bill payment": "bill_pay",
    "mobile deposit fee": "mobile_deposit",
    "remote deposit fee": "mobile_deposit",
    "zelle fee": "zelle_fee",
    # --- Cash & Deposit ---
    "coin counting fee": "coin_counting",
    "coin machine fee": "coin_counting",
    "coin wrapping fee": "coin_counting",
    "coin counter fee": "coin_counting",
    "coin machine": "coin_counting",
    "cash advance fee": "cash_advance",
    "deposited item return fee": "deposited_item_return",
    "deposited item returned": "deposited_item_return",
    "returned deposited item": "deposited_item_return",
    "returned deposit item": "deposited_item_return",
    "cashed check return fee": "deposited_item_return",
    "collection item": "deposited_item_return",
    "collection items": "deposited_item_return",
    "return deposit item": "deposited_item_return",
    "return item fee": "nsf",
    "night deposit fee": "night_deposit",
    "night depository fee": "night_deposit",
    "night drop fee": "night_deposit",
    # --- Account Services ---
    "notary fee": "notary_fee",
    "notary service": "notary_fee",
    "notary": "notary_fee",
    "notary services": "notary_fee",
    "safe deposit box": "safe_deposit_box",
    "safe deposit box fee": "safe_deposit_box",
    "safety deposit box": "safe_deposit_box",
    "safe deposit": "safe_deposit_box",
    "safe deposit box rental": "safe_deposit_box",
    "garnishment fee": "garnishment_levy",
    "garnishment": "garnishment_levy",
    "garnishment/levy": "garnishment_levy",
    "levy processing fee": "garnishment_levy",
    "levy fee": "garnishment_levy",
    "levies": "garnishment_levy",
    "processing garnishments or levies": "garnishment_levy",
    "legal process fee": "legal_process",
    "legal processing": "legal_process",
    "legal process": "legal_process",
    "subpoena processing fee": "legal_process",
    "subpoena fee": "legal_process",
    "legal fee": "legal_process",
    "account verification fee": "account_verification",
    "account verification": "account_verification",
    "verification of deposit": "account_verification",
    "deposit verification": "account_verification",
    "balance inquiry fee": "balance_inquiry",
    "teller balance inquiry": "balance_inquiry",
    "balance inquiry": "balance_inquiry",
    "signature guarantee": "account_verification",
    "signature guarantees": "account_verification",
    # --- Lending Fees ---
    "late payment fee": "late_payment",
    "late fee": "late_payment",
    "loan origination fee": "loan_origination",
    "origination fee": "loan_origination",
    "appraisal fee": "appraisal_fee",
    # --- Additional Account Maintenance aliases ---
    "monthly account fee": "monthly_maintenance",
    "monthly checking fee": "monthly_maintenance",
    "monthly savings fee": "monthly_maintenance",
    "account maintenance": "monthly_maintenance",
    "account service charge": "monthly_maintenance",
    "monthly account maintenance": "monthly_maintenance",
    "account service fee": "monthly_maintenance",
    "monthly account charge": "monthly_maintenance",
    "monthly charge": "monthly_maintenance",
    "checking account fee": "monthly_maintenance",
    "savings account fee": "monthly_maintenance",
    "account fee": "monthly_maintenance",
    "low balance fee": "minimum_balance",
    "minimum balance charge": "minimum_balance",
    "average balance fee": "minimum_balance",
    "below minimum fee": "minimum_balance",
    "early termination fee": "early_closure",
    "closing account fee": "early_closure",
    "close account": "early_closure",
    "early withdrawal penalty": "early_closure",
    "dormancy fee": "dormant_account",
    "abandoned account fee": "dormant_account",
    "stale account fee": "dormant_account",
    "unclaimed property fee": "dormant_account",
    "record research fee": "account_research",
    "document retrieval fee": "account_research",
    "research per hour": "account_research",
    "account inquiry fee": "account_research",
    "statement mailing fee": "paper_statement",
    "monthly paper statement": "paper_statement",
    "mailed statement fee": "paper_statement",
    "physical statement fee": "paper_statement",
    # --- Additional Overdraft & NSF aliases ---
    "overdraft paid fee": "overdraft",
    "paid od fee": "overdraft",
    "paid item fee": "overdraft",
    "honor fee": "overdraft",
    "honored overdraft": "overdraft",
    "paid nsf fee": "overdraft",
    "od paid item": "overdraft",
    "overdraft per item": "overdraft",
    "overdraft items": "overdraft",
    "bounce protection fee": "overdraft",
    "bounce fee": "overdraft",
    "bounced check fee": "nsf",
    "returned payment fee": "nsf",
    "returned transaction fee": "nsf",
    "returned ach": "ach_return",
    "returned ach item": "ach_return",
    "unpaid item fee": "nsf",
    "unpaid nsf fee": "nsf",
    "nsf item fee": "nsf",
    "nsf check fee": "nsf",
    "nsf per item": "nsf",
    "dishonored check": "nsf",
    "dishonored item": "nsf",
    "per day overdraft fee": "continuous_od",
    "overdraft per day": "continuous_od",
    "od per day": "continuous_od",
    "negative balance per day": "continuous_od",
    "extended od fee": "continuous_od",
    "extended negative balance": "continuous_od",
    "overdraft sweep fee": "od_protection_transfer",
    "od sweep fee": "od_protection_transfer",
    "automatic transfer overdraft": "od_protection_transfer",
    "auto transfer od": "od_protection_transfer",
    "overdraft savings transfer": "od_protection_transfer",
    "overdraft line of credit": "od_line_of_credit",
    "od line of credit": "od_line_of_credit",
    "overdraft loc advance": "od_line_of_credit",
    # --- Additional ATM & Card aliases ---
    "non network atm": "atm_non_network",
    "out of network atm": "atm_non_network",
    "atm non member": "atm_non_network",
    "atm usage fee": "atm_non_network",
    "atm transaction fee": "atm_non_network",
    "other atm fee": "atm_non_network",
    "third party atm": "atm_non_network",
    "atm balance inquiry": "balance_inquiry",
    "atm inquiry fee": "balance_inquiry",
    "new card fee": "card_replacement",
    "reissue card fee": "card_replacement",
    "reissue debit card": "card_replacement",
    "card reissue fee": "card_replacement",
    "instant issue card": "rush_card",
    "instant card fee": "rush_card",
    "rush debit card": "rush_card",
    "overnight card delivery": "rush_card",
    "express card delivery": "rush_card",
    "international purchase fee": "card_foreign_txn",
    "foreign currency fee": "card_foreign_txn",
    "foreign purchase fee": "card_foreign_txn",
    "international service fee": "card_foreign_txn",
    "debit card foreign transaction": "card_foreign_txn",
    "visa international": "card_foreign_txn",
    "mastercard international": "card_foreign_txn",
    # --- Additional Wire Transfer aliases ---
    "wire fee": "wire_domestic_outgoing",
    "wire send fee": "wire_domestic_outgoing",
    "wire receive fee": "wire_domestic_incoming",
    "outbound wire": "wire_domestic_outgoing",
    "inbound wire": "wire_domestic_incoming",
    "domestic outgoing wire": "wire_domestic_outgoing",
    "domestic incoming wire": "wire_domestic_incoming",
    "domestic outbound wire": "wire_domestic_outgoing",
    "domestic inbound wire": "wire_domestic_incoming",
    "intl wire out": "wire_intl_outgoing",
    "intl wire in": "wire_intl_incoming",
    "intl wire transfer": "wire_intl_outgoing",
    "foreign wire transfer": "wire_intl_outgoing",
    "foreign outgoing wire": "wire_intl_outgoing",
    "foreign incoming wire": "wire_intl_incoming",
    # --- Additional Check Services aliases ---
    "cashier check fee": "cashiers_check",
    "cashier check": "cashiers_check",
    "tellers check fee": "cashiers_check",
    "tellers check": "cashiers_check",
    "teller check fee": "cashiers_check",
    "teller check": "cashiers_check",
    "official bank check": "cashiers_check",
    "bank draft fee": "cashiers_check",
    "bank draft": "cashiers_check",
    "money order purchase": "money_order",
    "purchase money order": "money_order",
    "reorder checks": "check_printing",
    "check reorders": "check_printing",
    "checks ordered": "check_printing",
    "first order checks": "check_printing",
    "stop payment per item": "stop_payment",
    "stop payment request": "stop_payment",
    "stop pay": "stop_payment",
    "stop check": "stop_payment",
    "revoke stop payment": "stop_payment",
    "counter check": "counter_check",
    "withdrawal slip": "counter_check",
    "non customer check cashing": "check_cashing",
    "non member check cashing": "check_cashing",
    "check image copy": "check_image",
    "cancelled check copy": "check_image",
    "canceled check copy": "check_image",
    "front and back copy": "check_image",
    "check photocopy": "check_image",
    # --- Additional Digital & Electronic aliases ---
    "ach fee": "ach_origination",
    "ach transfer": "ach_origination",
    "ach origination": "ach_origination",
    "outgoing ach": "ach_origination",
    "incoming ach": "ach_origination",
    "ach return": "ach_return",
    "ach returned item fee": "ach_return",
    "online bill payment": "bill_pay",
    "online bill payment fee": "bill_pay",
    "electronic bill pay": "bill_pay",
    "ebill pay": "bill_pay",
    "remote deposit capture fee": "mobile_deposit",
    "remote deposit capture": "mobile_deposit",
    "mobile check deposit fee": "mobile_deposit",
    "rdc fee": "mobile_deposit",
    # --- Additional Cash & Deposit aliases ---
    "coin counting": "coin_counting",
    "coin processing": "coin_counting",
    "coin deposit fee": "coin_counting",
    "loose coin fee": "coin_counting",
    "coin sorting fee": "coin_counting",
    "cash handling fee": "coin_counting",
    "cash advance": "cash_advance",
    "returned deposit": "deposited_item_return",
    "chargeback deposited item": "deposited_item_return",
    "foreign item collection": "deposited_item_return",
    "night depository": "night_deposit",
    "night deposit bag": "night_deposit",
    "after hours deposit": "night_deposit",
    # --- Additional Account Services aliases ---
    "notarize": "notary_fee",
    "notary public": "notary_fee",
    "notarization fee": "notary_fee",
    "safe deposit box annual": "safe_deposit_box",
    "safe deposit rental": "safe_deposit_box",
    "safe deposit box drilling": "safe_deposit_box",
    "lock box fee": "safe_deposit_box",
    "garnishment processing": "garnishment_levy",
    "levy processing": "garnishment_levy",
    "attachment/levy": "garnishment_levy",
    "tax levy fee": "garnishment_levy",
    "irs levy": "garnishment_levy",
    "court order fee": "legal_process",
    "court order": "legal_process",
    "legal attachment": "legal_process",
    "levy/garnishment": "garnishment_levy",
    "verification of deposit fee": "account_verification",
    "vod fee": "account_verification",
    "deposit verification letter": "account_verification",
    "account confirmation": "account_verification",
    "reference letter fee": "account_verification",
    "credit reference": "account_verification",
    "teller inquiry": "balance_inquiry",
    "phone inquiry fee": "balance_inquiry",
    "telephone inquiry": "balance_inquiry",
    "automated balance inquiry": "balance_inquiry",
    # --- Data hygiene: aliases from 2026-03 cleanup ---
    # Minimum balance variants
    "below minimum balance": "minimum_balance",
    "below minimum": "minimum_balance",
    "below minimum balance charge": "minimum_balance",
    # Reconciliation / research
    "reconciliation fee": "account_research",
    "reconciliation": "account_research",
    "account reconciliation fee": "account_research",
    # Statement variants
    "temporary statement": "paper_statement",
    "statement retention fee": "paper_statement",
    "reproduction of statement": "paper_statement",
    "mailed receipts": "paper_statement",
    # Closure variants
    "reopen closed account": "early_closure",
    "reopen closed account fee": "early_closure",
    "account reopen fee": "early_closure",
    # Card variants
    "replacement atm card": "card_replacement",
    "replacement atm/debit card": "card_replacement",
    "replacement debit card fee": "card_replacement",
    "pin reminder": "card_replacement",
    "pin reminder fee": "card_replacement",
    "visa reloadable card": "card_replacement",
    "visa reloadable card fee": "card_replacement",
    "travel money card": "card_replacement",
    "travel money card fee": "card_replacement",
    "visa over limit fee": "overdraft",
    # Foreign currency
    "foreign currency": "card_foreign_txn",
    "foreign currency exchange": "card_foreign_txn",
    # ATM international variants
    "international atm withdrawal": "atm_international",
    "international atm": "atm_international",
    # Check variants
    "overnight check": "cashiers_check",
    "overnight check fee": "cashiers_check",
    # Deposit correction / returned items
    "deposit correction": "deposited_item_return",
    "deposit correction fee": "deposited_item_return",
    "uncollected funds fee": "nsf",
    "uncollected funds": "nsf",
    "rejected items": "nsf",
    "rejected item fee": "nsf",
    "reclear items": "deposited_item_return",
    # Night deposit variants
    "night deposit lock bag": "night_deposit",
    "night deposit lock bag fee": "night_deposit",
    # Electronic variants
    "sweep fee": "ach_origination",
    "sweep transaction charge": "ach_origination",
    "telephone transfer": "ach_origination",
    "telephone transfer fee": "ach_origination",
    "telephone transfers": "ach_origination",
    "online loan payment": "bill_pay",
    "zelle": "zelle_fee",
    # Currency / coin
    "currency purchase": "coin_counting",
    "currency purchase fee": "coin_counting",
    # Account services
    "signature card update": "account_verification",
    "signature card update fee": "account_verification",
    "medallion stamp": "account_verification",
    "medallion stamp fee": "account_verification",
    "positive pay": "account_verification",
    "positive pay fee": "account_verification",
    "undeliverable address fee": "account_research",
    "return mail processing fee": "account_research",
    "return mail fee": "account_research",
    "missing business document fee": "account_research",
    "lost passbook fee": "account_research",
    "lost passbook": "account_research",
    # Lending
    "skip pay": "late_payment",
    "skip pay fee": "late_payment",
    "skip a pay fee": "late_payment",
    "skip payment fee": "late_payment",
    "late charge": "late_payment",
    "late payment": "late_payment",
    "letter of credit": "loan_origination",
    "letter of credit fee": "loan_origination",
    # OD interest
    "od interest charge": "continuous_od",
    "od interest": "continuous_od",
    # Chargeback
    "chargeback": "card_dispute",
    "dispute fee": "card_dispute",
    # Cash management
    "cash management": "account_research",
    "cash management fee": "account_research",
    # Merchant
    "merchant services": "account_research",
    "merchant services fee": "account_research",
    # IRA transfer
    "ira transfer fee": "account_research",
    "ira transfer": "account_research",
    "ira closing fee": "early_closure",
    "ira termination fee": "early_closure",
    "ira maintenance fee": "monthly_maintenance",
    # Teller transactions
    "teller transaction fee": "account_research",
    "teller fee": "balance_inquiry",
    "excessive teller transaction": "account_research",
    "teller withdrawal fee": "account_research",
    # Excess withdrawal
    "money market withdrawal": "account_research",
    "excess withdrawal fee": "account_research",
    "excess transaction fee": "account_research",
    "reg d violation": "account_research",
    "regulation d fee": "account_research",
    # Business fee
    "business checking fee": "monthly_maintenance",
    "business account fee": "monthly_maintenance",
    # Account closure
    # --- Aliases from pipeline refactor 2026-03 uncategorized analysis ---
    # Per-check / per-item fees
    "per check fee": "check_printing",
    "per check": "check_printing",
    "per item fee": "deposited_item_return",
    # Collection / return fees
    "collection fee": "deposited_item_return",
    "collection": "deposited_item_return",
    # Document / research fees
    "document fee": "account_research",
    "documentation fee": "account_research",
    "address locator fee": "account_research",
    "account balancing assistance": "account_research",
    "account conversion fee": "account_research",
    # Express / courier
    "express mailing": "wire_domestic_outgoing",
    "fedex fee": "wire_domestic_outgoing",
    # Over limit
    "over the credit limit fee": "overdraft",
    "over credit limit fee": "overdraft",
    "over limit fee": "overdraft",
    # Deposit adjustments
    "deposit adjustment": "deposited_item_return",
    "atm deposit adjustment fee": "deposited_item_return",
    "empty envelope deposit": "deposited_item_return",
    # Key / safe deposit
    "key deposit": "safe_deposit_box",
    "key replacement": "safe_deposit_box",
    # Bond
    "indemnity bond": "account_research",
    "bond of indemnity": "account_research",
    # Minimum charge
    "minimum interest charge": "account_research",
    "minimum finance charge": "account_research",
    # Mailed receipt
    "mailed receipt": "paper_statement",
    "mail return fee": "deposited_item_return",
    # Loan coupons
    "loan coupons": "account_research",
    "loan coupon book": "account_research",
    # --- Aliases from uncategorized fee audit (2026-03-22) ---
    # returned_mail / bad_address -> account_research
    "returned mail fee": "account_research",
    "returned mail": "account_research",
    "undeliverable mail fee": "account_research",
    "bad address fee": "account_research",
    "bad address": "account_research",
    # debit_fee / debit_card_fee -> card_replacement (or atm_non_network contextual)
    "debit card fee": "card_replacement",
    # outgoing_fee -> wire_domestic_outgoing
    "outgoing wire fee": "wire_domestic_outgoing",
    "domestic wire fee": "wire_domestic_outgoing",
    # transfer_fee -> od_protection_transfer
    "transfer fee": "od_protection_transfer",
    # inactive_fee -> dormant_account
    "inactive fee": "dormant_account",
    # escheatment -> dormant_account
    "escheatment": "dormant_account",
    "escheat processing fee": "dormant_account",
    "escheat processing": "dormant_account",
    # fax_fee -> account_research
    "fax fee": "account_research",
    "fax service fee": "account_research",
    "fax confirmation": "account_research",
    # check_fee -> check_cashing or check_printing contextual
    "check fee": "check_printing",
    # replacement_fee -> card_replacement
    "replacement fee": "card_replacement",
    # copy_of_paid_check -> check_image
    "copy of paid check": "check_image",
    # account_closed_within_90_days -> early_closure
    "account closed within 90 days": "early_closure",
    "account closed within 90 days of opening": "early_closure",
    # lost_key_fee -> safe_deposit_box
    "lost key fee": "safe_deposit_box",
    "lost safe deposit key": "safe_deposit_box",
    "replacement key": "safe_deposit_box",
    # account_balancing_assistance -> account_research
    "account balancing": "account_research",
    # Telephone/teller -> balance_inquiry
    "telephone banking fee": "balance_inquiry",
    "assisted transaction fee": "balance_inquiry",
    "live teller fee": "balance_inquiry",
    # Remote deposit -> mobile_deposit
    # Signature guarantee -> account_verification
    "medallion signature": "account_verification",
    "bank reference letter": "account_verification",
    # Skip-a-pay -> late_payment
    "skip a payment": "late_payment",
    "skip a payment fee": "late_payment",
    # --- Round 3: uncategorized audit (2026-03-22 night) ---
    "return item charge": "nsf",
    "instant statement": "paper_statement",
    "additional statement": "paper_statement",
    "incorrect mailing address": "account_research",
    "address search": "account_research",
    "credit reports": "account_research",
    "credit report": "account_research",
    "administrative fee": "account_research",
    "excessive withdraw": "overdraft",
    "excessive withdrawal": "overdraft",
    "excessive withdrawal fee": "overdraft",
    "empty atm envelope": "deposited_item_return",
    "atm deposit fee": "mobile_deposit",
    "negative balance closing fee": "early_closure",
    "certified letter fee": "account_research",
    "certified letter": "account_research",
    "early club withdrawal": "early_closure",
    "early club withdrawal fee": "early_closure",
    "christmas club early withdrawal fee": "early_closure",
    "foreign draft": "wire_intl_outgoing",
    "international currency order": "wire_intl_outgoing",
    "canadian check processing fee": "check_cashing",
    "card payment convenience fee": "ach_origination",
    "convenience fee": "ach_origination",
    "line of credit advance fee": "cash_advance",
    "line of credit advance": "cash_advance",
    "due date change": "account_research",
    "due date change fee": "account_research",
    "fax incoming": "account_research",
    "fax outgoing": "account_research",
    "bank bag": "night_deposit",
    "security fee": "account_research",
    "bond coupon redemption": "account_research",
    "expedited check payment": "check_cashing",
    # --- Synonym cluster expansion (Phase 55, 2026-04-09) ---
    # skip-a-pay cluster -> late_payment
    # Note: "skip a pay fee" is a loan deferral product, not a penalty, but maps
    # to late_payment as the closest regulatory fee category available.
    "skip-a-pay fee": "late_payment",
    "skip-a-pay": "late_payment",
    "skip a pay": "late_payment",
    "loan skip payment": "late_payment",
    "loan deferral fee": "late_payment",
    "payment deferral fee": "late_payment",
    # return_mail cluster -> account_research
    "returned mail processing": "account_research",
    "return mail processing": "account_research",
    "mail return processing fee": "account_research",
    "undeliverable address": "account_research",
    "address change fee": "account_research",
    "unclaimed mail fee": "account_research",
    # club_account cluster -> early_closure (penalizes early withdrawal from club accounts)
    "club account fee": "early_closure",
    "christmas club fee": "early_closure",
    "vacation club fee": "early_closure",
    "holiday club fee": "early_closure",
    "savings club fee": "early_closure",
    "club withdrawal fee": "early_closure",
    "club account early withdrawal": "early_closure",
    "christmas club withdrawal": "early_closure",
    # fax_fee cluster -> account_research (administrative service fee)
    "fax service": "account_research",
    "incoming fax fee": "account_research",
    "outgoing fax fee": "account_research",
    "fax transmission fee": "account_research",
    "telefax fee": "account_research",
    # --- Phase 55 audit expansion (2026-04-10) ---
    # High-frequency unmatched fee names from production data.
    # Overdraft / NSF additional patterns
    "nsf item": "nsf",
    "nsf charge": "nsf",
    "nsf returned item": "nsf",
    "insufficient funds charge": "nsf",
    "returned draft fee": "nsf",
    "returned share draft": "nsf",
    "returned share draft fee": "nsf",
    "nonsufficient funds fee": "nsf",
    "non-sufficient funds": "nsf",
    "nonsufficient": "nsf",
    "courtesy pay overdraft": "overdraft",
    "member privilege": "overdraft",
    "privilege pay": "overdraft",
    "privilege pay fee": "overdraft",
    "overlimit fee": "overdraft",
    "nsf overdraft fee": "overdraft",
    "nsf item overdraft fee": "overdraft",
    "overdraft returned": "nsf",
    "nsfs overdrafts paid or returned": "overdraft",
    "atm ach overdraft": "overdraft",
    # Continuous OD patterns from audit
    "continuing overdraft fee": "continuous_od",
    "continuing overdraft fee per day": "continuous_od",
    "sustained overdraft": "continuous_od",
    "daily overdraft": "continuous_od",
    "daily negative balance": "continuous_od",
    "per day negative balance": "continuous_od",
    # Monthly maintenance / account fee patterns
    "service fee": "monthly_maintenance",
    "annual fee": "monthly_maintenance",
    "annual account fee": "monthly_maintenance",
    "quarterly fee": "monthly_maintenance",
    "analysis fee": "monthly_maintenance",
    "account analysis fee": "monthly_maintenance",
    "money service business fee": "monthly_maintenance",
    "msb fee": "monthly_maintenance",
    "escrow account fee": "monthly_maintenance",
    "agency account fee": "monthly_maintenance",
    # Stop payment additional
    "stop payment order fee": "stop_payment",
    "stop ach payment": "stop_payment",
    "stop ach": "stop_payment",
    "revoke stop payment order": "stop_payment",
    # Wire transfer additional patterns
    "wire recall fee": "wire_domestic_outgoing",
    "wire amendment fee": "wire_domestic_outgoing",
    "domestic wire": "wire_domestic_outgoing",
    "fed wire outgoing": "wire_domestic_outgoing",
    "fed wire incoming": "wire_domestic_incoming",
    "fedwire outgoing": "wire_domestic_outgoing",
    "fedwire incoming": "wire_domestic_incoming",
    # ATM patterns
    "non-member atm fee": "atm_non_network",
    "atm fee other banks": "atm_non_network",
    "out of network atm fee": "atm_non_network",
    "point of sale fee": "atm_non_network",
    "pos fee": "atm_non_network",
    "pos transaction fee": "atm_non_network",
    # Card patterns
    "new debit card": "card_replacement",
    "atm card replacement": "card_replacement",
    "atm debit card replacement": "card_replacement",
    "second card fee": "card_replacement",
    "additional card fee": "card_replacement",
    "card fee": "card_replacement",
    "pin change fee": "card_replacement",
    "pin reissue": "card_replacement",
    "expedited card": "rush_card",
    "rush card delivery": "rush_card",
    "rush card replacement": "rush_card",
    "rush card delivery fee": "rush_card",
    "expedited card replacement": "rush_card",
    # Foreign txn additional
    "international service assessment": "card_foreign_txn",
    "international transaction": "card_foreign_txn",
    "foreign transaction": "card_foreign_txn",
    "visa foreign transaction fee": "card_foreign_txn",
    "mastercard foreign transaction fee": "card_foreign_txn",
    # Check patterns
    "cashier checks": "cashiers_check",
    "demand draft": "cashiers_check",
    "demand draft fee": "cashiers_check",
    "corporate check fee": "cashiers_check",
    "temporary checks fee": "counter_check",
    "initial check order": "check_printing",
    "standard check order": "check_printing",
    "duplicate check": "check_image",
    "copy of cancelled check": "check_image",
    "copy of cleared check": "check_image",
    "microfilm research": "check_image",
    "microfilm research fee": "check_image",
    "image statement": "check_image",
    # ACH / electronic additional
    "ach credit": "ach_origination",
    "ach debit": "ach_origination",
    "ach item fee": "ach_origination",
    "ach processing fee": "ach_origination",
    "electronic transfer fee": "ach_origination",
    "external transfer fee": "ach_origination",
    "ach return item": "ach_return",
    "ach return item fee": "ach_return",
    "returned ach item fee": "ach_return",
    # Bill pay additional
    "bill pay": "bill_pay",
    "bill pay service fee": "bill_pay",
    "online payment": "bill_pay",
    "online payment fee": "bill_pay",
    "expedited bill payment": "bill_pay",
    # Remote / mobile deposit additional
    "remote deposit": "mobile_deposit",
    "mobile deposit": "mobile_deposit",
    "mobile check deposit": "mobile_deposit",
    "rdc service fee": "mobile_deposit",
    "rdc monthly fee": "mobile_deposit",
    "remote deposit scanner": "mobile_deposit",
    # Coin / cash additional
    "rolled coin fee": "coin_counting",
    "coin rolling fee": "coin_counting",
    "mixed coin deposit": "coin_counting",
    "loose coin deposit": "coin_counting",
    "bulk coin processing": "coin_counting",
    "currency handling fee": "coin_counting",
    "cash advance on credit card": "cash_advance",
    "visa cash advance fee": "cash_advance",
    # Deposited item return additional
    "deposited item return": "deposited_item_return",
    "cashed check returned": "deposited_item_return",
    "deposited check return": "deposited_item_return",
    "returned deposit item fee": "deposited_item_return",
    "foreign item fee": "deposited_item_return",
    "foreign item collection fee": "deposited_item_return",
    "canadian item fee": "deposited_item_return",
    "foreign check fee": "deposited_item_return",
    # Night deposit additional
    "night depository bag": "night_deposit",
    "night deposit bag fee": "night_deposit",
    "night drop bag": "night_deposit",
    "zipper bag fee": "night_deposit",
    "lock bag fee": "night_deposit",
    "lock bag": "night_deposit",
    "deposit bag": "night_deposit",
    # Safe deposit additional
    "safe deposit box drilling fee": "safe_deposit_box",
    "safe deposit key replacement": "safe_deposit_box",
    "safe deposit lost key": "safe_deposit_box",
    "safety deposit box fee": "safe_deposit_box",
    "safety deposit": "safe_deposit_box",
    "safe deposit box rent": "safe_deposit_box",
    # Garnishment / legal additional
    "garnishment processing fee": "garnishment_levy",
    "wage garnishment fee": "garnishment_levy",
    "child support processing": "garnishment_levy",
    "child support levy": "garnishment_levy",
    "irs levy fee": "garnishment_levy",
    "federal tax levy": "garnishment_levy",
    "legal levy": "garnishment_levy",
    "subpoena processing": "legal_process",
    "summons processing": "legal_process",
    "court order processing": "legal_process",
    "lien release fee": "legal_process",
    "lien release": "legal_process",
    "subordination agreement fee": "legal_process",
    # Account verification additional
    "vod": "account_verification",
    "verification of deposit letter": "account_verification",
    "account verification letter": "account_verification",
    "bank letter fee": "account_verification",
    "credit reference fee": "account_verification",
    "reference letter": "account_verification",
    "audit confirmation": "account_verification",
    "audit confirmation fee": "account_verification",
    "positive pay monthly": "account_verification",
    # Balance inquiry additional
    "telephone banking": "balance_inquiry",
    "phone banking fee": "balance_inquiry",
    "audio response": "balance_inquiry",
    "voice response fee": "balance_inquiry",
    "shared branching fee": "balance_inquiry",
    "shared branch transaction": "balance_inquiry",
    # Dormant / escheatment additional
    "dormant account charge": "dormant_account",
    "abandoned account": "dormant_account",
    "abandoned property": "dormant_account",
    "unclaimed property": "dormant_account",
    "escheat": "dormant_account",
    "escheatment processing": "dormant_account",
    # Early closure additional
    "early account closing": "early_closure",
    "account closed early": "early_closure",
    "close account fee": "early_closure",
    "account termination fee": "early_closure",
    "early certificate withdrawal": "early_closure",
    "cd early withdrawal fee": "early_closure",
    "cd early withdrawal penalty": "early_closure",
    "certificate early withdrawal": "early_closure",
    "share certificate early withdrawal": "early_closure",
    "share certificate early withdrawal fee": "early_closure",
    "early withdrawal fee": "early_closure",
    "ira early withdrawal": "early_closure",
    "ira closing": "early_closure",
    # Lending additional
    "late loan payment": "late_payment",
    "delinquent payment fee": "late_payment",
    "past due fee": "late_payment",
    "loan late fee": "late_payment",
    "skip a loan payment": "late_payment",
    "loan modification": "loan_origination",
    "loan renewal fee": "loan_origination",
    "loan renewal": "loan_origination",
    "loan extension fee": "loan_origination",
    "construction draw fee": "loan_origination",
    "loan payoff fee": "loan_origination",
    "property appraisal fee": "appraisal_fee",
    "home appraisal fee": "appraisal_fee",
    "real estate appraisal": "appraisal_fee",
    # Paper statement additional
    "statement mailing": "paper_statement",
    "paper statement": "paper_statement",
    "printed statement": "paper_statement",
    "mailed statement": "paper_statement",
    "statement request": "paper_statement",
    "interim statement": "paper_statement",
    "additional statement fee": "paper_statement",
    "special statement request": "paper_statement",
    # E-statement additional
    "e statement fee": "estatement_fee",
    "electronic statement": "estatement_fee",
    # Account research additional (catch-all admin fees)
    "research per hour fee": "account_research",
    "account inquiry": "account_research",
    "special handling fee": "account_research",
    "special request fee": "account_research",
    "clerical fee": "account_research",
    "manual processing fee": "account_research",
    "handling fee": "account_research",
    "processing fee": "account_research",
    "miscellaneous fee": "account_research",
    "miscellaneous service fee": "account_research",
    "miscellaneous service charge": "account_research",
    "photocopy fee": "check_image",
    "copy fee": "check_image",
    "document copy fee": "account_research",
    # Minimum balance additional
    "minimum daily balance": "minimum_balance",
    "minimum average balance fee": "minimum_balance",
    "balance deficiency fee": "minimum_balance",
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
    "od_daily_cap": "OD Daily Fee Cap",
    "nsf_daily_cap": "NSF Daily Fee Cap",
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


def _detect_cap_category(cleaned_name: str) -> str | None:
    """Classify fee cap/limit entries into cap categories.

    Returns 'od_daily_cap', 'nsf_daily_cap', or None if not a cap entry.
    """
    # Skip item-count limits ("max 4 per day") — amount is per-item fee, not cap
    if re.search(r"\b(max|maximum|limit)\s+\d+\b", cleaned_name):
        return None

    # Skip "no daily limit" / "no limit" — explicitly says there is NO cap
    if re.search(r"\bno\s+(daily\s+)?limit\b", cleaned_name):
        return None

    # Skip coverage/credit limits (not fee caps)
    if any(w in cleaned_name for w in (
        "access", "credit limit", "overlimit", "over limit", "over the limit",
    )):
        return None

    is_cap = False

    # "fee cap", "overdraft fee cap", etc. (but not "capture")
    if re.search(r"\bcap\b", cleaned_name) and "capture" not in cleaned_name:
        is_cap = True
    # "maximum" or "max" combined with "daily" or "per day"
    elif re.search(r"\b(maximum|max)\b", cleaned_name) and re.search(
        r"\b(daily|per day)\b", cleaned_name
    ):
        is_cap = True
    # "daily limit" or "[fee-type] limit"
    elif re.search(
        r"\b(daily|overdraft|nsf|od|courtesy|bounce)\b.*\blimit\b", cleaned_name
    ):
        is_cap = True
    # "daily maximum"
    elif "daily maximum" in cleaned_name:
        is_cap = True
    # "maximum charge per day"
    elif "maximum charge" in cleaned_name or "max charge" in cleaned_name:
        is_cap = True
    # "Maximum [fee-type]" at start — e.g. "Maximum overdraft/NSF fee"
    elif re.search(r"^(maximum|max)\b", cleaned_name) and re.search(
        r"\b(overdraft|nsf|od|fee|item|charge)\b", cleaned_name
    ):
        is_cap = True

    if not is_cap:
        return None

    # Must relate to OD/NSF fees — skip transaction/withdrawal/deposit limits
    # Note: punctuation stripping joins words (e.g. "overdraft/nsf" → "overdraftnsf")
    # so we relax leading word boundaries for compound terms
    has_nsf = bool(re.search(
        r"(nsf|nonsufficient|insufficient|returned item|returned check)",
        cleaned_name,
    ))
    has_od = bool(re.search(
        r"(overdraft|\bod\b|courtesy|bounce|paid item)", cleaned_name
    ))

    if not has_nsf and not has_od:
        return None  # transaction/withdrawal/deposit limit, not a fee cap

    if has_nsf and not has_od:
        return "nsf_daily_cap"
    return "od_daily_cap"


# Pre-sorted alias list: longest aliases first so specific matches win
_SORTED_ALIASES: list[tuple[str, str]] | None = None


def _get_sorted_aliases() -> list[tuple[str, str]]:
    global _SORTED_ALIASES
    if _SORTED_ALIASES is None:
        _SORTED_ALIASES = sorted(
            FEE_NAME_ALIASES.items(), key=lambda x: -len(x[0])
        )
    return _SORTED_ALIASES


# Regex patterns for fee names that can appear in many word orders
# Each tuple: (compiled_regex, canonical_category)
_REGEX_PATTERNS: list[tuple[re.Pattern, str]] = [
    # Wire transfers (any word order with domestic/international + in/out)
    (re.compile(r"(?=.*wire)(?=.*(?:intl|international|foreign))(?=.*\b(?:in\b|incoming|inbound|receive))"), "wire_intl_incoming"),
    (re.compile(r"(?=.*wire)(?=.*(?:intl|international|foreign))"), "wire_intl_outgoing"),
    (re.compile(r"(?=.*wire)(?=.*\b(?:in\b|incoming|inbound|receive))"), "wire_domestic_incoming"),
    (re.compile(r"(?=.*wire)(?=.*\b(?:out\b|outgoing|outbound|send))"), "wire_domestic_outgoing"),
    # Overdraft variations
    (re.compile(r"(?=.*(?:overdraft|od))(?=.*(?:transfer|sweep|protection))"), "od_protection_transfer"),
    (re.compile(r"(?=.*(?:overdraft|od))(?=.*(?:continuous|sustained|extended|daily|per day|recurring))"), "continuous_od"),
    # NSF variations
    (re.compile(r"(?=.*(?:nsf|non.?sufficient|insufficient|returned))(?=.*(?:item|check|payment|transaction))"), "nsf"),
    # ATM variations
    (re.compile(r"(?=.*atm)(?=.*(?:non.?network|out.?of.?network|foreign|non.?member|third.?party|surcharge))"), "atm_non_network"),
    (re.compile(r"(?=.*atm)(?=.*(?:international|intl|overseas|abroad))"), "atm_international"),
    # Card foreign transaction
    (re.compile(r"(?=.*(?:card|debit|visa|mastercard))(?=.*(?:foreign|international|cross.?border|currency))"), "card_foreign_txn"),
    # Stop payment
    (re.compile(r"stop\s*(?:payment|pay|check)"), "stop_payment"),
    # Garnishment/levy
    (re.compile(r"(?:garnish|levy|attachment|tax levy|irs levy)"), "garnishment_levy"),
]


def _match_regex_patterns(cleaned: str) -> str | None:
    """Try regex-based patterns for fee names with variable word order."""
    for pattern, canonical in _REGEX_PATTERNS:
        if pattern.search(cleaned):
            return canonical
    return None


def normalize_fee_name(raw_name: str) -> str:
    """Map a raw fee name to its canonical form.

    Returns the canonical key (e.g., "overdraft") if matched,
    or a cleaned version of the raw name if no alias matches.
    """
    cleaned = re.sub(r"[^\w\s]", "", raw_name.lower()).strip()
    cleaned = re.sub(r"\s+", " ", cleaned)

    # Detect fee caps/limits — route to dedicated cap categories
    cap_category = _detect_cap_category(cleaned)
    if cap_category:
        return cap_category

    # Force international/foreign wire classification before alias matching
    # (aliases can't reliably handle all word-order variations)
    if ("international" in cleaned or "foreign" in cleaned) and "wire" in cleaned:
        if "incoming" in cleaned:
            return "wire_intl_incoming"
        return "wire_intl_outgoing"

    # Direct alias match
    if cleaned in FEE_NAME_ALIASES:
        return FEE_NAME_ALIASES[cleaned]

    # Regex-based pattern matching (catches word-order variations)
    regex_match = _match_regex_patterns(cleaned)
    if regex_match:
        return regex_match

    # Fuzzy: check if any alias is contained in the cleaned name
    # Sorted longest-first so "continuous overdraft fee" matches before "overdraft fee"
    for alias, canonical in _get_sorted_aliases():
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
# Variant detection and classify_fee() wrapper
# ---------------------------------------------------------------------------

_VARIANT_PATTERNS: list[tuple[re.Pattern, str]] = [
    (re.compile(r"\brush\b"), "rush"),
    (re.compile(r"\bexpress\b"), "express"),
    (re.compile(r"\bwaived?\b"), "waived"),
    (re.compile(r"\bdaily[_ ]cap\b"), "daily_cap"),
    (re.compile(r"\bper[_ ]item\b"), "per_item"),
    (re.compile(r"\btemporary\b"), "temporary"),
]


def detect_variant_type(raw_name: str, fee_category: str | None) -> str | None:
    """Detect fee variant from raw name. Returns variant slug or None for standard fees."""
    if fee_category and fee_category.endswith("_daily_cap"):
        return "daily_cap"
    cleaned = raw_name.lower()
    for pattern, variant in _VARIANT_PATTERNS:
        if pattern.search(cleaned):
            return variant
    return None


def classify_fee(raw_name: str) -> tuple[str | None, str | None, str | None]:
    """Classify a raw fee name into (fee_category, canonical_fee_key, variant_type).

    Returns:
        fee_category: the normalized slug (same as normalize_fee_name output)
        canonical_fee_key: the stable aggregation key, or None if unmatched
        variant_type: rush/express/waived/daily_cap/per_item/temporary or None
    """
    fee_category = normalize_fee_name(raw_name)
    canonical_fee_key = CANONICAL_KEY_MAP.get(fee_category)
    variant_type = detect_variant_type(raw_name, fee_category)
    return fee_category, canonical_fee_key, variant_type


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
        if n >= 2:
            quartiles = statistics.quantiles(amounts_sorted, n=4)
            p25 = quartiles[0]
            p75 = quartiles[2]
        else:
            p25 = amounts_sorted[0]
            p75 = amounts_sorted[-1]

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
