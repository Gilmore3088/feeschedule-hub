/**
 * Static educational explainers for spotlight and core fee categories.
 * Each entry is one plain-language sentence explaining what the fee is
 * and why it matters to a consumer.
 *
 * Content is curated per category — not AI-generated at runtime.
 * The quantified comparison (actual dollars) is injected from live index data at render time.
 */

export type FeeExplainer = {
  category: string;
  explainer: string;
};

export const FEE_EXPLAINERS: Record<string, string> = {
  // Spotlight (6)
  overdraft:
    "This is the fee your bank charges when a purchase or withdrawal takes your account below zero — it hits hardest on small transactions you might not even notice.",
  nsf: "Your bank charges this when a payment bounces because there isn't enough money in your account — you still don't get what you tried to pay for, and you lose this fee too.",
  monthly_maintenance:
    "This is a recurring fee just for having the account — it comes out every month whether you use the account or not.",
  atm_non_network:
    "This is what your bank charges when you use an ATM outside their network — on top of whatever the ATM owner charges you.",
  card_foreign_txn:
    "Every time you swipe your card outside the US or buy something in a foreign currency, your bank takes a cut of the transaction.",
  wire_domestic_outgoing:
    "This is the fee for sending money via wire transfer — typically used for large or urgent payments like closing on a house.",

  // Core (9)
  savings_excess_withdrawal:
    "Banks can charge this when you make more than the allowed number of withdrawals from your savings account in a month.",
  wire_domestic_incoming:
    "Even receiving money by wire transfer can cost you — your bank charges a fee just for accepting the incoming funds.",
  stop_payment:
    "If you need to cancel a check or recurring payment you've already authorized, your bank charges this fee to stop it.",
  cashiers_check:
    "A cashier's check is guaranteed by the bank, so landlords and car dealers often require them — but the bank charges you for the guarantee.",
  money_order:
    "Money orders are a way to send guaranteed funds without a checking account, but each one comes with a fee.",
  account_closure:
    "Some banks charge you a fee for closing your account — especially if you close it within the first few months.",
  paper_statement:
    "If you want a physical copy of your bank statement mailed to you instead of going paperless, this is what it costs.",
  dormancy:
    "If you stop using your account for a while, your bank starts charging a monthly inactivity fee that slowly drains your balance.",
  safe_deposit_box:
    "This is the annual rental fee for a secure box at your bank's vault — prices vary widely by box size and location.",
};

/**
 * Returns the static explainer string for a fee category, or null if no
 * explainer is available. Callers should render nothing when null is returned.
 */
export function getExplainer(category: string): string | null {
  return FEE_EXPLAINERS[category] ?? null;
}
