/**
 * Per-canonical-key plausibility envelopes and unit compatibility.
 *
 * Replaces the single global $2,500 ceiling that Darwin applied to all 65 fee
 * concepts. That ceiling is why a $250 daily overdraft cap and a $5,000 monthly
 * maintenance fee both verified without comment: both are under $2,500, and
 * nothing else about them was checked.
 *
 * Two independent checks:
 *
 *   1. AMOUNT — is the value inside a plausible band for this specific concept?
 *   2. UNIT   — is the frequency one this concept can actually carry? A daily
 *              overdraft "fee" is a cap that was mis-keyed; a per-item monthly
 *              maintenance charge is an extraction error.
 *
 * Both produce a `review` verdict, never a silent pass and never a hard delete.
 * Out-of-envelope rows are held for review so a human decides, which is the only
 * safe way to raise auto-approval rates.
 *
 * ---------------------------------------------------------------------------
 * PROVENANCE OF THESE BANDS
 *
 * The bands below are seeded from the observed distribution of the 3,741 live
 * published rows (22 Aug 2026 audit) widened for headroom, NOT from first
 * principles. They are a starting point, not an SLA.
 *
 * Re-derive them from live data with `supabase/analysis/derive-fee-envelopes.sql`
 * and update this file rather than hand-tuning individual numbers. The intent is
 * that the bands track the corpus as coverage grows.
 * ---------------------------------------------------------------------------
 */

export type FeeFrequency =
  | "monthly"
  | "annual"
  | "per_item"
  | "per_transaction"
  | "one_time"
  | "daily";

export interface FeeEnvelope {
  /** Inclusive lower bound. $0 fees are legitimate ("no charge") and handled separately. */
  min: number;
  /** Inclusive upper bound. */
  max: number;
  /**
   * Frequencies this concept can carry. An empty/omitted list means any
   * frequency is acceptable. `null` frequency (undetected) never fails.
   */
  frequencies?: FeeFrequency[];
  /** Short note explaining a non-obvious band, surfaced in the review reason. */
  note?: string;
}

/**
 * Fallback ceiling for keys with no envelope defined. Matches the previous
 * global behaviour so adding this module cannot reject anything that used to
 * pass on an unlisted key.
 */
export const DEFAULT_MAX_AMOUNT = 2_500;

/**
 * Charged per event rather than per period.
 *
 * `per_occurrence` is by far the most common value in the live catalog (152 of
 * a random 200) and `one_time` is next; both normalize into this group. Knox's
 * `detectFrequency` emits `per_item`, so the two vocabularies have to meet here.
 */
const PER_OCCURRENCE: FeeFrequency[] = ["per_item", "per_transaction", "one_time"];

