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
    "wire transfer domestic outgoing": "wire_domestic_outgoing",
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
    "returned ach": "nsf",
    "returned ach item": "nsf",
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
    "returned ach": "ach_return",
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
    "deposited item returned": "deposited_item_return",
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
    "foreign currency fee": "card_foreign_txn",
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
    "chargeback fee": "card_dispute",
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
    "teller fee": "account_research",
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
    "account closure fee": "early_closure",
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
    "key deposit": "safe_deposit",
    "key replacement": "safe_deposit",
    # Bond
    "indemnity bond": "account_research",
    "bond of indemnity": "account_research",
    # Minimum charge
    "minimum interest charge": "account_research",
    "minimum finance charge": "account_research",
    # Mailed receipt
    "mailed receipt": "statement_copy",
    "mail return fee": "deposited_item_return",
    # Loan coupons
    "loan coupons": "account_research",
    "loan coupon book": "account_research",
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
