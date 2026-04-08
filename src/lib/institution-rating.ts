/**
 * Institution rating engine for consumer decision pages.
 *
 * Locked thresholds (D-01, never change without explicit decision):
 *   overdraft ≤ $20   → green  "Consumer-Friendly"
 *   overdraft $20.01-$36 → yellow "Average Fee Structure"
 *   overdraft > $36   → red   "Above-Average Fees"
 *
 * Security (T-30.1-01): fee amounts are validated as finite, non-negative
 * before any comparison.
 */

import type { IndexEntry } from "./crawler-db/fee-index";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OVERDRAFT_GREEN_MAX = 20;    // ≤ $20 → green
const OVERDRAFT_YELLOW_MAX = 36;   // $20.01–$36 → yellow; > $36 → red

const BONUS_SIGNALS = ["cap", "de minimis", "balance threshold", "maximum", "limit"];

// Typical fee count ranges for context copy (hardcoded per spec §4)
const TYPICAL_BANK_MIN = 30;
const TYPICAL_BANK_MAX = 50;
const TYPICAL_CU_MIN = 25;
const TYPICAL_CU_MAX = 35;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RatingInput {
  id: number;
  fee_name: string;
  amount: number | null;
  fee_category?: string | null;
  conditions?: string | null;
}

export interface RatingResult {
  label: string;
  color: "green" | "yellow" | "red";
  bullets: string[];
}

export interface StrengthsWatch {
  strengths: string[];
  watch: string[];
}

