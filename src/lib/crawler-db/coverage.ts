import { getDb } from "./connection";

export interface CoverageStats {
  total_institutions: number;
  with_website: number;
  with_fee_url: number;
  with_fees: number;
  coverage_pct: number;
  by_charter: { charter_type: string; total: number; with_fees: number }[];
  by_tier: { tier: string; total: number; with_fees: number }[];
}

export interface CoverageHeatmapCell {
  tier: string;
  district: number;
  total: number;
  with_fees: number;
  coverage_pct: number;
}

export interface TriageEntry {
  id: number;
  institution_name: string;
  charter_type: string;
  state_code: string | null;
  asset_size: number | null;
  asset_size_tier: string | null;
  fed_district: number | null;
  fee_schedule_url: string | null;
  document_type: string | null;
  last_crawl_at: string | null;
  consecutive_failures: number;
  failure_reason: string | null;
  failure_reason_note: string | null;
  fee_count: number;
}

export interface FailureReasonBreakdown {
  failure_reason: string | null;
  count: number;
}

export interface PipelineHealth {
  never_crawled: number;
  crawl_ok_no_fees: number;
  crawl_failing: number;
  no_fee_url: number;
  with_fee_url_no_fees: number;
}

export function getCoverageStats(opts?: {
  charterType?: string;
  tier?: string;
  district?: string;
}): CoverageStats {
  const db = getDb();
  try {
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (opts?.charterType) {
      conditions.push("ct.charter_type = ?");
      params.push(opts.charterType);
    }
    if (opts?.tier) {
      conditions.push("ct.asset_size_tier = ?");
      params.push(opts.tier);
    }
    if (opts?.district) {
      conditions.push("ct.fed_district = ?");
      params.push(Number(opts.district));
    }

    const where = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";

    const totals = db
      .prepare(
        `SELECT
           COUNT(*) as total,
           SUM(CASE WHEN ct.website_url IS NOT NULL THEN 1 ELSE 0 END) as with_website,
           SUM(CASE WHEN ct.fee_schedule_url IS NOT NULL THEN 1 ELSE 0 END) as with_fee_url
         FROM crawl_targets ct
         ${where}`
      )
      .get(...params) as { total: number; with_website: number; with_fee_url: number };

    const withFees = db
      .prepare(
        `SELECT COUNT(DISTINCT ct.id) as cnt
         FROM crawl_targets ct
         JOIN extracted_fees ef ON ef.crawl_target_id = ct.id
         ${where}`
      )
      .get(...params) as { cnt: number };

    const byCharter = db
      .prepare(
        `SELECT ct.charter_type,
                COUNT(*) as total,
                COUNT(DISTINCT CASE WHEN ef.id IS NOT NULL THEN ct.id END) as with_fees
         FROM crawl_targets ct
         LEFT JOIN extracted_fees ef ON ef.crawl_target_id = ct.id
         ${where}
         GROUP BY ct.charter_type`
      )
      .all(...params) as { charter_type: string; total: number; with_fees: number }[];

    const byTier = db
      .prepare(
        `SELECT ct.asset_size_tier as tier,
                COUNT(*) as total,
                COUNT(DISTINCT CASE WHEN ef.id IS NOT NULL THEN ct.id END) as with_fees
         FROM crawl_targets ct
         LEFT JOIN extracted_fees ef ON ef.crawl_target_id = ct.id
         ${where.length > 0 ? where + " AND" : "WHERE"} ct.asset_size_tier IS NOT NULL
         GROUP BY ct.asset_size_tier`
      )
      .all(...params) as { tier: string; total: number; with_fees: number }[];

    return {
      total_institutions: totals.total,
      with_website: totals.with_website,
      with_fee_url: totals.with_fee_url,
      with_fees: withFees.cnt,
      coverage_pct: totals.total > 0 ? withFees.cnt / totals.total : 0,
      by_charter: byCharter,
      by_tier: byTier,
    };
  } finally {
    db.close();
  }
}

export function getCoverageHeatmap(opts?: {
  charterType?: string;
}): CoverageHeatmapCell[] {
  const db = getDb();
  try {
    const conditions = [
      "ct.asset_size_tier IS NOT NULL",
      "ct.fed_district IS NOT NULL",
    ];
    const params: (string | number)[] = [];

    if (opts?.charterType) {
      conditions.push("ct.charter_type = ?");
      params.push(opts.charterType);
    }

    const where = "WHERE " + conditions.join(" AND ");

    return db
      .prepare(
        `SELECT ct.asset_size_tier as tier,
                ct.fed_district as district,
                COUNT(*) as total,
                COUNT(DISTINCT CASE WHEN ef.id IS NOT NULL THEN ct.id END) as with_fees,
                ROUND(CAST(COUNT(DISTINCT CASE WHEN ef.id IS NOT NULL THEN ct.id END) AS REAL) / COUNT(*), 4) as coverage_pct
         FROM crawl_targets ct
         LEFT JOIN extracted_fees ef ON ef.crawl_target_id = ct.id
         ${where}
         GROUP BY ct.asset_size_tier, ct.fed_district
         ORDER BY ct.fed_district, ct.asset_size_tier`
      )
      .all(...params) as CoverageHeatmapCell[];
  } finally {
    db.close();
  }
}

