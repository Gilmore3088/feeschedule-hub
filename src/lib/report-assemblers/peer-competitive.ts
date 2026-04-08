/**
 * Peer-Competitive Report — Data Assembler
 *
 * Queries live pipeline data and packages it into a typed PeerCompetitivePayload.
 * No AI calls happen here — this is pure data assembly.
 * The Modal worker calls generateSection() on each sections[] entry.
 *
 * Key links:
 *   - getPeerIndex() / getNationalIndex() from crawler-db/fee-index.ts
 *   - getFeeChangeEvents() from crawler-db/fee-changes.ts
 *   - PeerCompetitiveData from hamilton/types.ts
 *   - DataManifest from report-engine/types.ts
 */

import { createHash } from "crypto";
import { getPeerIndex, getNationalIndex } from "@/lib/crawler-db/fee-index";
import { getFeeChangeEvents } from "@/lib/crawler-db/fee-changes";
import { getDisplayName, isFeaturedFee } from "@/lib/fee-taxonomy";
import { DISTRICT_NAMES, FDIC_TIER_LABELS } from "@/lib/fed-districts";
import type { PeerCompetitiveData, SectionType } from "@/lib/hamilton/types";
import type { DataManifest } from "@/lib/report-engine/types";

// ─── Public Types ──────────────────────────────────────────────────────────────

export interface PeerCompetitiveFilters {
  charter_type?: string;
  asset_tiers?: string[];
  fed_districts?: number[];
}

export interface PeerBriefSection {
  section_type: SectionType;
  /** Conclusion-first title for Hamilton context */
  title: string;
  /** Source data Hamilton may reference in the narrative */
  data: Record<string, unknown>;
  /** false = skip this section (e.g., fee_change_context with no data) */
  include: boolean;
}

export interface PeerCompetitivePayload {
  /** Feeds renderPeerCompetitiveReport() */
  data: PeerCompetitiveData;
  /** 3–5 sections for generateSection() calls in the Modal worker */
  sections: PeerBriefSection[];
  manifest: DataManifest;
}

// ─── Segment Label ─────────────────────────────────────────────────────────────

function buildSegmentLabel(filters: PeerCompetitiveFilters): string {
  const parts: string[] = [];

  if (filters.charter_type === "bank") {
    parts.push("Banks");
  } else if (filters.charter_type === "credit_union") {
    parts.push("Credit Unions");
  }

  if (filters.asset_tiers && filters.asset_tiers.length > 0) {
    parts.push(filters.asset_tiers.map((t) => FDIC_TIER_LABELS[t] ?? t).join(", "));
  }

  if (filters.fed_districts && filters.fed_districts.length > 0) {
    parts.push(
      filters.fed_districts
        .map((d) => `District ${d} (${DISTRICT_NAMES[d] ?? "Unknown"})`)
        .join(", ")
    );
  }

  return parts.length > 0 ? parts.join(" / ") : "All Institutions";
}

// ─── Delta Computation ─────────────────────────────────────────────────────────

function computeDelta(
  peerMedian: number | null,
  nationalMedian: number | null
): number | null {
  if (peerMedian === null || nationalMedian === null || nationalMedian === 0) {
    return null;
  }
  return ((peerMedian - nationalMedian) / Math.abs(nationalMedian)) * 100;
}

// ─── Assembler ─────────────────────────────────────────────────────────────────

