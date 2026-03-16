export interface BrandConfig {
  name: string;
  tagline: string;
  url: string;
  primaryColor: string;
  accentColor: string;
  logoSvg: string;
}

const FEE_INSIGHT_LOGO = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="28" height="28"><path d="M3 17l4-8 4 5 4-10 6 13"/></svg>`;

export const BRANDS: Record<string, BrandConfig> = {
  "fee-insight": {
    name: "Bank Fee Index",
    tagline: "Banking Fee Intelligence",
    url: "feeinsight.com",
    primaryColor: "#0f172a",
    accentColor: "#f59e0b",
    logoSvg: FEE_INSIGHT_LOGO,
  },
  "bank-fee-index": {
    name: "Bank Fee Index",
    tagline: "The National Benchmark for Retail Banking Fees",
    url: "bankfeeindex.com",
    primaryColor: "#0f172a",
    accentColor: "#f59e0b",
    logoSvg: FEE_INSIGHT_LOGO,
  },
};

export type BrandId = keyof typeof BRANDS;

export function getBrand(id?: string): BrandConfig {
  return BRANDS[id || "fee-insight"] || BRANDS["fee-insight"];
}
