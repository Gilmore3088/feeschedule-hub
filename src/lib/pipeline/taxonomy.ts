/**
 * Canonical fee taxonomy + validation guards for the classify stage.
 *
 * Reuses the 49 base categories from src/lib/fee-taxonomy.ts (single source of
 * truth) rather than duplicating the list. Mirrors Darwin's validate_llm_result:
 * a classification is valid only if the key is canonical AND it does not cross a
 * never-merge regulatory boundary (e.g. NSF vs overdraft).
 */

import { FEE_FAMILIES } from "@/lib/fee-taxonomy";

export const CANONICAL_FEE_KEYS: string[] = Array.from(
  new Set(Object.values(FEE_FAMILIES).flat()),
).sort();

const CANONICAL_SET = new Set(CANONICAL_FEE_KEYS);

/**
 * Regulatory guards — distinct categories the model must never conflate.
 * Mirrors Darwin's NEVER_MERGE_PAIRS.
 */
export const NEVER_MERGE_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["nsf", "overdraft"],
  ["wire_domestic_outgoing", "wire_intl_outgoing"],
  ["wire_domestic_incoming", "wire_intl_incoming"],
  ["atm_non_network", "card_replacement"],
  ["od_protection_transfer", "overdraft"],
  ["od_daily_cap", "overdraft"],
  ["nsf_daily_cap", "nsf"],
];

export function normalizeFeeName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isCanonicalKey(key: string): boolean {
  return CANONICAL_SET.has(key);
}

/**
 * True if `key` is a safe classification for `normalizedName`. Rejects
 * hallucinated keys and never-merge cross-category suggestions.
 */
export function isValidClassification(normalizedName: string, key: string | null): boolean {
  if (!key || !CANONICAL_SET.has(key)) return false;
  for (const [a, b] of NEVER_MERGE_PAIRS) {
    const hasA = normalizedName.includes(a.replace(/_/g, " ")) || normalizedName.includes(a);
    const hasB = normalizedName.includes(b.replace(/_/g, " ")) || normalizedName.includes(b);
    if (hasA && key === b) return false;
    if (hasB && key === a) return false;
  }
  return true;
}
