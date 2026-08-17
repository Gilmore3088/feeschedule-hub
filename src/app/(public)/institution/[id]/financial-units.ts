import type { InstitutionFinancial } from "@/lib/data-store/financial";

/**
 * Unit normalization for the public profile.
 *
 * institution_sources.asset_size is stored in thousands of dollars for every
 * charter (FDIC/NCUA filing convention; e.g. 158,694 = $158.7M).
 * institution_financial_records dollar columns are stored in thousands for
 * source = fdic / ncua and in whole dollars for source = ffiec. Everything
 * here is converted to whole dollars so one formatter can render all of it.
 */
const THOUSANDS = 1_000;
const PERCENT = 100;
const WHOLE_DOLLAR_SOURCES = new Set(["ffiec"]);
const PERCENT_STORED_SOURCES = new Set(["ffiec"]);

function scaleDollars(value: number | null, source: string): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  return WHOLE_DOLLAR_SOURCES.has(source) ? value : value * THOUSANDS;
}

function scaleRatio(value: number | null, source: string): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  return PERCENT_STORED_SOURCES.has(source) ? value : value * PERCENT;
}

export function assetSizeToDollars(assetSize: number | null | undefined): number | null {
  if (assetSize === null || assetSize === undefined || !Number.isFinite(assetSize)) return null;
  return assetSize > 0 ? assetSize * THOUSANDS : null;
}

export interface NormalizedFinancial {
  reportDate: string;
  source: string;
  totalAssets: number | null;
  totalDeposits: number | null;
  serviceChargeIncome: number | null;
  /** Percent value (8.2 means 8.2%). */
  feeIncomeRatioPct: number | null;
  /** Percent value; null when missing or zero (zero is a placeholder in NCUA rows). */
  roaPct: number | null;
  branchCount: number | null;
}

export function normalizeFinancial(record: InstitutionFinancial): NormalizedFinancial {
  const source = record.source.toLowerCase();
  const roa = record.roa !== null && Number.isFinite(record.roa) && record.roa !== 0 ? record.roa : null;
  return {
    reportDate: record.report_date,
    source,
    totalAssets: scaleDollars(record.total_assets, source),
    totalDeposits: scaleDollars(record.total_deposits, source),
    serviceChargeIncome: scaleDollars(record.service_charge_income, source),
    feeIncomeRatioPct: scaleRatio(record.fee_income_ratio, source),
    roaPct: roa,
    branchCount: record.branch_count,
  };
}

/** "Q1 2026" for a report date, or the raw string when it cannot be parsed. */
export function formatReportQuarter(reportDate: string | null | undefined): string | null {
  if (!reportDate) return null;
  const date = new Date(reportDate);
  if (Number.isNaN(date.getTime())) return reportDate;
  return `Q${Math.floor(date.getUTCMonth() / 3) + 1} ${date.getUTCFullYear()}`;
}
