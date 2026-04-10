/**
 * Fee taxonomy constants ported from fee_crawler/fee_analysis.py.
 * Single source of truth for fee families, display names, and colors in the UI.
 */

export const FEE_FAMILIES: Record<string, string[]> = {
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
};

export const DISPLAY_NAMES: Record<string, string> = {
  // Account Maintenance
  monthly_maintenance: "Monthly Maintenance",
  minimum_balance: "Minimum Balance",
  early_closure: "Early Account Closure",
  dormant_account: "Dormant Account",
  account_research: "Account Research",
  paper_statement: "Paper Statement",
  estatement_fee: "E-Statement",
  // Overdraft & NSF
  overdraft: "Overdraft (OD)",
  nsf: "NSF / Returned Item",
  continuous_od: "Continuous Overdraft",
  od_protection_transfer: "OD Protection Transfer",
  od_line_of_credit: "OD Line of Credit",
  od_daily_cap: "OD Daily Fee Cap",
  nsf_daily_cap: "NSF Daily Fee Cap",
  // ATM & Card
  atm_non_network: "Non-Network ATM",
  atm_international: "International ATM",
  card_replacement: "Debit Card Replacement",
  rush_card: "Rush Card Delivery",
  card_foreign_txn: "Foreign Transaction",
  card_dispute: "Card Dispute",
  // Wire Transfers
  wire_domestic_outgoing: "Wire Transfer (Domestic Out)",
  wire_domestic_incoming: "Wire Transfer (Domestic In)",
  wire_intl_outgoing: "Wire Transfer (Int'l Out)",
  wire_intl_incoming: "Wire Transfer (Int'l In)",
  // Check Services
  cashiers_check: "Cashier's Check",
  money_order: "Money Order",
  check_printing: "Check Printing",
  stop_payment: "Stop Payment",
  counter_check: "Counter/Temporary Check",
  check_cashing: "Check Cashing",
  check_image: "Check Image/Copy",
  // Digital & Electronic
  ach_origination: "ACH Origination",
  ach_return: "ACH Return",
  bill_pay: "Bill Pay",
  mobile_deposit: "Mobile Deposit",
  zelle_fee: "Zelle",
  // Cash & Deposit
  coin_counting: "Coin Counting",
  cash_advance: "Cash Advance",
  deposited_item_return: "Deposited Item Return",
  night_deposit: "Night Deposit",
  // Account Services
  notary_fee: "Notary Service",
  safe_deposit_box: "Safe Deposit Box",
  garnishment_levy: "Garnishment/Levy",
  legal_process: "Legal Process/Subpoena",
  account_verification: "Account Verification",
  balance_inquiry: "Balance Inquiry",
  // Lending Fees
  late_payment: "Late Payment",
  loan_origination: "Loan Origination",
  appraisal_fee: "Appraisal",
};

/**
 * Canonical key map: stable aggregation keys mirroring Python CANONICAL_KEY_MAP.
 * For the 49 base categories, canonical_fee_key === fee_category (identity mapping).
 * Synonym clusters map long-tail slugs to a single canonical key.
 *
 * IMPORTANT: Keep in sync with fee_crawler/fee_analysis.py CANONICAL_KEY_MAP.
 * Cross-language sync is enforced by fee-taxonomy.test.ts.
 */
export const CANONICAL_KEY_MAP: Record<string, string> = {
  // Account Maintenance
  monthly_maintenance: "monthly_maintenance",
  minimum_balance: "minimum_balance",
  early_closure: "early_closure",
  dormant_account: "dormant_account",
  account_research: "account_research",
  paper_statement: "paper_statement",
  estatement_fee: "estatement_fee",
  // Overdraft & NSF
  overdraft: "overdraft",
  nsf: "nsf",
  continuous_od: "continuous_od",
  od_protection_transfer: "od_protection_transfer",
  od_line_of_credit: "od_line_of_credit",
  od_daily_cap: "od_daily_cap",
  nsf_daily_cap: "nsf_daily_cap",
  // ATM & Card
  atm_non_network: "atm_non_network",
  atm_international: "atm_international",
  card_replacement: "card_replacement",
  rush_card: "rush_card",
  card_foreign_txn: "card_foreign_txn",
  card_dispute: "card_dispute",
  // Wire Transfers
  wire_domestic_outgoing: "wire_domestic_outgoing",
  wire_domestic_incoming: "wire_domestic_incoming",
  wire_intl_outgoing: "wire_intl_outgoing",
  wire_intl_incoming: "wire_intl_incoming",
  // Check Services
  cashiers_check: "cashiers_check",
  money_order: "money_order",
  check_printing: "check_printing",
  stop_payment: "stop_payment",
  counter_check: "counter_check",
  check_cashing: "check_cashing",
  check_image: "check_image",
  // Digital & Electronic
  ach_origination: "ach_origination",
  ach_return: "ach_return",
  bill_pay: "bill_pay",
  mobile_deposit: "mobile_deposit",
  zelle_fee: "zelle_fee",
  // Cash & Deposit
  coin_counting: "coin_counting",
  cash_advance: "cash_advance",
  deposited_item_return: "deposited_item_return",
  night_deposit: "night_deposit",
  // Account Services
  notary_fee: "notary_fee",
  safe_deposit_box: "safe_deposit_box",
  garnishment_levy: "garnishment_levy",
  legal_process: "legal_process",
  account_verification: "account_verification",
  balance_inquiry: "balance_inquiry",
  // Lending Fees
  late_payment: "late_payment",
  loan_origination: "loan_origination",
  appraisal_fee: "appraisal_fee",
  // Synonym clusters: long-tail slugs -> canonical key
  rush_card_delivery: "rush_card",
  estatement: "estatement_fee",
  check_image_charge: "check_image",
  skip_a_pay: "late_payment",
  return_mail: "account_research",
  club_account: "early_closure",
  fax_fee: "account_research",
  safe_deposit: "safe_deposit_box",
};

