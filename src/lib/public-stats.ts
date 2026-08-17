import { cache } from "react";
import { getDataFreshness, getPublicStats } from "@/lib/data-store/core";
import { sql } from "@/lib/data-store/connection";

/**
 * Single source of truth for every public-facing headline number.
 * Pages must render these strings instead of hand-typing counts.
 */
export interface PublicStatsSummary {
  /** Institutions with at least one verified (approved) fee. */
  institutions: number;
  institutionsLabel: string;
  /** Institutions the index monitors (all charters, all states). */
  monitored: number;
  monitoredLabel: string;
  /** Verified fee observations. */
  observations: number;
  observationsLabel: string;
  /** Fee categories with verified data. */
  categories: number;
  categoriesLabel: string;
  states: number;
  statesLabel: string;
  /** Absolute date, e.g. "Aug 12, 2026", or null when unknown. */
  refreshedOn: string | null;
  /** "Data refreshed Aug 12, 2026" or "Data refresh pending". */
  freshnessLabel: string;
}

const NUMBER = new Intl.NumberFormat("en-US");

export function formatCount(n: number): string {
  return NUMBER.format(Math.max(0, Math.round(n)));
}

export function formatAbsoluteDate(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatFreshness(value: string | Date | null | undefined): string {
  const date = formatAbsoluteDate(value);
  return date ? `Data refreshed ${date}` : "Data refresh pending";
}

async function countMonitoredInstitutions(): Promise<number> {
  try {
    const [row] = await sql<{ cnt: number }[]>`SELECT COUNT(*) as cnt FROM institution_sources`;
    return Number(row?.cnt ?? 0);
  } catch {
    return 0;
  }
}

export const getPublicStatsSummary = cache(async (): Promise<PublicStatsSummary> => {
  const [stats, freshness, monitored] = await Promise.all([
    getPublicStats(),
    getDataFreshness().catch(() => null),
    countMonitoredInstitutions(),
  ]);
  const refreshedOn = formatAbsoluteDate(freshness?.last_fee_extracted_at ?? freshness?.last_crawl_at ?? null);
  return {
    institutions: stats.total_institutions,
    institutionsLabel: formatCount(stats.total_institutions),
    monitored,
    monitoredLabel: formatCount(monitored),
    observations: stats.total_observations,
    observationsLabel: formatCount(stats.total_observations),
    categories: stats.total_categories,
    categoriesLabel: formatCount(stats.total_categories),
    states: stats.total_states,
    statesLabel: formatCount(stats.total_states),
    refreshedOn,
    freshnessLabel: refreshedOn ? `Data refreshed ${refreshedOn}` : "Data refresh pending",
  };
});