export const FEE_ENVELOPES: Record<string, FeeEnvelope> = {
  // --- Overdraft & NSF ------------------------------------------------------
  // Published median $30, observed range $0–$40. A value above ~$60 is either a
  // cap mis-keyed as a fee or a multi-item total.
  overdraft: { min: 1, max: 60, frequencies: PER_OCCURRENCE, note: "per-item overdraft charge" },
  nsf: { min: 1, max: 60, frequencies: PER_OCCURRENCE, note: "per-item NSF charge" },
  continuous_od: { min: 1, max: 100, note: "sustained-overdraft charge, often daily" },
  od_protection_transfer: { min: 0, max: 30, frequencies: PER_OCCURRENCE },
  od_line_of_credit: { min: 0, max: 50 },
  // Caps are ceilings, not fees. Published median $120, observed range $3–$600.
  od_daily_cap: { min: 10, max: 750, frequencies: ["daily"], note: "daily overdraft ceiling" },
  nsf_daily_cap: { min: 10, max: 750, frequencies: ["daily"], note: "daily NSF ceiling" },

  // --- Account maintenance --------------------------------------------------
  // Published median $7. The $5,000 / $2,500 / $1,250 rows in the live set are
  // the clearest plausibility failures in the database.
  monthly_maintenance: { min: 1, max: 75, frequencies: ["monthly"], note: "monthly consumer checking charge" },
  minimum_balance: { min: 1, max: 75, frequencies: ["monthly"] },
  paper_statement: { min: 0.2, max: 15, frequencies: [...PER_OCCURRENCE, "monthly"] },
  estatement_fee: { min: 0.5, max: 15, frequencies: ["monthly"] },
  early_closure: { min: 5, max: 100 },
  // Escheatment and abandoned-account processing are one-off events, not
  // periodic charges — both appeared per_occurrence in the live sample.
  dormant_account: { min: 1, max: 50 },
  // Live sample holds $1-$2 account printouts and history copies under a $5
  // floor. Real account-research charges span a printout to an hourly rate.
  account_research: { min: 0.25, max: 100, note: "printout through hourly research" },

  // --- ATM & card -----------------------------------------------------------
  atm_non_network: { min: 0.5, max: 10, frequencies: PER_OCCURRENCE },
  atm_international: { min: 0.5, max: 15, frequencies: PER_OCCURRENCE },
  card_replacement: { min: 1, max: 50, frequencies: PER_OCCURRENCE },
  rush_card: { min: 5, max: 150, frequencies: PER_OCCURRENCE },
  card_foreign_txn: { min: 0.5, max: 15, note: "flat charge; percentage rates are not amounts" },
  card_dispute: { min: 0, max: 50 },

  // --- Wires ----------------------------------------------------------------
  wire_domestic_outgoing: { min: 5, max: 75, frequencies: PER_OCCURRENCE },
  wire_domestic_incoming: { min: 0, max: 50, frequencies: PER_OCCURRENCE },
  wire_intl_outgoing: { min: 10, max: 125, frequencies: PER_OCCURRENCE },
  wire_intl_incoming: { min: 0, max: 75, frequencies: PER_OCCURRENCE },

  // --- Checks & cash --------------------------------------------------------
  cashiers_check: { min: 1, max: 40, frequencies: PER_OCCURRENCE },
  money_order: { min: 0.5, max: 20, frequencies: PER_OCCURRENCE },
  stop_payment: { min: 5, max: 60, frequencies: PER_OCCURRENCE },
  counter_check: { min: 0.25, max: 20, frequencies: PER_OCCURRENCE },
  check_printing: { min: 5, max: 60 },
  check_image: { min: 0.25, max: 20, frequencies: [...PER_OCCURRENCE, "monthly"] },
  check_cashing: { min: 1, max: 30, frequencies: PER_OCCURRENCE },
  deposited_item_return: { min: 1, max: 50, frequencies: PER_OCCURRENCE },
  coin_counting: { min: 0.5, max: 25 },
  cash_advance: { min: 1, max: 50, frequencies: PER_OCCURRENCE },

  // --- Electronic -----------------------------------------------------------
  ach_return: { min: 1, max: 50, frequencies: PER_OCCURRENCE },
  ach_origination: { min: 0.1, max: 50 },
  bill_pay: { min: 0.5, max: 20, frequencies: ["monthly", "per_item"] },
  mobile_deposit: { min: 0.1, max: 15, frequencies: [...PER_OCCURRENCE, "monthly"] },

  // --- Services -------------------------------------------------------------
  notary_fee: { min: 1, max: 30, frequencies: PER_OCCURRENCE },
  // Rent is annual; lost-key and forced-entry drilling are per-occurrence.
  safe_deposit_box: { min: 1, max: 400 },
  garnishment_levy: { min: 10, max: 150, frequencies: PER_OCCURRENCE },
  legal_process: { min: 10, max: 200, frequencies: PER_OCCURRENCE },
  account_verification: { min: 1, max: 50, frequencies: PER_OCCURRENCE },
  balance_inquiry: { min: 0.25, max: 10, frequencies: PER_OCCURRENCE },
  night_deposit: { min: 1, max: 100 },
};

export type PlausibilityStatus = "ok" | "review";

export interface PlausibilityVerdict {
  status: PlausibilityStatus;
  /** Machine-readable flag suitable for `outlier_flags`. */
  flag?: string;
  /** Human-readable reason suitable for a review queue. */
  reason?: string;
}

