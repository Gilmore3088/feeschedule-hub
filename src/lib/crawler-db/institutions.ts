import { getDb } from "./connection";
import { computeStats } from "./fees";
import type { InstitutionDetail } from "./types";

export type FeeReviewStatus = "pending" | "staged" | "approved" | "rejected";

export interface InstitutionSearchResult {
  id: number;
  institution_name: string;
  city: string | null;
  state_code: string | null;
  charter_type: string;
  asset_size_tier: string | null;
  has_fees: boolean;
  fee_count: number;
}

export interface InstitutionFee {
  fee_category: string;
  fee_name: string;
  amount: number | null;
  frequency: string | null;
  conditions: string | null;
  review_status: FeeReviewStatus;
  confidence: number | null;
}

export interface InstitutionProfile extends InstitutionDetail {
  website_url: string | null;
  fee_schedule_url: string | null;
  last_crawl_at: string | null;
  fees: InstitutionFee[];
}

export interface ScorecardEntry {
  fee_category: string;
  institution_amount: number | null;
  national_median: number | null;
  national_delta_pct: number | null;
  conditions: string | null;
}

function sanitizeLikePattern(input: string): string {
  return input.replace(/[%_\\]/g, "\\$&");
}

export function searchInstitutions(
  query: string,
  limit = 10
): InstitutionSearchResult[] {
  if (!query || query.trim().length < 2) return [];

  const trimmed = query.trim().slice(0, 100);
  const sanitized = sanitizeLikePattern(trimmed);
  const db = getDb();

  return db
    .prepare(
      `SELECT ct.id, ct.institution_name, ct.city, ct.state_code,
              ct.charter_type, ct.asset_size_tier,
              CASE WHEN fc.fee_count > 0 THEN 1 ELSE 0 END as has_fees,
              COALESCE(fc.fee_count, 0) as fee_count
       FROM crawl_targets ct
       LEFT JOIN (
         SELECT crawl_target_id, COUNT(DISTINCT fee_category) as fee_count
         FROM extracted_fees
         WHERE fee_category IS NOT NULL AND review_status != 'rejected'
         GROUP BY crawl_target_id
       ) fc ON ct.id = fc.crawl_target_id
       WHERE ct.institution_name LIKE '%' || ? || '%' ESCAPE '\\'
       ORDER BY
         CASE WHEN ct.institution_name LIKE ? || '%' ESCAPE '\\' THEN 0 ELSE 1 END,
         CASE WHEN fc.fee_count > 0 THEN 0 ELSE 1 END,
         ct.institution_name
       LIMIT ?`
    )
    .all(sanitized, sanitized, limit) as InstitutionSearchResult[];
}

export function getInstitutionProfile(
  id: number
): InstitutionProfile | null {
  const db = getDb();

  const row = db
    .prepare(
      `SELECT ct.id, ct.institution_name, ct.state_code, ct.charter_type,
              ct.asset_size, ct.asset_size_tier, ct.fed_district, ct.city,
              ct.website_url, ct.fee_schedule_url, ct.last_crawl_at,
              COUNT(ef.id) as fee_count
       FROM crawl_targets ct
       LEFT JOIN extracted_fees ef ON ct.id = ef.crawl_target_id
       WHERE ct.id = ?
       GROUP BY ct.id`
    )
    .get(id) as Record<string, unknown> | undefined;

  if (!row) return null;

  // Deduplicate: keep the latest fee per category (highest id as tiebreaker)
  const fees = db
    .prepare(
      `SELECT ef.fee_category, ef.fee_name, ef.amount, ef.frequency,
              ef.conditions, ef.review_status, ef.extraction_confidence as confidence
       FROM extracted_fees ef
       INNER JOIN (
         SELECT fee_category, MAX(id) as max_id
         FROM extracted_fees
         WHERE crawl_target_id = ?
           AND fee_category IS NOT NULL
           AND review_status != 'rejected'
         GROUP BY fee_category
       ) latest ON ef.id = latest.max_id
       WHERE ef.crawl_target_id = ?
       ORDER BY ef.fee_category`
    )
    .all(id, id) as InstitutionFee[];

  return {
    id: row.id as number,
    institution_name: row.institution_name as string,
    state_code: row.state_code as string | null,
    charter_type: row.charter_type as string,
    asset_size: row.asset_size as number | null,
    asset_size_tier: row.asset_size_tier as string | null,
    fed_district: row.fed_district as number | null,
    city: row.city as string | null,
    website_url: row.website_url as string | null,
    fee_schedule_url: row.fee_schedule_url as string | null,
    last_crawl_at: row.last_crawl_at as string | null,
    fee_count: row.fee_count as number,
    fees,
  };
}

export function getInstitutionScorecard(
  institutionId: number,
  fees: InstitutionFee[]
): ScorecardEntry[] {
  if (fees.length === 0) return [];

  const db = getDb();
  const categories = fees.map((f) => f.fee_category);
  const placeholders = categories.map(() => "?").join(",");

  // Batch: get all national fees for these categories in one query
  const nationalRows = db
    .prepare(
      `SELECT ef.fee_category, ef.amount
       FROM extracted_fees ef
       WHERE ef.fee_category IN (${placeholders})
         AND ef.review_status != 'rejected'
         AND ef.amount IS NOT NULL
         AND ef.amount > 0`
    )
    .all(...categories) as { fee_category: string; amount: number }[];

  // Group national amounts by category
  const nationalByCategory = new Map<string, number[]>();
  for (const row of nationalRows) {
    if (!nationalByCategory.has(row.fee_category)) {
      nationalByCategory.set(row.fee_category, []);
    }
    nationalByCategory.get(row.fee_category)!.push(row.amount);
  }

  const entries: ScorecardEntry[] = [];
  for (const fee of fees) {
    const nationalAmounts = nationalByCategory.get(fee.fee_category) ?? [];
    const nationalStats = computeStats(nationalAmounts);
    const nationalMedian = nationalStats.median;

    let nationalDeltaPct: number | null = null;
    if (
      fee.amount != null &&
      fee.amount > 0 &&
      nationalMedian != null &&
      nationalMedian > 0
    ) {
      nationalDeltaPct =
        Math.round(
          ((fee.amount - nationalMedian) / nationalMedian) * 1000
        ) / 10;
    }

    entries.push({
      fee_category: fee.fee_category,
      institution_amount: fee.amount,
      national_median: nationalMedian,
      national_delta_pct: nationalDeltaPct,
      conditions: fee.conditions,
    });
  }

  return entries;
}

export function getInstitutionIdsWithFees(): {
  id: number;
  last_crawl_at: string | null;
}[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT DISTINCT ct.id, ct.last_crawl_at
       FROM crawl_targets ct
       INNER JOIN extracted_fees ef ON ct.id = ef.crawl_target_id
       WHERE ef.fee_category IS NOT NULL
         AND ef.review_status != 'rejected'
       ORDER BY ct.id`
    )
    .all() as { id: number; last_crawl_at: string | null }[];
}