/** Total number of entries in CANONICAL_KEY_MAP (for cross-language sync assertions). */
export const CANONICAL_KEY_COUNT = Object.keys(CANONICAL_KEY_MAP).length;

export const FAMILY_COLORS: Record<string, { border: string; bg: string; text: string }> = {
  "Account Maintenance": { border: "border-l-blue-500", bg: "bg-blue-50", text: "text-blue-700" },
  "Overdraft & NSF": { border: "border-l-red-500", bg: "bg-red-50", text: "text-red-700" },
  "ATM & Card": { border: "border-l-amber-500", bg: "bg-amber-50", text: "text-amber-700" },
  "Wire Transfers": { border: "border-l-purple-500", bg: "bg-purple-50", text: "text-purple-700" },
  "Check Services": { border: "border-l-slate-500", bg: "bg-slate-50", text: "text-slate-700" },
  "Digital & Electronic": { border: "border-l-cyan-500", bg: "bg-cyan-50", text: "text-cyan-700" },
  "Cash & Deposit": { border: "border-l-emerald-500", bg: "bg-emerald-50", text: "text-emerald-700" },
  "Account Services": { border: "border-l-indigo-500", bg: "bg-indigo-50", text: "text-indigo-700" },
  "Lending Fees": { border: "border-l-orange-500", bg: "bg-orange-50", text: "text-orange-700" },
};

export function getDisplayName(category: string): string {
  return DISPLAY_NAMES[category] ?? category.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function getFeeFamily(category: string): string | null {
  for (const [family, members] of Object.entries(FEE_FAMILIES)) {
    if (members.includes(category)) return family;
  }
  return null;
}

export function getFamilyColor(family: string) {
  return FAMILY_COLORS[family] ?? { border: "border-l-gray-400", bg: "bg-gray-50", text: "text-gray-700" };
}

// --- Fee Tier System ---

export type FeeTier = "spotlight" | "core" | "extended" | "comprehensive";

/**
 * Maps every fee category to a tier based on industry benchmarking importance.
 * Spotlight + Core = "Featured" (15 fees shown by default).
 * Extended + Comprehensive = shown only via "Show all" toggle.
 */
export const FEE_TIERS: Record<string, FeeTier> = {
  // Spotlight (6) — FDIC-mandated, Bankrate headline, CFPB regulatory targets
  monthly_maintenance: "spotlight",
  overdraft: "spotlight",
  nsf: "spotlight",
  atm_non_network: "spotlight",
  card_foreign_txn: "spotlight",
  wire_domestic_outgoing: "spotlight",

  // Core (9) — frequently compared in surveys, on most fee schedules
  stop_payment: "core",
  wire_intl_outgoing: "core",
  wire_domestic_incoming: "core",
  cashiers_check: "core",
  od_protection_transfer: "core",
  paper_statement: "core",
  minimum_balance: "core",
  card_replacement: "core",
  deposited_item_return: "core",

  // Extended (15) — tracked, accessible via expansion
  dormant_account: "extended",
  early_closure: "extended",
  money_order: "extended",
  wire_intl_incoming: "extended",
  continuous_od: "extended",
  atm_international: "extended",
  garnishment_levy: "extended",
  safe_deposit_box: "extended",
  account_research: "extended",
  check_printing: "extended",
  coin_counting: "extended",
  ach_origination: "extended",
  ach_return: "extended",
  rush_card: "extended",
  late_payment: "extended",

  // Comprehensive (19) — rarely benchmarked, often free, or niche
  od_daily_cap: "comprehensive",
  nsf_daily_cap: "comprehensive",
  od_line_of_credit: "comprehensive",
  counter_check: "comprehensive",
  check_cashing: "comprehensive",
  check_image: "comprehensive",
  bill_pay: "comprehensive",
  mobile_deposit: "comprehensive",
  zelle_fee: "comprehensive",
  cash_advance: "comprehensive",
  night_deposit: "comprehensive",
  notary_fee: "comprehensive",
  legal_process: "comprehensive",
  account_verification: "comprehensive",
  balance_inquiry: "comprehensive",
  estatement_fee: "comprehensive",
  loan_origination: "comprehensive",
  appraisal_fee: "comprehensive",
  card_dispute: "comprehensive",
};

const FEATURED_TIERS: Set<FeeTier> = new Set(["spotlight", "core"]);

export function getFeeTier(category: string): FeeTier {
  return FEE_TIERS[category] ?? "comprehensive";
}

export function isFeaturedFee(category: string): boolean {
  return FEATURED_TIERS.has(getFeeTier(category));
}

export function getFeaturedCategories(): string[] {
  return Object.entries(FEE_TIERS)
    .filter(([, tier]) => FEATURED_TIERS.has(tier))
    .map(([cat]) => cat);
}

export function getSpotlightCategories(): string[] {
  return Object.entries(FEE_TIERS)
    .filter(([, tier]) => tier === "spotlight")
    .map(([cat]) => cat);
}

/** Total number of categories in the taxonomy. */
export const TAXONOMY_COUNT = Object.values(FEE_FAMILIES).flat().length;
export const FEATURED_COUNT = getFeaturedCategories().length;