const OK: PlausibilityVerdict = { status: "ok" };

function normalizeFrequency(value: string | null | undefined): FeeFrequency | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  switch (normalized) {
    case "monthly":
    case "annual":
    case "per_item":
    case "per_transaction":
    case "one_time":
    case "daily":
      return normalized;
    // The live catalog's dominant vocabulary. `per_occurrence` alone is 76% of
    // rows; before this mapped, the frequency arm was silently inert on three
    // quarters of the corpus.
    case "per_occurrence":
    case "per occurrence":
    case "per-occurrence":
    case "per item":
    case "per-item":
    case "peritem":
      return "per_item";
    case "onetime":
    case "one time":
    case "one-time":
      return "one_time";
    case "per transaction":
    case "per-transaction":
      return "per_transaction";
    case "annually":
    case "yearly":
      return "annual";
    // `other`, `unknown` and anything unrecognised are treated as undetected,
    // which is neutral — never as evidence of a problem.
    default:
      return null;
  }
}

/**
 * Amount plausibility for one canonical key.
 *
 * A key with no envelope falls back to the previous global ceiling, so this can
 * only ever be at least as permissive as the behaviour it replaces on unlisted
 * keys.
 */
export function amountVerdict(canonicalFeeKey: string, amount: number): PlausibilityVerdict {
  const envelope = FEE_ENVELOPES[canonicalFeeKey];
  if (!envelope) {
    if (amount > DEFAULT_MAX_AMOUNT) {
      return {
        status: "review",
        flag: "plausibility:above_default_ceiling",
        reason: `Amount $${amount} exceeds the $${DEFAULT_MAX_AMOUNT} default ceiling and ${canonicalFeeKey} has no envelope`,
      };
    }
    return OK;
  }
  if (amount < envelope.min) {
    return {
      status: "review",
      flag: "plausibility:below_envelope",
      reason: `Amount $${amount} is below the $${envelope.min}–$${envelope.max} band for ${canonicalFeeKey}${envelope.note ? ` (${envelope.note})` : ""}`,
    };
  }
  if (amount > envelope.max) {
    return {
      status: "review",
      flag: "plausibility:above_envelope",
      reason: `Amount $${amount} is above the $${envelope.min}–$${envelope.max} band for ${canonicalFeeKey}${envelope.note ? ` (${envelope.note})` : ""}`,
    };
  }
  return OK;
}

/**
 * Unit compatibility. The signal is already computed by Knox's
 * `detectFrequency` on every row and was previously ignored by both Darwin and
 * Hamilton — a daily `overdraft` is the exact fingerprint of a cap filed on the
 * fee key.
 */
export function frequencyVerdict(
  canonicalFeeKey: string,
  frequency: string | null | undefined,
): PlausibilityVerdict {
  const envelope = FEE_ENVELOPES[canonicalFeeKey];
  if (!envelope?.frequencies?.length) return OK;
  const normalized = normalizeFrequency(frequency);
  // An undetected frequency is not evidence of a problem.
  if (!normalized) return OK;
  if (envelope.frequencies.includes(normalized)) return OK;
  return {
    status: "review",
    flag: "plausibility:frequency_mismatch",
    reason: `Frequency "${normalized}" is not valid for ${canonicalFeeKey} (expected ${envelope.frequencies.join(" or ")}) — likely a cap or a mis-keyed line`,
  };
}

/** Combined verdict. Amount is checked first because it is the louder signal. */
export function plausibilityVerdict(
  canonicalFeeKey: string,
  amount: number,
  frequency: string | null | undefined,
): PlausibilityVerdict {
  const amountResult = amountVerdict(canonicalFeeKey, amount);
  if (amountResult.status === "review") return amountResult;
  return frequencyVerdict(canonicalFeeKey, frequency);
}

/** Keys with an explicit envelope — useful for coverage reporting. */
export const ENVELOPE_KEYS = Object.keys(FEE_ENVELOPES);
