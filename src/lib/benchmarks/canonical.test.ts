import { describe, expect, it } from "vitest";
import { computeBenchmark } from "./canonical";

describe("computeBenchmark", () => {
  it("should_use_one_amount_per_institution_and_count_distinct_institutions", () => {
    const b = computeBenchmark([
      { institution_id: 1, amount: 30 }, { institution_id: 1, amount: 35 },   // tiered: min 30
      { institution_id: 2, amount: 20 }, { institution_id: 3, amount: 0 }, { institution_id: 4, amount: null },
    ]);
    expect(b.institution_count).toBe(2);
    expect(b.observation_count).toBe(3);
    expect(b.median).toBe(25);
    expect(b.min).toBe(20); expect(b.max).toBe(30);
  });

  it("should_return_nulls_when_no_priced_rows", () => {
    expect(computeBenchmark([{ institution_id: 1, amount: 0 }]).median).toBeNull();
  });

  it("should_return_zero_counts_when_no_priced_rows", () => {
    const b = computeBenchmark([{ institution_id: 1, amount: 0 }, { institution_id: 2, amount: null }]);
    expect(b.institution_count).toBe(0);
    expect(b.observation_count).toBe(0);
    expect(b.p25).toBeNull();
    expect(b.p75).toBeNull();
  });

  it("should_return_percentiles_for_a_larger_priced_set", () => {
    const b = computeBenchmark([
      { institution_id: 1, amount: 10 },
      { institution_id: 2, amount: 20 },
      { institution_id: 3, amount: 30 },
      { institution_id: 4, amount: 40 },
      { institution_id: 5, amount: 50 },
    ]);
    expect(b.institution_count).toBe(5);
    expect(b.observation_count).toBe(5);
    expect(b.median).toBe(30);
    expect(b.p25).toBeCloseTo(20, 2);
    expect(b.p75).toBeCloseTo(40, 2);
    expect(b.min).toBe(10);
    expect(b.max).toBe(50);
    expect(b.outlier_flagged).toBe(0);
    expect(b.sample).toBe("early");
  });

  it("should_exclude_a_5000_dollar_outlier_from_percentiles_but_still_count_it", () => {
    const b = computeBenchmark([
      { institution_id: 1, amount: 5 },
      { institution_id: 2, amount: 6 },
      { institution_id: 3, amount: 6 },
      { institution_id: 4, amount: 8 },
      { institution_id: 5, amount: 10 },
      { institution_id: 6, amount: 12 },
      { institution_id: 7, amount: 15 },
      { institution_id: 8, amount: 5000 },
    ]);
    expect(b.institution_count).toBe(8);
    expect(b.outlier_flagged).toBe(1);
    expect(b.min).toBe(5);
    expect(b.max).toBe(15);
    expect(b.median).toBe(8);
    expect(b.sample).toBe("early");
  });

  it("should_classify_insufficient_and_established_samples", () => {
    const thin = computeBenchmark([
      { institution_id: 1, amount: 10 },
      { institution_id: 2, amount: 20 },
    ]);
    expect(thin.sample).toBe("insufficient");

    const rich = computeBenchmark(
      Array.from({ length: 12 }, (_, i) => ({ institution_id: i + 1, amount: 10 + i }))
    );
    expect(rich.sample).toBe("established");
  });
});
