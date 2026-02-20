"use server";

import { getPeerIndex, getNationalIndex } from "@/lib/crawler-db";
import { getDisplayName, getSpotlightCategories } from "@/lib/fee-taxonomy";

const SPOTLIGHT = getSpotlightCategories();

export interface PeerComparisonRow {
  fee_category: string;
  display_name: string;
  peer_median: number | null;
  national_median: number | null;
  delta_pct: number | null;
  peer_count: number;
}

export interface PeerPreviewResult {
  rows: PeerComparisonRow[];
  filter_description: string;
  peer_institution_count: number;
}

export async function fetchPeerPreview(filters: {
  charter_type?: string;
  asset_tiers?: string[];
  fed_districts?: number[];
}): Promise<PeerPreviewResult> {
  const hasFilters =
    !!filters.charter_type ||
    (filters.asset_tiers && filters.asset_tiers.length > 0) ||
    (filters.fed_districts && filters.fed_districts.length > 0);

  if (!hasFilters) {
    return { rows: [], filter_description: "", peer_institution_count: 0 };
  }

  const peerEntries = getPeerIndex(filters);
  const nationalEntries = getNationalIndex();

  const nationalMap = new Map(
    nationalEntries.map((e) => [e.fee_category, e])
  );

  let totalPeerInstitutions = 0;
  const rows: PeerComparisonRow[] = [];

  for (const cat of SPOTLIGHT) {
    const peer = peerEntries.find((e) => e.fee_category === cat);
    const national = nationalMap.get(cat);

    const peerMedian = peer?.median_amount ?? null;
    const nationalMedian = national?.median_amount ?? null;
    const peerCount = peer?.institution_count ?? 0;

    let deltaPct: number | null = null;
    if (peerMedian !== null && nationalMedian !== null && nationalMedian > 0) {
      deltaPct = Math.round(((peerMedian - nationalMedian) / nationalMedian) * 1000) / 10;
    }

    if (peerCount > totalPeerInstitutions) {
      totalPeerInstitutions = peerCount;
    }

    rows.push({
      fee_category: cat,
      display_name: getDisplayName(cat),
      peer_median: peerMedian,
      national_median: nationalMedian,
      delta_pct: deltaPct,
      peer_count: peerCount,
    });
  }

  const parts: string[] = [];
  if (filters.charter_type) {
    parts.push(filters.charter_type === "bank" ? "Banks" : "Credit Unions");
  }
  if (filters.asset_tiers && filters.asset_tiers.length > 0) {
    parts.push(
      filters.asset_tiers.length === 1
        ? filters.asset_tiers[0].replace(/_/g, " ")
        : `${filters.asset_tiers.length} tiers`
    );
  }
  if (filters.fed_districts && filters.fed_districts.length > 0) {
    parts.push(
      filters.fed_districts.length === 1
        ? `District ${filters.fed_districts[0]}`
        : `${filters.fed_districts.length} districts`
    );
  }

  return {
    rows,
    filter_description: parts.join(" / "),
    peer_institution_count: totalPeerInstitutions,
  };
}
