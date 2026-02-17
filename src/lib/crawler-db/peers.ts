import { getDb } from "./connection";
import { computePercentile } from "./fees";
import type { PeerFilteredStats } from "./dashboard";

export interface PeerTopCategory {
  fee_category: string;
  institution_count: number;
  median_amount: number | null;
  fee_family: string | null;
}

export function getTopCategoriesForPeerSet(
  filters: { charter_type?: string; asset_tiers?: string[]; fed_districts?: number[] },
  limit = 5
): PeerTopCategory[] {
  const db = getDb();
  try {
    const conditions = ["ef.fee_category IS NOT NULL"];
    const params: (string | number)[] = [];

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

    const where = conditions.join(" AND ");

    const rows = db
      .prepare(
        `SELECT ef.fee_category, ef.amount, ef.crawl_target_id
         FROM extracted_fees ef
         JOIN crawl_targets ct ON ef.crawl_target_id = ct.id
         WHERE ${where}`
      )
      .all(...params) as {
      fee_category: string;
      amount: number | null;
      crawl_target_id: number;
    }[];

    const grouped = new Map<string, { amounts: number[]; institutions: Set<number> }>();
    for (const row of rows) {
      if (!grouped.has(row.fee_category)) {
        grouped.set(row.fee_category, { amounts: [], institutions: new Set() });
      }
      const entry = grouped.get(row.fee_category)!;
      entry.institutions.add(row.crawl_target_id);
      if (row.amount !== null && row.amount > 0) {
        entry.amounts.push(row.amount);
      }
    }

    const results: PeerTopCategory[] = [];
    for (const [category, data] of grouped.entries()) {
      const sorted = [...data.amounts].sort((a, b) => a - b);
      const median = sorted.length > 0
        ? Math.round(computePercentile(sorted, 50) * 100) / 100
        : null;
      results.push({
        fee_category: category,
        institution_count: data.institutions.size,
        median_amount: median,
        fee_family: null,
      });
    }

    results.sort((a, b) => b.institution_count - a.institution_count);
    return results.slice(0, limit);
  } finally {
    db.close();
  }
}

export interface PeerPreviewStats extends PeerFilteredStats {
  fee_url_pct: number;
  flagged_count: number;
  flag_rate: number;
  avg_confidence: number;
}

export function getPeerPreviewStats(filters: {
  charter_type?: string;
  asset_tiers?: string[];
  fed_districts?: number[];
}): PeerPreviewStats {
  const db = getDb();
  try {
    const conditions: string[] = [];
    const params: (string | number)[] = [];

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

    const where = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";

    const row = db
      .prepare(
        `SELECT COUNT(*) as total,
                SUM(CASE WHEN ct.website_url IS NOT NULL THEN 1 ELSE 0 END) as with_website,
                SUM(CASE WHEN ct.fee_schedule_url IS NOT NULL THEN 1 ELSE 0 END) as with_fee_url,
                SUM(CASE WHEN ct.charter_type = 'bank' THEN 1 ELSE 0 END) as banks,
                SUM(CASE WHEN ct.charter_type = 'credit_union' THEN 1 ELSE 0 END) as credit_unions
         FROM crawl_targets ct
         ${where}`
      )
      .get(...params) as {
      total: number;
      with_website: number;
      with_fee_url: number;
      banks: number;
      credit_unions: number;
    };

    const feeRow = db
      .prepare(
        `SELECT COUNT(*) as cnt,
                SUM(CASE WHEN ef.review_status = 'flagged' THEN 1 ELSE 0 END) as flagged,
                AVG(ef.extraction_confidence) as avg_conf
         FROM extracted_fees ef
         JOIN crawl_targets ct ON ef.crawl_target_id = ct.id
         ${where}`
      )
      .get(...params) as { cnt: number; flagged: number; avg_conf: number | null };

    const total = row.total || 0;
    const totalFees = feeRow.cnt || 0;
    const flagged = feeRow.flagged || 0;

    return {
      total_institutions: total,
      with_website: row.with_website || 0,
      with_fee_url: row.with_fee_url || 0,
      total_fees: totalFees,
      banks: row.banks || 0,
      credit_unions: row.credit_unions || 0,
      fee_url_pct: total > 0 ? (row.with_fee_url || 0) / total : 0,
      flagged_count: flagged,
      flag_rate: totalFees > 0 ? flagged / totalFees : 0,
      avg_confidence: feeRow.avg_conf ?? 0,
    };
  } finally {
    db.close();
  }
}
