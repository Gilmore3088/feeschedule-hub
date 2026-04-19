import { describe, test, expect } from "vitest";
import {
  FEE_FAMILIES,
  CANONICAL_KEY_MAP,
  CANONICAL_KEY_COUNT,
  TAXONOMY_COUNT,
} from "./fee-taxonomy";

// Tripwire for Python↔TS drift. If you change these numbers, update the
// matching assertion in fee_crawler/tests/test_backfill_canonical.py.
const EXPECTED_TAXONOMY_COUNT = 65;
const EXPECTED_CANONICAL_KEY_COUNT = 197;

describe("fee-taxonomy sync", () => {
  test("every FEE_FAMILIES category is in CANONICAL_KEY_MAP", () => {
    const allCategories = Object.values(FEE_FAMILIES).flat();
    const missing: string[] = [];
    for (const cat of allCategories) {
      if (!(cat in CANONICAL_KEY_MAP)) {
        missing.push(cat);
      }
    }
    expect(missing).toEqual([]);
  });

  test("TAXONOMY_COUNT matches the expected base-category count (Python↔TS parity)", () => {
    expect(TAXONOMY_COUNT).toBe(EXPECTED_TAXONOMY_COUNT);
  });

  test("CANONICAL_KEY_COUNT matches the Python CANONICAL_KEY_MAP count (Python↔TS parity)", () => {
    expect(CANONICAL_KEY_COUNT).toBe(EXPECTED_CANONICAL_KEY_COUNT);
  });

  test("CANONICAL_KEY_MAP has at least 49 entries (base categories)", () => {
    expect(Object.keys(CANONICAL_KEY_MAP).length).toBeGreaterThanOrEqual(49);
  });

  test("base fee categories map to themselves (identity mapping)", () => {
    const allCategories = Object.values(FEE_FAMILIES).flat();
    const nonIdentity: string[] = [];
    for (const cat of allCategories) {
      if (CANONICAL_KEY_MAP[cat] !== cat) {
        nonIdentity.push(cat);
      }
    }
    expect(nonIdentity).toEqual([]);
  });

  test("CANONICAL_KEY_MAP values are non-empty strings", () => {
    for (const [key, value] of Object.entries(CANONICAL_KEY_MAP)) {
      expect(typeof value).toBe("string");
      expect(value.length).toBeGreaterThan(0);
    }
  });
});