export interface InterpretationParams {
  rating: RatingResult;
  feeCount: number;
  overdraftAmount: number | null;
  charterType: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Clamp a number to a safe, finite value >= 0 (T-30.1-01). */
function safeAmount(amount: number | null | undefined): number | null {
  if (amount === null || amount === undefined) return null;
  if (!isFinite(amount) || isNaN(amount)) return null;
  return Math.max(0, amount);
}

function hasBonusSignal(conditions: string | null | undefined): boolean {
  if (!conditions) return false;
  const lower = conditions.toLowerCase();
  return BONUS_SIGNALS.some((s) => lower.includes(s));
}

function buildIndexMap(nationalIndex: IndexEntry[]): Map<string, IndexEntry> {
  return new Map(nationalIndex.map((e) => [e.fee_category, e]));
}

/**
 * Detect overdraft fee by scanning fee_name for "overdraft" substring.
 * Per D-05: detection is by name, not by category field.
 */
function detectOverdraftFee(
  fees: RatingInput[]
): { amount: number; conditions: string | null } | null {
  for (const fee of fees) {
    if (fee.fee_name.toLowerCase().includes("overdraft")) {
      const safe = safeAmount(fee.amount);
      if (safe !== null) {
        return { amount: safe, conditions: fee.conditions ?? null };
      }
    }
  }
  return null;
}

function overdraftColor(amount: number): "green" | "yellow" | "red" {
  if (amount <= OVERDRAFT_GREEN_MAX) return "green";
  if (amount <= OVERDRAFT_YELLOW_MAX) return "yellow";
  return "red";
}

/** Format a dollar amount for display in bullets. */
function fmt(amount: number): string {
  return `$${amount % 1 === 0 ? amount.toFixed(0) : amount.toFixed(2)}`;
}

// ---------------------------------------------------------------------------
// computeInstitutionRating
// ---------------------------------------------------------------------------

/**
 * Compute an institution's fee rating.
 *
 * Strategy (per D-01 through D-05):
 * 1. Find overdraft fee by fee_name substring "overdraft".
 * 2. Apply locked thresholds.
 * 3. Apply bonus signals that can improve yellow-border cases.
 * 4. Fall back to composite median comparison when no overdraft is detected.
 *
 * Early return for empty array (T-30.1-03 DoS mitigation).
 */
export function computeInstitutionRating(
  fees: RatingInput[],
  nationalIndex: IndexEntry[]
): RatingResult {
  const bullets: string[] = [];

  // --- Empty fees fast-path (T-30.1-03) ---
  if (fees.length === 0) {
    return {
      label: "Average Fee Structure",
      color: "yellow",
      bullets: ["Limited data — fee schedule not yet fully extracted"],
    };
  }

  const indexMap = buildIndexMap(nationalIndex);
  const feeCount = fees.length;

  // --- Overdraft-based rating ---
  const overdraft = detectOverdraftFee(fees);

  if (overdraft !== null) {
    const base = overdraftColor(overdraft.amount);
    const hasBonus = hasBonusSignal(overdraft.conditions);

    // Bullet: overdraft amount
    bullets.push(`Overdraft fee: ${fmt(overdraft.amount)}`);

    // Bonus signals: provide a positive bullet regardless of tier upgrade
    if (hasBonus) {
      bullets.push("Overdraft fee cap or limit policy detected — fewer surprise charges");
    }

    // Derive final color (D-02: can upgrade yellow→green in 20-25 range with cap)
    let color: "green" | "yellow" | "red" = base;
    if (base === "yellow" && hasBonus && overdraft.amount <= 25) {
      color = "green";
    }

    // Bullet: fee count context
    const nmeOverdraft = nationalIndex.find((e) => e.fee_category === "overdraft");
    if (nmeOverdraft?.median_amount) {
      const delta = overdraft.amount - nmeOverdraft.median_amount;
      const pct = Math.round((delta / nmeOverdraft.median_amount) * 100);
      if (Math.abs(pct) >= 5) {
        bullets.push(
          pct < 0
            ? `${Math.abs(pct)}% below the national median overdraft fee`
            : `${Math.abs(pct)}% above the national median overdraft fee`
        );
      } else {
        bullets.push("Overdraft fee is aligned with the national median");
      }
    }

    // Fee count bullet (use typical range)
    const typicalMin = TYPICAL_CU_MIN;
    const typicalMax = TYPICAL_BANK_MAX;
    if (feeCount < typicalMin) {
      bullets.push(`Total fees: ${feeCount} — leaner than most institutions`);
    } else if (feeCount <= typicalMax) {
      bullets.push(`Total fees: ${feeCount}`);
    } else {
      bullets.push(`Total fees: ${feeCount} — broader fee menu than most`);
    }

    const label =
      color === "green"
        ? "Consumer-Friendly"
        : color === "yellow"
          ? "Average Fee Structure"
          : "Above-Average Fees";

    return { label, color, bullets: bullets.slice(0, 3) };
  }

  // --- Composite fallback: no overdraft detected (D-04) ---
  const feesWithAmounts = fees.filter((f) => safeAmount(f.amount) !== null);
  let belowCount = 0;
  let aboveCount = 0;
  let matchCount = 0;

  for (const fee of feesWithAmounts) {
    const entry = indexMap.get(fee.fee_category ?? "");
    if (!entry || entry.median_amount === null) continue;
    const amt = safeAmount(fee.amount)!;
    matchCount++;
    if (amt < entry.median_amount) belowCount++;
    else if (amt > entry.median_amount) aboveCount++;
  }

  let color: "green" | "yellow" | "red" = "yellow";
  if (matchCount >= 3) {
    const belowRatio = belowCount / matchCount;
    if (belowRatio > 0.6) color = "green";
    else if (belowRatio < 0.4) color = "red";
  }

  const label =
    color === "green"
      ? "Consumer-Friendly"
      : color === "yellow"
        ? "Average Fee Structure"
        : "Above-Average Fees";

  if (feeCount < TYPICAL_CU_MIN) {
    bullets.push(`Only ${feeCount} fees — simpler fee structure than most`);
  } else if (feeCount > TYPICAL_BANK_MAX) {
    bullets.push(`${feeCount} fees on record — more fees than most institutions`);
  } else {
    bullets.push(`${feeCount} fees on record`);
  }

  if (matchCount > 0) {
    bullets.push(
      `${belowCount} of ${matchCount} matched fees fall below the national median`
    );
  }

  return { label, color, bullets: bullets.slice(0, 3) };
}

// ---------------------------------------------------------------------------
// deriveStrengthsAndWatch
// ---------------------------------------------------------------------------

/**
 * Derive up to 2 strengths and 2 watch items from fee data (D-09).
 *
 * Strengths: fees >10% below national median, low fee count.
 * Watch: fees >10% above national median, high fee count.
 */
export function deriveStrengthsAndWatch(
  fees: RatingInput[],
  nationalIndex: IndexEntry[]
): StrengthsWatch {
  if (fees.length === 0) return { strengths: [], watch: [] };

  const indexMap = buildIndexMap(nationalIndex);
  const strengths: string[] = [];
  const watch: string[] = [];

  for (const fee of fees) {
    if (strengths.length >= 2 && watch.length >= 2) break;

    const safe = safeAmount(fee.amount);
    if (safe === null) continue;

    const entry = indexMap.get(fee.fee_category ?? "");
    if (!entry || entry.median_amount === null || entry.median_amount === 0) continue;

    const delta = (safe - entry.median_amount) / entry.median_amount;

    const displayName = fee.fee_category
      ? toDisplayName(fee.fee_category)
      : fee.fee_name;

    if (delta < -0.1 && strengths.length < 2) {
      const pct = Math.round(Math.abs(delta) * 100);
      strengths.push(`${displayName}: ${fmt(safe)} — ${pct}% below the national median`);
    } else if (delta > 0.1 && watch.length < 2) {
      const pct = Math.round(delta * 100);
      watch.push(`${displayName}: ${fmt(safe)} — ${pct}% above the national median`);
    }
  }

  return { strengths, watch };
}

/** Simple display name fallback (avoids importing full taxonomy to keep this module lean). */
function toDisplayName(category: string): string {
  return category
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// ---------------------------------------------------------------------------
// generateInterpretation
// ---------------------------------------------------------------------------

/**
 * Generate 2-3 plain English sentences summarising the institution's fee profile.
 *
 * Per D-08: always renders even with null overdraftAmount.
 * No jargon, no hedging, no AI-sounding language (Phase 29 voice standards).
 */
export function generateInterpretation(params: InterpretationParams): string {
  const { rating, feeCount, overdraftAmount, charterType } = params;
  const sentences: string[] = [];

  const institutionType =
    charterType === "credit_union" ? "credit union" : charterType === "bank" ? "bank" : "institution";

  // Sentence 1: overall rating narrative
  if (rating.color === "green") {
    sentences.push(
      `This ${institutionType} charges lower-than-average fees for most customers.`
    );
  } else if (rating.color === "yellow") {
    sentences.push(
      `This ${institutionType} has a fairly typical fee structure — close to what you'd find at most peers.`
    );
  } else {
    sentences.push(
      `This ${institutionType} charges higher-than-average fees in one or more key areas.`
    );
  }

  // Sentence 2: overdraft specifics or fee count context
  if (overdraftAmount !== null) {
    const safe = safeAmount(overdraftAmount);
    if (safe !== null) {
      if (safe <= OVERDRAFT_GREEN_MAX) {
        sentences.push(
          `The overdraft fee of ${fmt(safe)} is well below the national average, which is a meaningful benefit for customers who occasionally overdraw.`
        );
      } else if (safe <= OVERDRAFT_YELLOW_MAX) {
        sentences.push(
          `The overdraft fee of ${fmt(safe)} is in the normal range — not a standout in either direction.`
        );
      } else {
        sentences.push(
          `The overdraft fee of ${fmt(safe)} is higher than what most banks and credit unions charge, so customers who overdraw frequently may want to take note.`
        );
      }
    }
  } else if (feeCount > 0) {
    const isLow = feeCount < TYPICAL_CU_MIN;
    const isHigh = feeCount > TYPICAL_BANK_MAX;
    if (isLow) {
      sentences.push(
        `With only ${feeCount} fees on record, it has a simpler fee structure than most institutions — which generally means fewer ways to be charged unexpectedly.`
      );
    } else if (isHigh) {
      sentences.push(
        `With ${feeCount} fees on file, it has more line items than most — worth reviewing the full schedule before opening an account.`
      );
    } else {
      sentences.push(
        `It has ${feeCount} fees on record, which is in line with the typical range for a ${institutionType}.`
      );
    }
  } else {
    sentences.push(
      "Complete fee data isn't available yet — check back as the schedule is updated."
    );
  }

  // Sentence 3: actionable close (only for red or data-rich cases)
  if (rating.color === "red" && overdraftAmount !== null) {
    sentences.push(
      "If you're choosing between this and another option, it's worth comparing the overdraft and maintenance fees directly."
    );
  } else if (rating.color === "green" && feeCount > 0) {
    sentences.push(
      "Overall, the fee structure here is one of the more consumer-friendly ones in the index."
    );
  }

  return sentences.join(" ");
}
