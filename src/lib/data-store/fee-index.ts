import { sql } from "./connection";
import { getFeeFamily, FEE_FAMILIES } from "@/lib/fee-taxonomy";
import { computeStats } from "./fees";
import { getCanonicalBenchmarks } from "@/lib/benchmarks/canonical";

/** All canonical fee categories (see TAXONOMY_COUNT in fee-taxonomy.ts) — only these appear in indexes and reports */
const CANONICAL_CATEGORIES = Object.values(FEE_FAMILIES).flat();

export interface IndexEntry {
  fee_category: string;
  fee_family: string | null;
  median_amount: number | null;
  p25_amount: number | null;
  p75_amount: number | null;
  min_amount: number | null;
  max_amount: number | null;
  institution_count: number;
  observation_count: number;
  approved_count: number;
  bank_count: number;
  cu_count: number;
  maturity_tier: "strong" | "provisional" | "insufficient";
  last_updated: string | null;
}

export async function getNationalIndex(approvedOnly = true): Promise<IndexEntry[]> {
  const statusFilter = approvedOnly
    ? "ef.review_status = 'approved'"
    : "ef.review_status != 'rejected'";

  const rows = await sql.unsafe(
    `SELECT ef.fee_category, ef.amount, ef.institution_id,
            ef.review_status, ef.created_at, ct.charter_type
     FROM published_fee_catalog ef
     JOIN institution_sources ct ON ef.institution_id = ct.id
     WHERE ef.fee_category = ANY(ARRAY[${CANONICAL_CATEGORIES.map((c) => `'${c}'`).join(",")}]) AND ${statusFilter}`
  ) as {
    fee_category: string;
    amount: number | null;
    institution_id: number;
    review_status: string;
    created_at: string;
    charter_type: string;
  }[];

  return buildIndexEntries(rows);
}

export async function getPeerIndex(
  filters: {
    charter_type?: string;
    asset_tiers?: string[];
    fed_districts?: number[];
    state_code?: string;
  },
  approvedOnly = true
): Promise<IndexEntry[]> {
  const conditions = ["ef.fee_category IS NOT NULL"];
  const params: (string | number)[] = [];
  let paramIdx = 0;

  conditions.push(
    approvedOnly
      ? "ef.review_status = 'approved'"
      : "ef.review_status != 'rejected'"
  );

  if (filters.charter_type) {
    paramIdx++;
    conditions.push(`ct.charter_type = $${paramIdx}`);
    params.push(filters.charter_type);
  }
  if (filters.asset_tiers && filters.asset_tiers.length > 0) {
    const placeholders = filters.asset_tiers.map(() => {
      paramIdx++;
      return `$${paramIdx}`;
    }).join(",");
    conditions.push(`ct.asset_size_tier IN (${placeholders})`);
    params.push(...filters.asset_tiers);
  }
  if (filters.fed_districts && filters.fed_districts.length > 0) {
    const placeholders = filters.fed_districts.map(() => {
      paramIdx++;
      return `$${paramIdx}`;
    }).join(",");
    conditions.push(`ct.fed_district IN (${placeholders})`);
    params.push(...filters.fed_districts);
  }
  if (filters.state_code) {
    paramIdx++;
    conditions.push(`ct.state_code = $${paramIdx}`);
    params.push(filters.state_code);
  }

  const where = conditions.join(" AND ");

  const rows = await sql.unsafe(
    `SELECT ef.fee_category, ef.amount, ef.institution_id,
            ef.review_status, ef.created_at, ct.charter_type
     FROM published_fee_catalog ef
     JOIN institution_sources ct ON ef.institution_id = ct.id
     WHERE ${where}`,
    params
  ) as {
    fee_category: string;
    amount: number | null;
    institution_id: number;
    review_status: string;
    created_at: string;
    charter_type: string;
  }[];

  return buildIndexEntries(rows);
}

export async function getIndexSnapshot(
  filters?: {
    charter_type?: string;
    asset_tiers?: string[];
    fed_districts?: number[];
  },
  limit = 10
): Promise<IndexEntry[]> {
  const entries = filters
    ? await getPeerIndex(filters)
    : await getNationalIndex();
  return entries.slice(0, limit);
}

