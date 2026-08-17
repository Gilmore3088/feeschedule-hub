import { PRODUCT_NAME, SITE_DOMAIN, SITE_NAME } from "@/lib/constants";

export interface BrandConfig {
  name: string;
  tagline: string;
  url: string;
  primaryColor: string;
  accentColor: string;
  logoSvg: string;
}

const FEE_INSIGHT_LOGO = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="28" height="28"><path d="M3 17l4-8 4 5 4-10 6 13"/></svg>`;

const DEFAULT_BRAND_ID = "fee-insight";

export const BRANDS: Record<string, BrandConfig> = {
  [DEFAULT_BRAND_ID]: {
    name: SITE_NAME,
    tagline: `Home of the ${PRODUCT_NAME}`,
    url: SITE_DOMAIN,
    primaryColor: "#0f172a",
    accentColor: "#f59e0b",
    logoSvg: FEE_INSIGHT_LOGO,
  },
};

export type BrandId = keyof typeof BRANDS;

export function getBrand(id?: string): BrandConfig {
  return BRANDS[id || DEFAULT_BRAND_ID] || BRANDS[DEFAULT_BRAND_ID];
}
