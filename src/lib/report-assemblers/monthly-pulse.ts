/**
 * Monthly Pulse Report — Data Assembler
 *
 * "Current period" figures come from getNationalIndexCached() — the live
 * national index (published_fee_catalog joined to institution_sources)
 * overlaid with the canonical benchmark table (median/percentiles/
 * institution & observation counts, also from published_fee_catalog; see
 * src/lib/benchmarks/canonical.ts and fee-index.ts).
 *
 * Detecting month-over-month movement requires comparing that against a
 * PRIOR period's snapshot. There is currently no prior-period snapshot
 * store — getPriorPeriodIndex() below always returns null — so movers are
 * only computed when a prior snapshot actually exists; otherwise
 * movers_up/movers_down stay empty and movers_note explains why. This is
 * intentional: the report must never render "no movement" (implying a
 * comparison was made and nothing moved) when it in fact has no basis for
 * comparison yet. Building a real snapshot store is tracked separately —
 * not part of this fix.
 *
 * Movement threshold: categories must move > 5% to appear in movers lists (D-08).
 */

import { createHash } from "crypto";
import { getNationalIndexCached } from "@/lib/data-store/fee-index";
import type { IndexEntry } from "@/lib/data-store/fee-index";
import { getDisplayName } from "@/lib/fee-taxonomy";
import type { DataManifest } from "@/lib/report-engine/types";

// ─── Movement Threshold ───────────────────────────────────────────────────────

const MOVEMENT_THRESHOLD_PCT = 5.0;
const DIRECTION_THRESHOLD_PCT = 1.0;

export const NO_PRIOR_SNAPSHOT_NOTE =
  "Period-over-period movers require a prior benchmark snapshot; none is stored yet.";

// ─── Exported Types ────────────────────────────────────────────────────────────

export interface PulseMover {
  fee_category: string;
  display_name: string;
  current_median: number | null;
  prior_median: number | null;
  /** Signed: positive = moved up, negative = moved down */
  change_pct: number | null;
  current_institution_count: number;
  direction: "up" | "down" | "flat";
}

export interface MonthlyPulsePayload {
  report_date: string;       // ISO date string
  period_label: string;      // e.g. "April 2026"
  movers_up: PulseMover[];   // categories that increased, sorted by |change_pct| desc
  movers_down: PulseMover[]; // categories that decreased, sorted by |change_pct| desc
  total_categories_tracked: number;
  total_movers: number;
  /**
   * Explains why movers_up/movers_down are empty when there is no
   * prior-period snapshot to compare against. Null once a real snapshot
   * store exists and a comparison was actually attempted.
   */
  movers_note: string | null;
  manifest: DataManifest;
}

// ─── Prior-period snapshot (not yet implemented) ──────────────────────────────

/**
 * The prior-period national index to compare against, or null if no
 * snapshot store exists yet (true today). Isolated in its own function so
 * wiring in a real snapshot source later is a one-line change here, not a
 * rewrite of the assembler.
 */
async function getPriorPeriodIndex(): Promise<IndexEntry[] | null> {
  return null;
}

// ─── Assembler ────────────────────────────────────────────────────────────────

export async function assembleMonthlyPulse(): Promise<MonthlyPulsePayload> {
  const now = new Date();
  const executedAt = now.toISOString();

  const currentIndex = await getNationalIndexCached();
  const priorIndex = await getPriorPeriodIndex();

  const movers: PulseMover[] = [];
  const movers_note = priorIndex === null ? NO_PRIOR_SNAPSHOT_NOTE : null;

  if (priorIndex !== null) {
    const priorMap = new Map(priorIndex.map((e) => [e.fee_category, e]));

    for (const current of currentIndex) {
      const prior = priorMap.get(current.fee_category);
      const currentMedian = current.median_amount;
      const priorMedian = prior?.median_amount ?? null;

      let change_pct: number | null = null;
      let direction: PulseMover["direction"] = "flat";

      if (
        currentMedian !== null &&
        priorMedian !== null &&
        priorMedian !== 0
      ) {
        const raw = ((currentMedian - priorMedian) / priorMedian) * 100;
        change_pct = Math.round(raw * 10) / 10; // 1dp

        if (change_pct > DIRECTION_THRESHOLD_PCT) {
          direction = "up";
        } else if (change_pct < -DIRECTION_THRESHOLD_PCT) {
          direction = "down";
        }
      }

      // Only include categories that exceed the 5% signal threshold
      if (change_pct !== null && Math.abs(change_pct) > MOVEMENT_THRESHOLD_PCT) {
        movers.push({
          fee_category: current.fee_category,
          display_name: getDisplayName(current.fee_category),
          current_median: currentMedian,
          prior_median: priorMedian,
          change_pct,
          current_institution_count: current.institution_count,
          direction,
        });
      }
    }
  }

  // Split and sort
  const movers_up = movers
    .filter((m) => m.direction === "up")
    .sort((a, b) => (b.change_pct ?? 0) - (a.change_pct ?? 0));

  const movers_down = movers
    .filter((m) => m.direction === "down")
    .sort((a, b) => Math.abs(b.change_pct ?? 0) - Math.abs(a.change_pct ?? 0));

  // Build manifest
  const dataHashInput = JSON.stringify({ movers_up, movers_down, movers_note });
  const data_hash = createHash("sha256").update(dataHashInput).digest("hex");

  const manifest: DataManifest = {
    queries: [
      {
        sql: "getNationalIndexCached(): live national index over published_fee_catalog joined to institution_sources, overlaid with canonical benchmarks (median/p25/p75/min/max/institution_count/observation_count) computed from published_fee_catalog",
        row_count: currentIndex.length,
        executed_at: executedAt,
      },
    ],
    data_hash,
    pipeline_commit: process.env.VERCEL_GIT_COMMIT_SHA ?? "local",
  };

  // Build payload
  const period_label = now.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  return {
    report_date: now.toISOString().split("T")[0],
    period_label,
    movers_up,
    movers_down,
    total_categories_tracked: currentIndex.length,
    total_movers: movers_up.length + movers_down.length,
    movers_note,
    manifest,
  };
}
