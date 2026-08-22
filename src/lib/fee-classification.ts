/**
 * Fee segment classification: the ordered pattern table and the resolver.
 *
 * Deliberately dependency-free apart from the taxonomy so it can be imported by
 * tests and offline audit harnesses without pulling in the database connection
 * that `knox/extract.ts` needs. `extract.ts` re-exports both symbols, so
 * existing imports keep working.
 */
import { CANONICAL_KEY_MAP } from "@/lib/fee-taxonomy";

export interface FeePattern {
  key: string;
  pattern: RegExp;
}

/**
 * ORDERING RULE — read before editing.
 *
 * `classifySegment` uses `FEE_PATTERNS.find(...)`: the FIRST pattern that matches
 * wins. Every pattern must therefore appear ABOVE any more general pattern that
 * would also match its segments. A specific key placed below a generic one that
 * subsumes it is unreachable dead code and silently mis-files every row it
 * should have claimed.
 *
 * `FEE_PATTERNS.reachability` in extract.test.ts asserts this. If you add a key,
 * add a probe segment there in the same change.
 *
 * Groups below run most-specific to least-specific within each fee family.
 */

/** Language that marks a ceiling rather than a per-occurrence charge. */
const CAP_LANGUAGE = String.raw`(?=.*\b(maximum|max\.?|cap|capped|not to exceed|no more than|limit|limited to)\b)`;

/**
 * Credit-union euphemisms for overdraft. "Courtesy Pay" is the dominant term at
 * credit unions, which are 4,419 of the 8,750 institutions in the registry —
 * without it, a large share of CU overdraft lines never classify at all.
 */
const OD_SYNONYM = String.raw`\b(courtesy pay|bounce protection|bounce paid|paid item|privilege pay|overdraft privilege)\b`;

/**
 * Unambiguously-overseas language. Note the deliberate absence of a bare
 * "foreign": in a US consumer schedule "Foreign ATM" means out-of-network, not
 * international, and treating it as international reclassifies a large share of
 * real out-of-network ATM fees. No trailing \b — "U.S." ends in a period, and a
 * word boundary cannot follow it.
 */
const ABROAD = String.raw`(?:international|abroad|overseas|foreign country|outside\s+(?:the\s+)?(?:u\.?\s?s\.?a?\.?|united\s+states))`;

