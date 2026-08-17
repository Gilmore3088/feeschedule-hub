export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://feeinsight.com";

// Brand contract: Fee Insight is the company/site; Bank Fee Index is its product.
export const SITE_NAME = "Fee Insight";
export const PRODUCT_NAME = "Bank Fee Index";
export const SITE_DOMAIN = "feeinsight.com";
export const CONTACT_EMAIL = "hello@bankfeeindex.com";
export const RESEARCH_IMPRINT = "Fee Insight Research";
export const HAMILTON_ATTRIBUTION = "Hamilton — Fee Insight";
export const SITE_TITLE_TEMPLATE = `%s | ${SITE_NAME}`;

/** Full document title for pages that must set one outside the root title template. */
export function pageTitle(section: string): string {
  return `${section} | ${SITE_NAME}`;
}

// The one commissioned product: one name, one price, one turnaround, everywhere.
export const REPORT_OFFER = {
  name: "Competitive Fee Position Report",
  priceUsd: 300,
  priceLabel: "$300",
  turnaround: "delivered in 48 hours",
  refreshLabel: "Refresh the same report any quarter for $300",
} as const;
export const REPORT_OFFER_LINE = `${REPORT_OFFER.name} — ${REPORT_OFFER.priceLabel}, ${REPORT_OFFER.turnaround}`;

// Hamilton, described the same way everywhere. Never "our AI analyst".
export const HAMILTON_CANONICAL =
  `Hamilton is the ${SITE_NAME} Pro workspace: benchmark, scenario, report and monitor ` +
  "your fee position against a verified peer set.";
export const HAMILTON_MODES = ["Analyze", "Benchmark", "Scenario", "Report", "Monitor"] as const;
export type HamiltonMode = (typeof HAMILTON_MODES)[number];
