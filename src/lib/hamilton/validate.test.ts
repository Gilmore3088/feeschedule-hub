import { describe, it, expect } from "vitest";
import { extractNumericTokens, flattenSourceValues, validateNumerics } from "./validate";

describe("extractNumericTokens", () => {
  it("extracts a simple integer", () => {
    const tokens = extractNumericTokens("There are 42 institutions.");
    const values = tokens.map((t) => t.value);
    expect(values).toContain(42);
  });

  it("extracts a currency value", () => {
    const tokens = extractNumericTokens("The median fee is $12.50 per month.");
    const values = tokens.map((t) => t.value);
    expect(values).toContain(12.5);
  });

  it("extracts a percentage value", () => {
    const tokens = extractNumericTokens("Fees are 23.4% above the national median.");
    const values = tokens.map((t) => t.value);
    expect(values).toContain(23.4);
  });

  it("extracts comma-formatted integers", () => {
    const tokens = extractNumericTokens("The index covers 4,200 institutions.");
    const values = tokens.map((t) => t.value);
    expect(values).toContain(4200);
  });

  it("extracts multiple numeric tokens from one sentence", () => {
    const tokens = extractNumericTokens("The median is $35.00, the P75 is $50.00, and the rate is 18.2%.");
    const values = tokens.map((t) => t.value);
    expect(values).toContain(35);
    expect(values).toContain(50);
    expect(values).toContain(18.2);
  });

  it("returns empty array for text with no numbers", () => {
    const tokens = extractNumericTokens("No figures appear in this sentence.");
    expect(tokens).toHaveLength(0);
  });
});

describe("flattenSourceValues", () => {
  it("extracts numeric leaf values from a flat object", () => {
    const data = { median: 12.5, count: 100 };
    const values = flattenSourceValues(data);
    expect(values).toContain(12.5);
    expect(values).toContain(100);
  });

  it("extracts values from a nested object", () => {
    const data = {
      fees: {
        overdraft: { median: 35, p75: 50 },
        nsf: { median: 30 },
      },
      institution_count: 412,
    };
    const values = flattenSourceValues(data);
    expect(values).toContain(35);
    expect(values).toContain(50);
    expect(values).toContain(30);
    expect(values).toContain(412);
  });

  it("extracts values from arrays", () => {
    const data = { percentiles: [10, 25, 50, 75, 90] };
    const values = flattenSourceValues(data);
    expect(values).toContain(10);
    expect(values).toContain(75);
    expect(values).toContain(90);
  });

  it("returns empty array for empty data", () => {
    const values = flattenSourceValues({});
    expect(values).toHaveLength(0);
  });
});

describe("validateNumerics", () => {
  it("passes when all numbers are present in source data", () => {
    const result = validateNumerics(
      "The median fee is $12.50 and the rate is 23.4%.",
      { median: 12.5, rate: 23.4 }
    );
    expect(result.passed).toBe(true);
    expect(result.inventedNumbers).toHaveLength(0);
  });

  it("fails when a number is invented (not in source data)", () => {
    const result = validateNumerics(
      "The fee is $99.00 per month.",
      { median: 12.5 }
    );
    expect(result.passed).toBe(false);
    expect(result.inventedNumbers.length).toBeGreaterThan(0);
  });

  it("passes with rounding tolerance: 23.4% matches 23.43 in source", () => {
    const result = validateNumerics(
      "Fees are 23.4% above the national median.",
      { delta_pct: 23.43 }
    );
    expect(result.passed).toBe(true);
  });

  it("passes with currency rounding: $12.50 matches 12.499 in source", () => {
    const result = validateNumerics(
      "The median fee is $12.50.",
      { median: 12.499 }
    );
    expect(result.passed).toBe(true);
  });

  it("passes with integer rounding tolerance: 35 matches 35.4 in source", () => {
    const result = validateNumerics(
      "Approximately 35 institutions reported this fee.",
      { institution_count: 35.4 }
    );
    expect(result.passed).toBe(true);
  });

  it("returns empty narrative as passed with zero checked", () => {
    const result = validateNumerics("", {});
    expect(result.passed).toBe(true);
    expect(result.checkedCount).toBe(0);
    expect(result.inventedNumbers).toHaveLength(0);
  });

  it("returns narrative with no numbers as passed", () => {
    const result = validateNumerics(
      "This section contains no numeric references.",
      { median: 12.5 }
    );
    expect(result.passed).toBe(true);
    expect(result.checkedCount).toBe(0);
  });

  it("reports all invented numbers in inventedNumbers array", () => {
    const result = validateNumerics(
      "The fee is $99.00 and the rate is 55.5%.",
      { median: 12.5 }
    );
    expect(result.passed).toBe(false);
    expect(result.inventedNumbers.length).toBeGreaterThanOrEqual(2);
  });

  it("exposes sourceValues in result for debugging", () => {
    const data = { median: 12.5, count: 100 };
    const result = validateNumerics("The median is $12.50.", data);
    expect(result.sourceValues).toContain(12.5);
    expect(result.sourceValues).toContain(100);
  });

  it("works with nested source data", () => {
    const result = validateNumerics(
      "The overdraft median is $35.00 across 412 institutions.",
      { fees: { overdraft: { median: 35 } }, institution_count: 412 }
    );
    expect(result.passed).toBe(true);
  });
});
