import { describe, expect, it } from "vitest";
import { formatCompactDollars } from "@/lib/format";
import { getFrequencyLabel, getPublicStatusLabel, getSegmentLabel, toTitleCase } from "./enum-labels";
import { groupFeesByFamily, type DisplayFee } from "./fee-schedule-table";
import { assetSizeToDollars, formatReportQuarter, normalizeFinancial } from "./financial-units";
import { buildProfileTitle } from "./profile-data";

const ncuaRecord = {
  institution_id: 4802,
  report_date: "2026-03-31",
  source: "ncua",
  total_assets: 158_694,
  total_deposits: 139_711,
  total_loans: null,
  service_charge_income: 206,
  other_noninterest_income: null,
  net_interest_margin: null,
  efficiency_ratio: null,
  roa: 0,
  roe: null,
  tier1_capital_ratio: null,
  branch_count: null,
  employee_count: null,
  member_count: null,
  total_revenue: null,
  fee_income_ratio: 0.0823,
  overdraft_revenue: null,
};

describe("financial units", () => {
  it("renders registry assets and NCUA call-report assets with the same magnitude", () => {
    const registry = formatCompactDollars(assetSizeToDollars(158_694));
    const financial = formatCompactDollars(normalizeFinancial(ncuaRecord).totalAssets);
    expect(registry).toBe("$158.7M");
    expect(financial).toBe("$158.7M");
  });

  it("keeps FFIEC whole-dollar rows unscaled and hides zero ROA", () => {
    const ffiec = normalizeFinancial({ ...ncuaRecord, source: "ffiec", total_assets: 158_694_000, roa: 0.9 });
    expect(ffiec.totalAssets).toBe(158_694_000);
    expect(ffiec.roaPct).toBe(0.9);
    expect(normalizeFinancial(ncuaRecord).roaPct).toBeNull();
    expect(normalizeFinancial(ncuaRecord).feeIncomeRatioPct).toBeCloseTo(8.23);
  });

  it("formats report quarters", () => {
    expect(formatReportQuarter("2026-03-31")).toBe("Q1 2026");
    expect(formatReportQuarter("2025-12-31")).toBe("Q4 2025");
  });
});

describe("enum labels", () => {
  it("maps internal enums to public vocabulary", () => {
    expect(getPublicStatusLabel("provisional")).toBe("Under review");
    expect(getPublicStatusLabel("unavailable")).toBe("No published schedule found");
    expect(getSegmentLabel("community_small", "credit_union")).toBe("Community credit union, under $300M");
    expect(getSegmentLabel("super_regional", "bank")).toBe("National bank, over $250B");
    expect(getFrequencyLabel("per_occurrence")).toBe("per item");
    expect(getFrequencyLabel("monthly")).toBe("per month");
    expect(getFrequencyLabel("annual")).toBe("per year");
  });

  it("title-cases only ALL-CAPS strings", () => {
    expect(toTitleCase("SAVANNAH")).toBe("Savannah");
    expect(toTitleCase("WINSTON-SALEM")).toBe("Winston-Salem");
    expect(toTitleCase("Fort Worth")).toBe("Fort Worth");
    expect(toTitleCase(null)).toBeNull();
  });
});

describe("profile title", () => {
  it("uses the top verified amounts when present", () => {
    const year = new Date().getFullYear();
    expect(buildProfileTitle("Georgia Heritage FCU", { overdraft: 30, nsf: 33, monthly: 4.95 })).toBe(
      `Georgia Heritage FCU Fees: Overdraft $30, NSF $33, Monthly $4.95 (${year})`,
    );
    expect(buildProfileTitle("Test Bank", { overdraft: null, nsf: null, monthly: null })).toBe(
      "Test Bank Fees and Fee Schedule",
    );
  });
});

describe("fee schedule grouping", () => {
  const fee = (overrides: Partial<DisplayFee>): DisplayFee => ({
    id: Math.random().toString(36).slice(2),
    feeName: "Overdraft Fee",
    feeCategory: "overdraft",
    amount: 30,
    frequency: "per_occurrence",
    conditions: null,
    status: "verified",
    sourceUrl: null,
    ...overrides,
  });

  it("groups by family, collapses duplicate name and amount, and orders taxonomy first", () => {
    const groups = groupFeesByFamily([
      fee({ feeName: "Stop Payment", feeCategory: "stop_payment", amount: 33 }),
      fee({}),
      fee({}),
      fee({ feeName: "Overdraft Fee", amount: 35 }),
      fee({ feeName: "Mystery", feeCategory: null, status: "provisional" }),
    ]);
    const families = groups.map((group) => group.family);
    expect(families[0]).toBe("Overdraft & NSF");
    expect(families[families.length - 1]).toBe("Other fees");
    const overdraft = groups.find((group) => group.family === "Overdraft & NSF");
    expect(overdraft?.rows).toHaveLength(2);
    expect(groups.find((group) => group.family === "Other fees")?.provisionalCount).toBe(1);
  });
});
