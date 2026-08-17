import { describe, expect, it } from "vitest";
import { aggregateCityFeeAverages } from "./city-fee-aggregation";

describe("aggregateCityFeeAverages", () => {
  it("counts a single reporting institution instead of dropping the category", () => {
    // Savannah, GA: one listed institution with a $5 overdraft fee.
    const result = aggregateCityFeeAverages([
      { institution_id: 4802, fee_category: "overdraft", amount: "5.00" },
      { institution_id: 4802, fee_category: "nsf", amount: 33 },
    ]);
    expect(result).toEqual([
      { fee_category: "nsf", median: 33, institution_count: 1 },
      { fee_category: "overdraft", median: 5, institution_count: 1 },
    ]);
  });

  it("uses one value per institution (lowest published) before averaging", () => {
    const result = aggregateCityFeeAverages([
      { institution_id: 1, fee_category: "overdraft", amount: 35 },
      { institution_id: 1, fee_category: "overdraft", amount: 30 },
      { institution_id: 2, fee_category: "overdraft", amount: 10 },
    ]);
    expect(result).toEqual([{ fee_category: "overdraft", median: 20, institution_count: 2 }]);
  });

  it("keeps waived ($0) fees as reported values and ignores nulls and negatives", () => {
    const result = aggregateCityFeeAverages([
      { institution_id: 1, fee_category: "monthly_maintenance", amount: 0 },
      { institution_id: 2, fee_category: "monthly_maintenance", amount: 10 },
      { institution_id: 3, fee_category: "monthly_maintenance", amount: null },
      { institution_id: 4, fee_category: "monthly_maintenance", amount: -1 },
      { institution_id: 5, fee_category: "", amount: 4 },
    ]);
    expect(result).toEqual([{ fee_category: "monthly_maintenance", median: 5, institution_count: 2 }]);
  });

  it("orders categories by reporting count, then name", () => {
    const result = aggregateCityFeeAverages([
      { institution_id: 1, fee_category: "wire_domestic_outgoing", amount: 25 },
      { institution_id: 1, fee_category: "atm_non_network", amount: 2 },
      { institution_id: 2, fee_category: "atm_non_network", amount: 3 },
      { institution_id: 1, fee_category: "nsf", amount: 30 },
    ]);
    expect(result.map((r) => r.fee_category)).toEqual([
      "atm_non_network",
      "nsf",
      "wire_domestic_outgoing",
    ]);
    expect(result[0].median).toBe(2.5);
  });
});
