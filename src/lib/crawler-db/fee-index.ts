import { getDb } from "./connection";
import { getFeeFamily } from "@/lib/fee-taxonomy";
import { computeStats } from "./fees";

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

export function getNationalIndex(approvedOnly = false): IndexEntry[] {
  const db = getDb();
  const statusFilter = approvedOnly
    ? "ef.review_status = 'approved'"
    : "ef.review_status != 'rejected'";

  const rows = db
    .prepare(
      `SELECT ef.fee_category, ef.amount, ef.crawl_target_id,
              ef.review_status, ef.created_at, ct.charter_type
       FROM extracted_fees ef
       JOIN crawl_targets ct ON ef.crawl_target_id = ct.id
       WHERE ef.fee_category IS NOT NULL AND ${statusFilter}`
    )
    .all() as {
    fee_category: string;
    amount: number | null;
    crawl_target_id: number;
    review_status: string;
    created_at: string;
    charter_type: string;
  }[];

  return buildIndexEntries(rows);
}

export function getPeerIndex(
  filters: {
    charter_type?: string;
    asset_tiers?: string[];
    fed_districts?: number[];
    state_code?: string;
  },
  approvedOnly = false
): IndexEntry[] {
  const db = getDb();
  const conditions = ["ef.fee_category IS NOT NULL"];
  const params: (string | number)[] = [];

  conditions.push(
    approvedOnly
      ? "ef.review_status = 'approved'"
      : "ef.review_status != 'rejected'"
  );

  if (filters.charter_type) {
    conditions.push("ct.charter_type = ?");
    params.push(filters.charter_type);
  }
  if (filters.asset_tiers && filters.asset_tiers.length > 0) {
    const placeholders = filters.asset_tiers.map(() => "?").join(",");
    conditions.push(`ct.asset_size_tier IN (${placeholders})`);
    params.push(...filters.asset_tiers);
  }
  if (filters.fed_districts && filters.fed_districts.length > 0) {
    const placeholders = filters.fed_districts.map(() => "?").join(",");
    conditions.push(`ct.fed_district IN (${placeholders})`);
    params.push(...filters.fed_districts);
  }
  if (filters.state_code) {
    conditions.push("ct.state_code = ?");
    params.push(filters.state_code);
  }

  const where = conditions.join(" AND ");

  const rows = db
    .prepare(
      `SELECT ef.fee_category, ef.amount, ef.crawl_target_id,
              ef.review_status, ef.created_at, ct.charter_type
       FROM extracted_fees ef
       JOIN crawl_targets ct ON ef.crawl_target_id = ct.id
       WHERE ${where}`
    )
    .all(...params) as {
    fee_category: string;
    amount: number | null;
    crawl_target_id: number;
    review_status: string;
    created_at: string;
    charter_type: string;
  }[];

  return buildIndexEntries(rows);
}

export function getIndexSnapshot(
  filters?: {
    charter_type?: string;
    asset_tiers?: string[];
    fed_districts?: number[];
  },
  limit = 10
): IndexEntry[] {
  const entries = filters
    ? getPeerIndex(filters)
    : getNationalIndex();
  return entries.slice(0, limit);
}

export function getDistrictMedianByCategory(
  category: string,
  filters?: { charter_type?: string; asset_tiers?: string[] }
): { district: number; median_amount: number | null; institution_count: number }[] {
  const db = getDb();
  const conditions = [
    "ef.fee_category = ?",
    "ef.review_status != 'rejected'",
    "ct.fed_district IS NOT NULL",
  ];
  const params: (string | number)[] = [category];

  if (filters?.charter_type) {
    conditions.push("ct.charter_type = ?");
    params.push(filters.charter_type);
  }
  if (filters?.asset_tiers && filters.asset_tiers.length > 0) {
    const placeholders = filters.asset_tiers.map(() => "?").join(",");
    conditions.push(`ct.asset_size_tier IN (${placeholders})`);
    params.push(...filters.asset_tiers);
  }

  const rows = db
    .prepare(
      `SELECT ef.amount, ct.fed_district, ef.crawl_target_id
       FROM extracted_fees ef
       JOIN crawl_targets ct ON ef.crawl_target_id = ct.id
       WHERE ${conditions.join(" AND ")}`
    )
    .all(...params) as {
    amount: number | null;
    fed_district: number;
    crawl_target_id: number;
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
    entry.institutions.add(row.crawl_target_id);
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

function buildIndexEntries(
  rows: {
    fee_category: string;
    amount: number | null;
    crawl_target_id: number;
    review_status: string;
    created_at: string;
    charter_type: string;
  }[]
): IndexEntry[] {
  const grouped = new Map<
    string,
    {
      amounts: number[];
      banks: Set<number>;
      cus: Set<number>;
      approved: number;
      total: number;
      latest: string;
    }
  >();

  for (const row of rows) {
    if (!grouped.has(row.fee_category)) {
      grouped.set(row.fee_category, {
        amounts: [],
        banks: new Set(),
        cus: new Set(),
        approved: 0,
        total: 0,
        latest: "",
      });
    }
    const entry = grouped.get(row.fee_category)!;
    entry.total++;
    if (row.amount !== null && row.amount > 0) {
      entry.amounts.push(row.amount);
    }
    if (row.charter_type === "bank") {
      entry.banks.add(row.crawl_target_id);
    } else {
      entry.cus.add(row.crawl_target_id);
    }
    if (row.review_status === "approved") {
      entry.approved++;
    }
    if (row.created_at > entry.latest) {
      entry.latest = row.created_at;
    }
  }

  const results: IndexEntry[] = [];
  for (const [category, data] of grouped.entries()) {
    const stats = computeStats(data.amounts);
    const institutionCount = new Set([...data.banks, ...data.cus]).size;

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
      bank_count: data.banks.size,
      cu_count: data.cus.size,
      maturity_tier,
      last_updated: data.latest || null,
    });
  }

  results.sort((a, b) => b.institution_count - a.institution_count);
  return results;
}

/**
 * Read precomputed index from fee_index_cache (materialized by publish-index).
 * Falls back to live computation if cache is empty.
 */
export function getNationalIndexCached(): IndexEntry[] {
  const db = getDb();
  try {
    const rows = db
      .prepare("SELECT * FROM fee_index_cache ORDER BY institution_count DESC")
      .all() as {
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
      maturity_tier: string;
      computed_at: string;
    }[];

    if (rows.length === 0) {
      return getNationalIndex();
    }

    return rows.map((row) => ({
      fee_category: row.fee_category,
      fee_family: row.fee_family,
      median_amount: row.median_amount,
      p25_amount: row.p25_amount,
      p75_amount: row.p75_amount,
      min_amount: row.min_amount,
      max_amount: row.max_amount,
      institution_count: row.institution_count,
      observation_count: row.observation_count,
      approved_count: row.approved_count,
      bank_count: row.bank_count,
      cu_count: row.cu_count,
      maturity_tier: row.maturity_tier as IndexEntry["maturity_tier"],
      last_updated: row.computed_at,
    }));
  } catch {
    return getNationalIndex();
  }
}