export const FEE_PATTERNS: FeePattern[] = [
  // --- Overdraft & NSF: caps first, then specific variants, then the generics.
  // A daily cap ("Maximum overdraft/NSF fee $384.00 daily") is a ceiling, not a
  // fee. Filing it as `overdraft` corrupts every range and median for the key.
  { key: "od_daily_cap", pattern: new RegExp(`${CAP_LANGUAGE}(?=.*(\\b(overdraft|OD)\\b|${OD_SYNONYM}))`, "i") },
  { key: "nsf_daily_cap", pattern: new RegExp(`${CAP_LANGUAGE}(?=.*\\b(NSF|N\\.S\\.F\\.?|non[-\\s]?sufficient|insufficient funds|returned items?)\\b)`, "i") },
  { key: "continuous_od", pattern: /\b(continuous|sustained|extended|prolonged).{0,30}\boverdraft\b/i },
  // Order-independent: real labels put the words either way round —
  // "Overdraft Transfer Fee" and "Transfer From Shares to Cover Overdraft".
  // A distance-bounded pattern missed the second form and let it fall through
  // to the plain `overdraft` key.
  { key: "od_protection_transfer", pattern: /(?=.*\b(overdraft|OD protection)\b)(?=.*\btransfers?\b)/i },
  { key: "od_line_of_credit", pattern: /\b(overdraft|OD)\b.{0,40}\bline of credit\b|\bline of credit\b.{0,40}\b(overdraft|OD)\b/i },
  { key: "overdraft", pattern: new RegExp(`\\boverdraft\\b|${OD_SYNONYM}`, "i") },
  // ACH returns before `nsf`: "ACH returned item" matches the nsf pattern's
  // `returned item` branch, so ach_return was previously unreachable.
  { key: "ach_return", pattern: /(?=.*\bACH\b)(?=.*\b(return|returned|rejected)\b)/i },
  { key: "ach_origination", pattern: /\bACH.{0,30}\b(origination|batch)\b/i },
  { key: "deposited_item_return", pattern: /\b(deposited items? returns?|returned deposited items?|return(ed)? deposited items?|chargeback)\b/i },
  { key: "nsf", pattern: /\b(NSF|N\.S\.F\.?|non[-\s]?sufficient|insufficient funds|returned items?|return item)\b/i },

  // --- IRA before monthly_maintenance: "IRA annual maintenance" would otherwise
  // be claimed by the maintenance pattern below.
  { key: "ira_administration", pattern: /\bIRA.{0,30}\b(administration|annual|maintenance)\b/i },
  { key: "ira_termination", pattern: /\bIRA.{0,30}\b(termination|closing|closure)\b/i },

  // --- Account maintenance. Tightened: the previous pattern matched a bare
  // "monthly" or a bare "maintenance" anywhere in the segment, which is the
  // likeliest source of the $5,000 / $2,500 monthly_maintenance outliers in the
  // published set. Requires the word to be attached to a fee/charge/service.
  { key: "monthly_maintenance", pattern: /\b(maintenance (fee|charge)|monthly (service|maintenance|account) (fee|charge)|monthly (fee|charge)|service charge|account service (fee|charge))\b/i },
  { key: "minimum_balance", pattern: /\bminimum balance\b/i },

  // --- ATM & card: specific before the bare-ATM catch-all.
  // "Foreign ATM" in a US consumer schedule means OUT-OF-NETWORK, not overseas —
  // which is why the original atm_non_network pattern listed it explicitly.
  // atm_international must require unambiguous language and must never claim a
  // bare "foreign", or every out-of-network ATM fee in the corpus reclassifies.
  {
    key: "atm_international",
    pattern: new RegExp(`\\b${ABROAD}.{0,30}\\bATM\\b|\\bATM\\b.{0,30}\\b${ABROAD}`, "i"),
  },
  { key: "balance_inquiry", pattern: /\bbalance inquiry\b/i },
  // Bidirectional: real schedules write both "Card replacement" and "Replacement
  // debit card". Must also precede atm_non_network, whose bare `ATM` branch
  // otherwise claims "ATM/Debit Card Replacement Fee".
  { key: "card_replacement", pattern: /\b(replacement|replace)\b.{0,30}\b(card|debit|PIN)\b|\b(card|debit|PIN)\b.{0,30}\b(replacement|replace)\b/i },
  { key: "atm_non_network", pattern: /\b(ATM|non[-\s]?network|foreign ATM|out[-\s]?of[-\s]?network)\b/i },
  { key: "card_foreign_txn", pattern: /\b(foreign transaction|international transaction)\b/i },
  { key: "rush_card", pattern: /(?=.*\b(rush|expedited|express delivery|overnight)\b)(?=.*\b(card|debit|plastic)\b)/i },
  { key: "wire_intl_outgoing", pattern: /(?=.*\b(international|foreign)\b)(?=.*\b(outgoing|send|sent)\b)(?=.*\bwire\b)/i },
  { key: "wire_intl_incoming", pattern: /(?=.*\b(international|foreign)\b)(?=.*\b(incoming|receive|received)\b)(?=.*\bwire\b)/i },
  { key: "wire_domestic_outgoing", pattern: /(?=.*\b(outgoing|send|sent)\b)(?=.*\bwires?\b)/i },
  { key: "wire_domestic_incoming", pattern: /(?=.*\b(incoming|receive|received)\b)(?=.*\bwires?\b)/i },
  // stop_payment first: "Official Check Stop Payment" is a stop-payment fee,
  // but `official check` below would claim it.
  { key: "stop_payment", pattern: /\bstop payment\b/i },
  { key: "cashiers_check", pattern: /\b(cashier'?s checks?|official checks?|certified checks?|bank checks?)\b/i },
  { key: "money_order", pattern: /\bmoney order\b/i },
  // counter_check had NO pattern at all, yet it is the highest-volume published
  // category (331 rows) — every one of them came from the legacy archive,
  // because the extractor could never produce the key. Real labels are almost
  // always "Temporary Checks"; "counter check" is the rarer phrasing.
  // Must precede check_printing, which claims "checks order"/"order checks".
  {
    key: "counter_check",
    pattern: /\b(counter|temporary|temp\.?|starter)\s+(check|draft|share draft)s?\b|\btemporary share drafts?\b/i,
  },
  { key: "check_printing", pattern: /\b(check printing|checks order|order checks)\b/i },
  { key: "check_image", pattern: /\b(check images?|check cop(y|ies)|copy of (check|draft)|photocopy of (check|draft)s?)\b/i },
  { key: "check_cashing", pattern: /\bcheck cashing\b|(?=.*\bcashing\b)(?=.*\bchecks?\b)/i },
  { key: "paper_statement", pattern: /\b(paper statements?|statement cop(y|ies)|mailed statements?|copy of statement)\b/i },
  { key: "estatement_fee", pattern: /\be[-\s]?statement\b/i },
  { key: "zelle_fee", pattern: /\bzelle\b/i },
  { key: "bill_pay", pattern: /\bbill pay(ment)?\b/i },
  { key: "mobile_deposit", pattern: /\b(mobile|remote) deposit\b/i },
  { key: "coin_counting", pattern: /\bcoin (counting|processing|services?|rolling)\b/i },
  { key: "cash_advance", pattern: /\bcash advance\b/i },
  { key: "night_deposit", pattern: /\bnight deposit\b/i },
  { key: "notary_fee", pattern: /\bnotary\b/i },
  { key: "safe_deposit_box", pattern: /\b(safe deposit|lock box|lost key|drill)\b/i },
  { key: "garnishment_levy", pattern: /\b(garnishments?|levy|levies)\b/i },
  { key: "legal_process", pattern: /\b(legal process(ing)?|legal proceeding|subpoenas?|court order|lien release|subordination|discharge of mortgage)\b/i },
  { key: "account_verification", pattern: /\baccount verification\b|\bverification of (deposit|account)\b/i },
  { key: "late_payment", pattern: /\blate (payment|charge|fee)\b/i },
  { key: "loan_origination", pattern: /\bloan (origination|processing|extension|modification)\b/i },
  { key: "appraisal_fee", pattern: /\bappraisal\b/i },
  { key: "gift_card_purchase", pattern: /\bgift card\b/i },
  { key: "prepaid_card_reload", pattern: /\b(prepaid|reload).{0,30}\bcard\b/i },
  { key: "early_closure", pattern: /\b(early account closure|closed within|early closing)\b/i },
  { key: "dormant_account", pattern: /\b(dormant|inactive|escheat(ment)?|abandoned|under utilization|inactivity)\b/i },
  { key: "account_research", pattern: /\b(account research|research fee|reconciliation|account balancing)\b/i },
];

export function classifySegment(segment: string): string | null {
  const match = FEE_PATTERNS.find((entry) => entry.pattern.test(segment));
  if (!match) return null;
  return CANONICAL_KEY_MAP[match.key] ?? null;
}
