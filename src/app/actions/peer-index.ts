"use server";

import { getPeerIndex, getNationalIndex } from "@/lib/crawler-db";
import type { IndexEntry } from "@/lib/crawler-db/fee-index";

const PREVIEW_CATEGORIES = [
  "monthly_maintenance",
  "nsf",
  "overdraft",
  "atm_non_network",
  "wire_domestic_outgoing",
];

export interface PeerPreviewResult {
  entries: { category: string; displayName: string; peerMedian: number | null; nationalMedian: number | null }[];
  label: string;
}

export async function getPeerPreview(filters: {
  charter?: string;
  tier?: string;
  district?: number;
}): Promise<PeerPreviewResult> {
  const hasFilters = filters.charter || filters.tier || filters.district;

  const nationalEntries = getNationalIndex();

  let peerEntries: IndexEntry[] = nationalEntries;
  let label = "All Institutions";

  if (hasFilters) {
    peerEntries = getPeerIndex({
      charter_type: filters.charter || undefined,
      asset_tiers: filters.tier ? [filters.tier] : undefined,
      fed_districts: filters.district ? [filters.district] : undefined,
    });

    const parts: string[] = [];
    if (filters.charter) parts.push(filters.charter === "Bank" ? "Banks" : "Credit Unions");
    if (filters.tier) parts.push(filters.tier);
    if (filters.district) {
      const districtNames: Record<number, string> = {
        1: "Boston", 2: "New York", 3: "Philadelphia", 4: "Cleveland",
        5: "Richmond", 6: "Atlanta", 7: "Chicago", 8: "St. Louis",
        9: "Minneapolis", 10: "Kansas City", 11: "Dallas", 12: "San Francisco",
      };
      parts.push(`District ${filters.district} - ${districtNames[filters.district] || ""}`);
    }
    label = parts.join(" / ");
  }

  const { getDisplayName } = await import("@/lib/fee-taxonomy");

  const entries = PREVIEW_CATEGORIES.map((cat) => {
    const peer = peerEntries.find((e) => e.fee_category === cat);
    const national = nationalEntries.find((e) => e.fee_category === cat);
    return {
      category: cat,
      displayName: getDisplayName(cat),
      peerMedian: peer?.median_amount ?? null,
      nationalMedian: national?.median_amount ?? null,
    };
  });

  return { entries, label };
}