export async function assemblePeerCompetitivePayload(
  filters: PeerCompetitiveFilters
): Promise<PeerCompetitivePayload> {
  const assembled_at = new Date().toISOString();

  // Run all three queries in parallel
  const [peerIndex, nationalIndex, feeChangeEvents] = await Promise.all([
    getPeerIndex({
      charter_type: filters.charter_type,
      asset_tiers: filters.asset_tiers,
      fed_districts: filters.fed_districts,
    }),
    getNationalIndex(),
    getFeeChangeEvents({
      charter_type: filters.charter_type,
      asset_tiers: filters.asset_tiers,
      fed_districts: filters.fed_districts,
      limit: 100,
    }),
  ]);

  // Build DataManifest tracking all three queries
  const queries: DataManifest["queries"] = [
    {
      sql: `getPeerIndex(${JSON.stringify(filters)})`,
      row_count: peerIndex.length,
      executed_at: assembled_at,
    },
    {
      sql: "getNationalIndex()",
      row_count: nationalIndex.length,
      executed_at: assembled_at,
    },
    {
      sql: `getFeeChangeEvents(${JSON.stringify({ ...filters, limit: 100 })})`,
      row_count: feeChangeEvents.length,
      executed_at: assembled_at,
    },
  ];

  // Build O(1) lookup map from national index
  const nationalByCategory = new Map(
    nationalIndex.map((e) => [e.fee_category, e])
  );

  // Merge peer + national data — only categories present in peer index
  const categories: PeerCompetitiveData["categories"] = peerIndex
    .map((peerEntry) => {
      const nationalEntry = nationalByCategory.get(peerEntry.fee_category);
      const peerMedian = peerEntry.median_amount;
      const nationalMedian = nationalEntry?.median_amount ?? null;

      return {
        fee_category: peerEntry.fee_category,
        display_name: getDisplayName(peerEntry.fee_category),
        peer_median: peerMedian,
        national_median: nationalMedian,
        p25_amount: peerEntry.p25_amount,
        p75_amount: peerEntry.p75_amount,
        delta_pct: computeDelta(peerMedian, nationalMedian),
        peer_count: peerEntry.institution_count,
        is_featured: isFeaturedFee(peerEntry.fee_category),
      };
    })
    // Sort: featured first, then by peer_count descending
    .sort((a, b) => {
      if (a.is_featured !== b.is_featured) {
        return a.is_featured ? -1 : 1;
      }
      return b.peer_count - a.peer_count;
    });

  // Compute segment stats
  const total_peer_institutions = peerIndex.reduce(
    (max, e) => Math.max(max, e.institution_count),
    0
  );
  const total_observations = peerIndex.reduce(
    (sum, e) => sum + e.observation_count,
    0
  );

  const segmentLabel = buildSegmentLabel(filters);

  // Build PeerCompetitiveData
  const data: PeerCompetitiveData = {
    title: `Competitive Fee Brief — ${segmentLabel}`,
    subtitle: `Peer Benchmarking vs. National Index`,
    report_date: new Date().toISOString().slice(0, 10),
    peer_definition: {
      charter_type: filters.charter_type,
      asset_tiers: filters.asset_tiers,
      fed_districts: filters.fed_districts,
    },
    categories,
    total_peer_institutions,
    total_observations,
  };

  // Top categories above/below national for executive summary
  const topAboveNational = categories
    .filter((c) => c.delta_pct !== null && c.delta_pct > 0)
    .sort((a, b) => (b.delta_pct ?? 0) - (a.delta_pct ?? 0))
    .slice(0, 5)
    .map((c) => ({ fee_category: c.fee_category, display_name: c.display_name, delta_pct: c.delta_pct }));

  const topBelowNational = categories
    .filter((c) => c.delta_pct !== null && c.delta_pct < 0)
    .sort((a, b) => (a.delta_pct ?? 0) - (b.delta_pct ?? 0))
    .slice(0, 5)
    .map((c) => ({ fee_category: c.fee_category, display_name: c.display_name, delta_pct: c.delta_pct }));

  // Top 6 featured categories by absolute delta_pct for section 2
  const featuredByDelta = categories
    .filter((c) => c.is_featured && c.delta_pct !== null)
    .sort((a, b) => Math.abs(b.delta_pct ?? 0) - Math.abs(a.delta_pct ?? 0))
    .slice(0, 6)
    .map((c) => ({
      fee_category: c.fee_category,
      display_name: c.display_name,
      peer_median: c.peer_median,
      national_median: c.national_median,
      delta_pct: c.delta_pct,
      peer_count: c.peer_count,
    }));

  // Outlier categories (|delta| > 15%)
  const outlierCategories = categories
    .filter((c) => c.delta_pct !== null && Math.abs(c.delta_pct) > 15)
    .map((c) => ({ fee_category: c.fee_category, display_name: c.display_name, delta_pct: c.delta_pct }));

  // Build sections array (3–5 sections depending on data availability)
  const sections: PeerBriefSection[] = [
    {
      section_type: "executive_summary",
      title: `Competitive Fee Position — ${segmentLabel} vs. National Peers`,
      data: {
        peer_count: total_peer_institutions,
        top_categories_above_national: topAboveNational,
        top_categories_below_national: topBelowNational,
        total_observations,
      },
      include: true,
    },
    {
      section_type: "peer_competitive",
      title: `Featured Fee Analysis — Where ${segmentLabel} Diverges from Peers`,
      data: {
        featured_categories: featuredByDelta,
      },
      include: true,
    },
    {
      section_type: "findings",
      title: `Fee Change History — Who Moved First in ${segmentLabel}`,
      data: {
        events: feeChangeEvents.slice(0, 20),
      },
      include: feeChangeEvents.length > 0,
    },
    {
      section_type: "peer_comparison",
      title: `Cost Advantage Analysis — Categories Where ${segmentLabel} Outperforms`,
      data: {
        below_national: categories.filter(
          (c) => c.delta_pct !== null && c.delta_pct < -5
        ),
        above_national: categories.filter(
          (c) => c.delta_pct !== null && c.delta_pct > 5
        ),
      },
      include: true,
    },
    {
      section_type: "recommendation",
      title: `Strategic Positioning — Actions for ${segmentLabel} Institutions`,
      data: {
        outlier_categories: outlierCategories,
        peer_count: total_peer_institutions,
        segment_label: segmentLabel,
      },
      include: true,
    },
  ];

  // Compute data_hash over assembled payload content
  const data_hash = createHash("sha256")
    .update(JSON.stringify({ data, sections_count: sections.length }))
    .digest("hex");

  const pipeline_commit =
    process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GIT_COMMIT_SHA ?? "local";

  return {
    data,
    sections,
    manifest: {
      queries,
      data_hash,
      pipeline_commit,
    },
  };
}
