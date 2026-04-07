/**
 * National Quarterly Report — Data Assembler
 *
 * Queries live pipeline data and packages it into a typed NationalQuarterlyPayload.
 * No AI calls happen here — this is pure data assembly (per D-11).
 *
 * Key links:
 *   - getNationalIndex() / getPeerIndex() from fee-index.ts
 *   - getBeigeBookHeadlines() from fed.ts
 *   - DataManifest from report-engine/types.ts
 */

import { createHash } from "crypto";
import { getNationalIndex, getPeerIndex } from "@/lib/crawler-db/fee-index";
import { getBeigeBookHeadlines } from "@/lib/crawler-db/fed";
import { getDisplayName, FEE_TIERS } from "@/lib/fee-taxonomy";
import type { DataManifest } from "@/lib/report-engine/types";

// ─── Payload Types ─────────────────────────────────────────────────────────────

export interface NationalQuarterlySection {
  fee_category: string;
  display_name: string;
  fee_family: string | null;
  median_amount: number | null;
  p25_amount: number | null;
  p75_amount: number | null;
  institution_count: number;
  observation_count: number;
  maturity_tier: "strong" | "provisional" | "insufficient";
  // Charter breakdown (NQR-03)
  bank_median: number | null;
  cu_median: number | null;
  bank_count: number;
  cu_count: number;
}

export interface NationalQuarterlyPayload {
  report_date: string;
  quarter: string;
  total_institutions: number;
  total_bank_institutions: number;
  total_cu_institutions: number;
  categories: NationalQuarterlySection[];
  // Fed district context (NQR-04)
  district_headlines: Array<{
    district: number;
    headline: string;
    release_date: string;
  }>;
  manifest: DataManifest;
}

// ─── Quarter Derivation ────────────────────────────────────────────────────────

const MAX_HEADLINE_CHARS = 500;

function deriveQuarter(date: Date): string {
  const month = date.getMonth(); // 0-indexed
  const year = date.getFullYear();
  if (month <= 2) return `Q1 ${year}`;
  if (month <= 5) return `Q2 ${year}`;
  if (month <= 8) return `Q3 ${year}`;
  return `Q4 ${year}`;
}

// ─── Assembler ─────────────────────────────────────────────────────────────────

export async function assembleNationalQuarterly(): Promise<NationalQuarterlyPayload> {
  const assembled_at = new Date().toISOString();
  const now = new Date();

  // Query 1: All non-rejected fees (national index)
  const nationalEntries = await getNationalIndex();
  const manifestEntries: DataManifest["queries"] = [
    { sql: "getNationalIndex()", row_count: nationalEntries.length, executed_at: assembled_at },
  ];

  // Query 2: Bank-only peer index for charter medians
  const bankEntries = await getPeerIndex({ charter_type: "bank" });
  manifestEntries.push({
    sql: "getPeerIndex({ charter_type: 'bank' })",
    row_count: bankEntries.length,
    executed_at: assembled_at,
  });

  // Query 3: Credit union-only peer index
  const cuEntries = await getPeerIndex({ charter_type: "credit_union" });
  manifestEntries.push({
    sql: "getPeerIndex({ charter_type: 'credit_union' })",
    row_count: cuEntries.length,
    executed_at: assembled_at,
  });

  // Query 4: Beige Book headlines for all districts
  const headlinesMap = await getBeigeBookHeadlines();
  manifestEntries.push({
    sql: "getBeigeBookHeadlines()",
    row_count: headlinesMap.size,
    executed_at: assembled_at,
  });

  // Build lookup maps by fee_category for O(1) charter lookups
  const bankByCategory = new Map(bankEntries.map((e) => [e.fee_category, e]));
  const cuByCategory = new Map(cuEntries.map((e) => [e.fee_category, e]));

  // Build categories array — only the 49 taxonomy categories, not raw uncategorized fee names
  const taxonomyEntries = nationalEntries.filter((e) => e.fee_category in FEE_TIERS);
  const categories: NationalQuarterlySection[] = taxonomyEntries.map((entry) => {
    const bankEntry = bankByCategory.get(entry.fee_category);
    const cuEntry = cuByCategory.get(entry.fee_category);

    return {
      fee_category: entry.fee_category,
      display_name: getDisplayName(entry.fee_category),
      fee_family: entry.fee_family,
      median_amount: entry.median_amount,
      p25_amount: entry.p25_amount,
      p75_amount: entry.p75_amount,
      institution_count: entry.institution_count,
      observation_count: entry.observation_count,
      maturity_tier: entry.maturity_tier,
      bank_median: bankEntry?.median_amount ?? null,
      cu_median: cuEntry?.median_amount ?? null,
      bank_count: bankEntry?.institution_count ?? 0,
      cu_count: cuEntry?.institution_count ?? 0,
    };
  });

  // Build district_headlines — only districts that have a headline, trimmed to 500 chars
  const district_headlines: NationalQuarterlyPayload["district_headlines"] = [];
  for (const [district, headline] of headlinesMap.entries()) {
    district_headlines.push({
      district,
      headline: headline.text.slice(0, MAX_HEADLINE_CHARS),
      release_date: headline.release_date,
    });
  }
  district_headlines.sort((a, b) => a.district - b.district);

  // Compute charter institution totals from charter-filtered index
  const bankInstitutionSet = new Set(bankEntries.map((e) => e.institution_count));
  const cuInstitutionSet = new Set(cuEntries.map((e) => e.institution_count));
  const total_bank_institutions = bankEntries.reduce((max, e) => Math.max(max, e.institution_count), 0);
  const total_cu_institutions = cuEntries.reduce((max, e) => Math.max(max, e.institution_count), 0);

  // total_institutions: broadest coverage — max institution_count across all categories
  const total_institutions = nationalEntries.reduce((max, e) => Math.max(max, e.institution_count), 0);

  // Suppress unused variable warnings
  void bankInstitutionSet;
  void cuInstitutionSet;

  // Compute data_hash over assembled payload content
  const data_hash = createHash("sha256")
    .update(JSON.stringify({ categories, district_headlines }))
    .digest("hex");

  const pipeline_commit = process.env.VERCEL_GIT_COMMIT_SHA ?? "local";

  return {
    report_date: now.toISOString().slice(0, 10),
    quarter: deriveQuarter(now),
    total_institutions,
    total_bank_institutions,
    total_cu_institutions,
    categories,
    district_headlines,
    manifest: {
      queries: manifestEntries,
      data_hash,
      pipeline_commit,
    },
  };
}
