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