export async function getDistrictMedianByCategory(
  category: string,
  filters?: { charter_type?: string; asset_tiers?: string[] }
): Promise<{ district: number; median_amount: number | null; institution_count: number }[]> {
  const conditions = [
    "ef.fee_category = $1",
    "ef.review_status = 'approved'",
    "ct.fed_district IS NOT NULL",
  ];
  const params: (string | number)[] = [category];
  let paramIdx = 1;

  if (filters?.charter_type) {
    paramIdx++;
    conditions.push(`ct.charter_type = $${paramIdx}`);
    params.push(filters.charter_type);
  }
  if (filters?.asset_tiers && filters.asset_tiers.length > 0) {
    const placeholders = filters.asset_tiers.map(() => {
      paramIdx++;
      return `$${paramIdx}`;
    }).join(",");
    conditions.push(`ct.asset_size_tier IN (${placeholders})`);
    params.push(...filters.asset_tiers);
  }

  const rows = await sql.unsafe(
    `SELECT ef.amount, ct.fed_district, ef.institution_id
     FROM published_fee_catalog ef
     JOIN institution_sources ct ON ef.institution_id = ct.id
     WHERE ${conditions.join(" AND ")}`,
    params
  ) as {
    amount: number | null;
    fed_district: number;
    institution_id: number;
  }[];

  const grouped = new Map<
    number,
    { amounts: number[]; institutions: Set<number> }
  >();

  for (const row of rows) {
    if (!grouped.has(row.fed_district)) {
      grouped.set(row.fed_district, { amounts: [], institutions: new Set() });
    }
    const entry = grouped.get(row.fed_district)!;
    entry.institutions.add(row.institution_id);
    if (row.amount !== null && row.amount > 0) {
      entry.amounts.push(row.amount);
    }
  }

  const results: { district: number; median_amount: number | null; institution_count: number }[] = [];
  for (const [district, data] of grouped.entries()) {
    const stats = computeStats(data.amounts);
    results.push({
      district,
      median_amount: stats.median,
      institution_count: data.institutions.size,
    });
  }

  results.sort((a, b) => a.district - b.district);
  return results;
}

export async function getDistrictFeeMedians(
  district: number
): Promise<{ fee_category: string; median_amount: number; institution_count: number }[]> {
  const rows = await sql`
    SELECT ef.fee_category,
           PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ef.amount) AS median_amount,
           COUNT(DISTINCT ef.institution_id) AS institution_count
    FROM published_fee_catalog ef
    JOIN institution_sources ct ON ef.institution_id = ct.id
    WHERE ct.fed_district = ${district}
      AND ef.review_status = 'approved'
      AND ef.amount IS NOT NULL
      AND ef.amount > 0
    GROUP BY ef.fee_category
    HAVING COUNT(DISTINCT ef.institution_id) >= 3
    ORDER BY COUNT(DISTINCT ef.institution_id) DESC
  `;
  return rows.map(r => ({
    fee_category: r.fee_category as string,
    median_amount: Number(r.median_amount),
    institution_count: Number(r.institution_count),
  }));
}

