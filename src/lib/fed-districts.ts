export const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "District of Columbia",
  FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
  ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada",
  NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma",
  OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin",
  WY: "Wyoming", PR: "Puerto Rico", VI: "Virgin Islands", GU: "Guam", AS: "American Samoa",
};

export const DISTRICT_NAMES: Record<number, string> = {
  1: "Boston",
  2: "New York",
  3: "Philadelphia",
  4: "Cleveland",
  5: "Richmond",
  6: "Atlanta",
  7: "Chicago",
  8: "St. Louis",
  9: "Minneapolis",
  10: "Kansas City",
  11: "Dallas",
  12: "San Francisco",
};

export const TIER_LABELS: Record<string, string> = {
  community_small: "Community (<$300M)",
  community_mid: "Community ($300M-$1B)",
  community_large: "Community ($1B-$10B)",
  regional: "Regional ($10B-$50B)",
  large_regional: "Large Regional ($50B-$250B)",
  super_regional: "Super Regional ($250B+)",
};

export const TIER_ORDER = [
  "community_small",
  "community_mid",
  "community_large",
  "regional",
  "large_regional",
  "super_regional",
] as const;

export const STATE_TO_DISTRICT: Record<string, number> = {
  CT: 1, ME: 1, MA: 1, NH: 1, RI: 1, VT: 1,
  NY: 2, NJ: 2, PR: 2, VI: 2,
  PA: 3, DE: 3,
  OH: 4, KY: 4,
  VA: 5, MD: 5, DC: 5, NC: 5, SC: 5, WV: 5,
  GA: 6, FL: 6, AL: 6, TN: 6, MS: 6, LA: 6,
  IL: 7, IN: 7, IA: 7, MI: 7, WI: 7,
  MO: 8, AR: 8,
  MN: 9, MT: 9, ND: 9, SD: 9,
  KS: 10, NE: 10, OK: 10, CO: 10, WY: 10, NM: 10,
  TX: 11,
  CA: 12, WA: 12, OR: 12, NV: 12, UT: 12, ID: 12, AZ: 12, HI: 12, AK: 12, GU: 12, AS: 12,
};

export interface PeerFilters {
  charter?: string;
  tiers?: string[];
  districts?: number[];
  range?: string;
}

export function parsePeerFilters(params: {
  charter?: string;
  tier?: string;
  district?: string;
  range?: string;
}): PeerFilters {
  const filters: PeerFilters = {};

  if (params.charter === "bank" || params.charter === "credit_union") {
    filters.charter = params.charter;
  }

  if (params.tier) {
    const tiers = params.tier
      .split(",")
      .filter((t) => t in TIER_LABELS);
    if (tiers.length > 0) {
      filters.tiers = tiers;
    }
  }

  if (params.district) {
    const districts = params.district
      .split(",")
      .map((d) => parseInt(d, 10))
      .filter((d) => d >= 1 && d <= 12);
    if (districts.length > 0) {
      filters.districts = districts;
    }
  }

  if (params.range && ["7d", "30d", "90d", "all"].includes(params.range)) {
    filters.range = params.range;
  }

  return filters;
}

export function buildFilterDescription(filters: PeerFilters): string {
  const parts: string[] = [];

  if (filters.districts && filters.districts.length > 0) {
    const districtLabels = filters.districts.map(
      (d) => `${d} - ${DISTRICT_NAMES[d] ?? "Unknown"}`
    );
    parts.push(`District ${districtLabels.join(", ")}`);
  }

  if (filters.tiers && filters.tiers.length > 0) {
    const tierLabels = filters.tiers.map((t) => TIER_LABELS[t] ?? t);
    parts.push(tierLabels.join(", "));
  }

  if (filters.charter) {
    parts.push(filters.charter === "bank" ? "Banks" : "Credit Unions");
  }

  return parts.length > 0 ? parts.join(" | ") : "All Institutions";
}
