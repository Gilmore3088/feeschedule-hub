/**
 * Monthly Pulse Report — Data Assembler
 *
 * Detects month-over-month fee movement by comparing live getNationalIndex()
 * against the cached snapshot from fee_index_cache (materialized by publish-index).
 *
 * Movement threshold: categories must move > 5% to appear in movers lists (D-08).
 * If cache equals live data (no pipeline run between them), movers will be empty — correct behavior.
 */

import { createHash } from "crypto";
import { getNationalIndex, getNationalIndexCached } from "@/lib/crawler-db/fee-index";
import { getDisplayName } from "@/lib/fee-taxonomy";
import type { DataManifest } from "@/lib/report-engine/types";

// ─── Movement Threshold ───────────────────────────────────────────────────────

const MOVEMENT_THRESHOLD_PCT = 5.0;
const DIRECTION_THRESHOLD_PCT = 1.0;

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
  manifest: DataManifest;
}

// ─── Assembler ────────────────────────────────────────────────────────────────

export async function assembleMonthlyPulse(): Promise<MonthlyPulsePayload> {
  const now = new Date();
  const executedAt = now.toISOString();

  // Step 1: Fetch live index (current period)
  const currentIndex = await getNationalIndex();

  // Step 2: Fetch cached index (prior period)
  const cachedIndex = await getNationalIndexCached();

  // Build lookup maps by category
  const currentMap = new Map(
    currentIndex.map((e) => [e.fee_category, e])
  );
  const cachedMap = new Map(
    cachedIndex.map((e) => [e.fee_category, e])
  );

  // Step 3: Detect movers
  const movers: PulseMover[] = [];

  for (const current of currentIndex) {
    const prior = cachedMap.get(current.fee_category);
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

  // Step 4: Split and sort
  const movers_up = movers
    .filter((m) => m.direction === "up")
    .sort((a, b) => (b.change_pct ?? 0) - (a.change_pct ?? 0));

  const movers_down = movers
    .filter((m) => m.direction === "down")
    .sort((a, b) => Math.abs(b.change_pct ?? 0) - Math.abs(a.change_pct ?? 0));

  // Step 5: Build manifest
  const dataHashInput = JSON.stringify({ movers_up, movers_down });
  const data_hash = createHash("sha256").update(dataHashInput).digest("hex");

  const manifest: DataManifest = {
    queries: [
      {
        sql: "SELECT ef.fee_category, ef.amount, ef.crawl_target_id, ef.review_status, ef.created_at, ct.charter_type FROM extracted_fees ef JOIN crawl_targets ct ON ef.crawl_target_id = ct.id WHERE ef.fee_category IS NOT NULL AND ef.review_status != 'rejected'",
        row_count: currentIndex.length,
        executed_at: executedAt,
      },
      {
        sql: "SELECT * FROM fee_index_cache ORDER BY institution_count DESC",
        row_count: cachedIndex.length,
        executed_at: executedAt,
      },
    ],
    data_hash,
    pipeline_commit: process.env.VERCEL_GIT_COMMIT_SHA ?? "local",
  };

  // Step 6: Build payload
  const period_label = now.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  // Verify currentMap is used (accessed above via currentIndex loop)
  void currentMap;

  return {
    report_date: now.toISOString().split("T")[0],
    period_label,
    movers_up,
    movers_down,
    total_categories_tracked: currentIndex.length,
    total_movers: movers_up.length + movers_down.length,
    manifest,
  };
}
