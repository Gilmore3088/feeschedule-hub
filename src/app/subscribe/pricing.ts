import { REPORT_OFFER } from "@/lib/constants";
import type { PublicStatsSummary } from "@/lib/public-stats";

export type ProPlan = "monthly" | "annual";

/** Billed prices in USD. Display strings are derived, never hand-typed. */
export const MONTHLY_PRICE_USD = 499.99;
export const ANNUAL_PRICE_USD = 5000;
export const REPORT_PRICE_USD = REPORT_OFFER.priceUsd;
const MONTHS_PER_YEAR = 12;

const WHOLE_DOLLARS = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

/** "$499" — monthly seat price shown without cents. */
export const MONTHLY_PRICE_LABEL = WHOLE_DOLLARS.format(Math.floor(MONTHLY_PRICE_USD));
/** "$5,000" */
export const ANNUAL_PRICE_LABEL = WHOLE_DOLLARS.format(ANNUAL_PRICE_USD);
/** "$300" */
export const REPORT_PRICE_LABEL = WHOLE_DOLLARS.format(REPORT_PRICE_USD);
/** Computed from the two billed prices; e.g. "$1,000". */
export const ANNUAL_SAVINGS_LABEL = WHOLE_DOLLARS.format(
  Math.round(MONTHLY_PRICE_USD * MONTHS_PER_YEAR - ANNUAL_PRICE_USD),
);

export function isProPlan(value: string | undefined): value is ProPlan {
  return value === "monthly" || value === "annual";
}

/** Feature list shared by both Pro cards — annual is a discount, not a tier. */
export function proFeatureList(summary: PublicStatsSummary): string[] {
  return [
    `Full dataset: ${summary.categoriesLabel} fee categories, ${summary.institutionsLabel} institutions with verified fees`,
    "Peer comparison by charter type, asset tier, Fed district",
    "National and regional fee index with percentiles",
    "CSV and bulk data exports",
    "Hamilton workspace: benchmark, scenario, report, monitor",
    "Board-ready reports from Hamilton",
    "Fed district economic context and Beige Book summaries",
    "CFPB complaint correlation data",
    "Daily-updated economic indicators (FRED, BLS, NY Fed)",
  ];
}

export const REPORT_BULLETS = [
  "15 headline fees vs your true peer cohort",
  "Named competitors on the same lines",
  "Outlier flags and a source citation for every figure",
  "PDF, delivered in 48 hours",
];
