import { describe, expect, it } from "vitest";

import {
  DEFAULT_MAX_AMOUNT,
  ENVELOPE_KEYS,
  FEE_ENVELOPES,
  amountVerdict,
  frequencyVerdict,
  plausibilityVerdict,
} from "./fee-plausibility";
import { CANONICAL_KEY_MAP } from "./fee-taxonomy";

describe("envelope definitions", () => {
  it("only references keys that exist in the canonical taxonomy", () => {
    const valid = new Set(Object.values(CANONICAL_KEY_MAP));
    const unknown = ENVELOPE_KEYS.filter((key) => !valid.has(key));
    expect(unknown, `envelopes defined for non-taxonomy keys: ${unknown.join(", ")}`).toEqual([]);
  });

  it("has a coherent band for every key", () => {
    for (const [key, envelope] of Object.entries(FEE_ENVELOPES)) {
      expect(envelope.min, `${key} min`).toBeLessThan(envelope.max);
      expect(envelope.min, `${key} min`).toBeGreaterThanOrEqual(0);
    }
  });

  it("covers every spotlight category", () => {
    const spotlight = [
      "monthly_maintenance",
      "overdraft",
      "nsf",
      "atm_non_network",
      "card_foreign_txn",
      "wire_domestic_outgoing",
    ];
    for (const key of spotlight) {
      expect(FEE_ENVELOPES[key], `missing envelope for spotlight key ${key}`).toBeDefined();
    }
  });
});

describe("amountVerdict", () => {
  it("passes ordinary values", () => {
    expect(amountVerdict("overdraft", 32).status).toBe("ok");
    expect(amountVerdict("nsf", 25).status).toBe("ok");
    expect(amountVerdict("monthly_maintenance", 12).status).toBe("ok");
    expect(amountVerdict("atm_non_network", 2.5).status).toBe("ok");
  });

  it("holds the values the old global ceiling let through", () => {
    // Both of these verified cleanly under `amount > 2_500`.
    const cap = amountVerdict("overdraft", 250);
    expect(cap.status).toBe("review");
    expect(cap.flag).toBe("plausibility:above_envelope");

    const maintenance = amountVerdict("monthly_maintenance", 5_000);
    expect(maintenance.status).toBe("review");
  });

  it("holds implausibly low values too", () => {
    // The live set carries NSF/OD rows down to $1.
    expect(amountVerdict("nsf", 0.5).status).toBe("review");
  });

  it("accepts a genuine cap on the cap key", () => {
    expect(amountVerdict("od_daily_cap", 250).status).toBe("ok");
    expect(amountVerdict("od_daily_cap", 384).status).toBe("ok");
  });

  it("falls back to the old ceiling for keys with no envelope", () => {
    expect(amountVerdict("zelle_fee", 100).status).toBe("ok");
    expect(amountVerdict("zelle_fee", DEFAULT_MAX_AMOUNT + 1).status).toBe("review");
  });
});

describe("frequencyVerdict", () => {
  it("flags a daily overdraft as a mis-keyed cap", () => {
    const verdict = frequencyVerdict("overdraft", "daily");
    expect(verdict.status).toBe("review");
    expect(verdict.flag).toBe("plausibility:frequency_mismatch");
  });

  it("accepts daily on the cap keys", () => {
    expect(frequencyVerdict("od_daily_cap", "daily").status).toBe("ok");
    expect(frequencyVerdict("nsf_daily_cap", "daily").status).toBe("ok");
  });

  it("accepts per-item on a per-occurrence fee", () => {
    expect(frequencyVerdict("overdraft", "per_item").status).toBe("ok");
    expect(frequencyVerdict("nsf", "per_transaction").status).toBe("ok");
  });

  it("flags per-item monthly maintenance", () => {
    expect(frequencyVerdict("monthly_maintenance", "per_item").status).toBe("review");
  });

  it("treats an undetected frequency as neutral", () => {
    expect(frequencyVerdict("overdraft", null).status).toBe("ok");
    expect(frequencyVerdict("overdraft", "").status).toBe("ok");
  });

  it("tolerates legacy archive spellings", () => {
    expect(frequencyVerdict("overdraft", "per item").status).toBe("ok");
    expect(frequencyVerdict("safe_deposit_box", "annually").status).toBe("ok");
  });
});

describe("plausibilityVerdict", () => {
  it("reports the amount problem first when both arms fail", () => {
    const verdict = plausibilityVerdict("overdraft", 250, "daily");
    expect(verdict.status).toBe("review");
    expect(verdict.flag).toBe("plausibility:above_envelope");
  });

  it("passes a well-formed row", () => {
    expect(plausibilityVerdict("overdraft", 32, "per_item").status).toBe("ok");
  });

  it("catches the cap-as-fee case on frequency alone when the amount is in band", () => {
    // A $40 "daily overdraft maximum" sits inside the overdraft amount band, so
    // frequency is the only thing that separates it from a real fee.
    const verdict = plausibilityVerdict("overdraft", 40, "daily");
    expect(verdict.status).toBe("review");
    expect(verdict.flag).toBe("plausibility:frequency_mismatch");
  });
});