function buildIndexEntries(
  rows: {
    fee_category: string;
    amount: number | null;
    institution_id: number;
    review_status: string;
    created_at: string;
    charter_type: string;
  }[]
): IndexEntry[] {
  const grouped = new Map<
    string,
    {
      // Per-institution minimum priced amount — same dedupe rule as the
      // canonical benchmark table, so a tiered fee (several rows for one
      // institution) doesn't multiply that institution in the median.
      minAmountByInstitution: Map<number, number>;
      charterTypeByInstitution: Map<number, string>;
      approved: number;
      total: number;
      latest: string;
    }
  >();

  for (const row of rows) {
    if (!grouped.has(row.fee_category)) {
      grouped.set(row.fee_category, {
        minAmountByInstitution: new Map(),
        charterTypeByInstitution: new Map(),
        approved: 0,
        total: 0,
        latest: "",
      });
    }
    const entry = grouped.get(row.fee_category)!;
    entry.total++;
    const targetId = Number(row.institution_id);
    const amt = row.amount !== null ? Number(row.amount) : null;
    if (amt !== null && amt > 0) {
      const existing = entry.minAmountByInstitution.get(targetId);
      if (existing === undefined || amt < existing) {
        entry.minAmountByInstitution.set(targetId, amt);
      }
      entry.charterTypeByInstitution.set(targetId, row.charter_type);
    }
    if (row.review_status === "approved") {
      entry.approved++;
    }
    const createdAt = (row.created_at as unknown) instanceof Date
      ? (row.created_at as unknown as Date).toISOString()
      : String(row.created_at ?? "");
    if (createdAt > entry.latest) {
      entry.latest = createdAt;
    }
  }

  const results: IndexEntry[] = [];
  for (const [category, data] of grouped.entries()) {
    const amounts = [...data.minAmountByInstitution.values()];
    const stats = computeStats(amounts);
    let bankCount = 0;
    let cuCount = 0;
    for (const charterType of data.charterTypeByInstitution.values()) {
      if (charterType === "bank") bankCount++;
      else cuCount++;
    }
    const institutionCount = data.minAmountByInstitution.size;

    let maturity_tier: IndexEntry["maturity_tier"] = "insufficient";
    if (data.approved >= 10) {
      maturity_tier = "strong";
    } else if (data.total >= 10) {
      maturity_tier = "provisional";
    }

    results.push({
      fee_category: category,
      fee_family: getFeeFamily(category),
      median_amount: stats.median,
      p25_amount: stats.p25,
      p75_amount: stats.p75,
      min_amount: stats.min,
      max_amount: stats.max,
      institution_count: institutionCount,
      observation_count: data.total,
      approved_count: data.approved,
      bank_count: bankCount,
      cu_count: cuCount,
      maturity_tier,
      last_updated: data.latest || null,
    });
  }

  results.sort((a, b) => b.institution_count - a.institution_count);
  return results;
}

/**
 * Live national index, with its headline numbers (median/percentiles/
 * institution_count/observation_count) overlaid from the canonical
 * benchmark table so this always agrees with /fees, /fees/[category], and
 * the state/district "national" column. Cached in-process for
 * NATIONAL_INDEX_CACHE_TTL_MS with in-flight promise dedupe.
 *
 * This used to read a materialized fee_index_cache table that nothing in
 * src/ writes, which is why it could silently disagree with the live pages
 * above — removed in favor of always computing live.
 */
const NATIONAL_INDEX_CACHE_TTL_MS = 60_000;
let nationalIndexCache: {
  expiresAt: number;
  value: IndexEntry[];
} | null = null;
let nationalIndexCachePromise: Promise<IndexEntry[]> | null = null;

export async function getNationalIndexCached(): Promise<IndexEntry[]> {
  const now = Date.now();
  if (nationalIndexCache && nationalIndexCache.expiresAt > now) {
    return nationalIndexCache.value;
  }
  if (nationalIndexCachePromise) {
    return nationalIndexCachePromise;
  }

  nationalIndexCachePromise = buildCanonicalNationalIndex()
    .then((value) => {
      nationalIndexCache = {
        value,
        expiresAt: Date.now() + NATIONAL_INDEX_CACHE_TTL_MS,
      };
      return value;
    })
    .finally(() => {
      nationalIndexCachePromise = null;
    });
  return nationalIndexCachePromise;
}

async function buildCanonicalNationalIndex(): Promise<IndexEntry[]> {
  const [liveIndex, benchmarks] = await Promise.all([
    getNationalIndex(),
    getCanonicalBenchmarks(),
  ]);

  return liveIndex.map((entry) => {
    const bench = benchmarks[entry.fee_category];
    if (!bench) return entry;
    return {
      ...entry,
      median_amount: bench.median,
      p25_amount: bench.p25,
      p75_amount: bench.p75,
      min_amount: bench.min,
      max_amount: bench.max,
      institution_count: bench.institution_count,
      observation_count: bench.observation_count,
      last_updated: bench.as_of ?? entry.last_updated,
    };
  });
}