export function getTriageQueue(opts?: {
  charterType?: string;
  tier?: string;
  district?: string;
  failureReason?: string;
  limit?: number;
  offset?: number;
}): { entries: TriageEntry[]; total: number } {
  const db = getDb();
  try {
    const conditions = [
      "ct.fee_schedule_url IS NOT NULL",
      "fee_count = 0",
    ];
    const params: (string | number)[] = [];

    if (opts?.charterType) {
      conditions.push("ct.charter_type = ?");
      params.push(opts.charterType);
    }
    if (opts?.tier) {
      conditions.push("ct.asset_size_tier = ?");
      params.push(opts.tier);
    }
    if (opts?.district) {
      conditions.push("ct.fed_district = ?");
      params.push(Number(opts.district));
    }
    if (opts?.failureReason) {
      if (opts.failureReason === "unclassified") {
        conditions.push("ct.failure_reason IS NULL");
      } else {
        conditions.push("ct.failure_reason = ?");
        params.push(opts.failureReason);
      }
    }

    const limit = opts?.limit ?? 50;
    const offset = opts?.offset ?? 0;

    // Use subquery so we can filter on fee_count
    const having = "HAVING fee_count = 0";
    const whereNoHaving = conditions.filter((c) => c !== "fee_count = 0");
    const whereSql = whereNoHaving.length > 0 ? "WHERE " + whereNoHaving.join(" AND ") : "";

    const { cnt } = db
      .prepare(
        `SELECT COUNT(*) as cnt FROM (
           SELECT ct.id, COUNT(ef.id) as fee_count
           FROM crawl_targets ct
           LEFT JOIN extracted_fees ef ON ef.crawl_target_id = ct.id
           ${whereSql}
           GROUP BY ct.id
           ${having}
         )`
      )
      .get(...params) as { cnt: number };

    const entries = db
      .prepare(
        `SELECT ct.id, ct.institution_name, ct.charter_type, ct.state_code,
                ct.asset_size, ct.asset_size_tier, ct.fed_district,
                ct.fee_schedule_url, ct.document_type,
                ct.last_crawl_at, ct.consecutive_failures,
                ct.failure_reason, ct.failure_reason_note,
                COUNT(ef.id) as fee_count
         FROM crawl_targets ct
         LEFT JOIN extracted_fees ef ON ef.crawl_target_id = ct.id
         ${whereSql}
         GROUP BY ct.id
         ${having}
         ORDER BY ct.asset_size DESC NULLS LAST
         LIMIT ? OFFSET ?`
      )
      .all(...params, limit, offset) as TriageEntry[];

    return { entries, total: cnt };
  } finally {
    db.close();
  }
}

export function getFailureReasonBreakdown(opts?: {
  charterType?: string;
  tier?: string;
  district?: string;
}): FailureReasonBreakdown[] {
  const db = getDb();
  try {
    const conditions = ["ct.fee_schedule_url IS NOT NULL"];
    const params: (string | number)[] = [];

    if (opts?.charterType) {
      conditions.push("ct.charter_type = ?");
      params.push(opts.charterType);
    }
    if (opts?.tier) {
      conditions.push("ct.asset_size_tier = ?");
      params.push(opts.tier);
    }
    if (opts?.district) {
      conditions.push("ct.fed_district = ?");
      params.push(Number(opts.district));
    }

    const where = "WHERE " + conditions.join(" AND ");

    // Only for institutions with URL but no fees
    return db
      .prepare(
        `SELECT failure_reason, COUNT(*) as count FROM (
           SELECT ct.failure_reason
           FROM crawl_targets ct
           LEFT JOIN extracted_fees ef ON ef.crawl_target_id = ct.id
           ${where}
           GROUP BY ct.id
           HAVING COUNT(ef.id) = 0
         )
         GROUP BY failure_reason
         ORDER BY count DESC`
      )
      .all(...params) as FailureReasonBreakdown[];
  } finally {
    db.close();
  }
}

export function getPipelineHealth(opts?: {
  charterType?: string;
  tier?: string;
  district?: string;
}): PipelineHealth {
  const db = getDb();
  try {
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (opts?.charterType) {
      conditions.push("ct.charter_type = ?");
      params.push(opts.charterType);
    }
    if (opts?.tier) {
      conditions.push("ct.asset_size_tier = ?");
      params.push(opts.tier);
    }
    if (opts?.district) {
      conditions.push("ct.fed_district = ?");
      params.push(Number(opts.district));
    }

    const where = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";

    const result = db
      .prepare(
        `SELECT
           SUM(CASE WHEN ct.last_crawl_at IS NULL AND ct.fee_schedule_url IS NOT NULL THEN 1 ELSE 0 END) as never_crawled,
           SUM(CASE WHEN ct.last_success_at IS NOT NULL AND ct.consecutive_failures = 0
                     AND NOT EXISTS (SELECT 1 FROM extracted_fees ef WHERE ef.crawl_target_id = ct.id)
                     THEN 1 ELSE 0 END) as crawl_ok_no_fees,
           SUM(CASE WHEN ct.consecutive_failures > 0 THEN 1 ELSE 0 END) as crawl_failing,
           SUM(CASE WHEN ct.fee_schedule_url IS NULL AND ct.website_url IS NOT NULL THEN 1 ELSE 0 END) as no_fee_url,
           SUM(CASE WHEN ct.fee_schedule_url IS NOT NULL
                     AND NOT EXISTS (SELECT 1 FROM extracted_fees ef WHERE ef.crawl_target_id = ct.id)
                     THEN 1 ELSE 0 END) as with_fee_url_no_fees
         FROM crawl_targets ct
         ${where}`
      )
      .get(...params) as PipelineHealth;

    return {
      never_crawled: result.never_crawled ?? 0,
      crawl_ok_no_fees: result.crawl_ok_no_fees ?? 0,
      crawl_failing: result.crawl_failing ?? 0,
      no_fee_url: result.no_fee_url ?? 0,
      with_fee_url_no_fees: result.with_fee_url_no_fees ?? 0,
    };
  } finally {
    db.close();
  }
}
