import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  classifySample,
  trimOutliers,
  histogramWindow,
  dedupePerInstitution,
  MIN_N_PUBLISH,
} from "./sample-policy";

describe("sample policy", () => {
  it("should_classify_by_thresholds", () => {
    expect(classifySample(4)).toBe("insufficient");
    expect(classifySample(MIN_N_PUBLISH)).toBe("early");
    expect(classifySample(10)).toBe("established");
  });

  it("should_flag_the_5000_dollar_monthly_fee", () => {
    const vals = [5, 6, 6, 8, 10, 12, 15, 5000];
    const { kept, flagged } = trimOutliers(vals);
    expect(flagged).toEqual([5000]);
    expect(kept).toHaveLength(7);
  });

  it("should_clamp_histogram_to_p5_p95", () => {
    const w = histogramWindow(Array.from({ length: 100 }, (_, i) => i + 1));
    expect(w.lo).toBeGreaterThanOrEqual(5);
    expect(w.hi).toBeLessThanOrEqual(96);
  });

  it("should_keep_one_row_per_institution", () => {
    expect(
      dedupePerInstitution([
        { institution_id: 1, amount: 30 },
        { institution_id: 1, amount: 35 },
        { institution_id: 2, amount: 20 },
      ])
    ).toHaveLength(2);
  });

  it("should_keep_the_minimum_amount_per_institution_by_default", () => {
    const rows = dedupePerInstitution([
      { institution_id: 1, amount: 30 },
      { institution_id: 1, amount: 5 },
      { institution_id: 2, amount: 20 },
    ]);
    const forInstitution1 = rows.find((r) => r.institution_id === 1);
    expect(forInstitution1?.amount).toBe(5);
  });

  it("should_keep_the_maximum_amount_per_institution_when_asked", () => {
    const rows = dedupePerInstitution(
      [
        { institution_id: 1, amount: 30 },
        { institution_id: 1, amount: 5 },
      ],
      "max"
    );
    expect(rows[0].amount).toBe(30);
  });

  it("should_not_flag_anything_when_no_value_exceeds_the_threshold", () => {
    const { kept, flagged } = trimOutliers([10, 20, 30, 40, 50]);
    expect(flagged).toHaveLength(0);
    expect(kept).toHaveLength(5);
  });

  it("should_handle_empty_input_without_throwing", () => {
    expect(trimOutliers([])).toEqual({ kept: [], flagged: [] });
    expect(histogramWindow([])).toEqual({ lo: 0, hi: 0 });
    expect(dedupePerInstitution([])).toEqual([]);
  });

  it("should_never_import_data_store_since_this_module_is_used_by_a_client_component", () => {
    // sample-policy.ts is imported by DistributionChart ("use client"). A
    // data-store import here (directly or via ./fees) pulls `postgres` and
    // Node built-ins into the browser bundle and breaks `npm run build`
    // ("Module not found: Can't resolve 'net'/'tls'/'fs'/'perf_hooks'").
    const source = readFileSync(join(__dirname, "sample-policy.ts"), "utf-8");
    expect(source).not.toMatch(/data-store/);
  });
});
