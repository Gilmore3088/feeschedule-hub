import { getDb } from "./connection";

export interface PipelineRun {
  id: number;
  status: string;
  last_completed_phase: number | null;
  last_completed_job: string | null;
  config_json: string | null;
  started_at: string;
  completed_at: string | null;
  error_msg: string | null;
  inst_count: number | null;
  summary_json: string | null;
}

export interface IndexCacheEntry {
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
  computed_at: string | null;
}

export function getPipelineRuns(limit = 10): PipelineRun[] {
  const db = getDb();
  try {
    return db
      .prepare("SELECT * FROM pipeline_runs ORDER BY started_at DESC LIMIT ?")
      .all(limit) as PipelineRun[];
  } catch {
    return [];
  }
}

export function getActivePipelineRun(): PipelineRun | null {
  const db = getDb();
  try {
    const row = db
      .prepare("SELECT * FROM pipeline_runs WHERE status = 'running' ORDER BY started_at DESC LIMIT 1")
      .get() as PipelineRun | undefined;
    return row ?? null;
  } catch {
    return null;
  }
}

export interface DiscoveryMethodStats {
  discovery_method: string;
  discovered: number;
  crawl_success: number;
  prescreen_fail: number;
  http_error: number;
  success_rate: number;
}

export function getDiscoveryMethodStats(): DiscoveryMethodStats[] {
  const db = getDb();
  try {
    const rows = db
      .prepare(`
        SELECT
          dc.discovery_method,
          COUNT(DISTINCT dc.crawl_target_id) as discovered,
          COUNT(DISTINCT CASE WHEN cr.status = 'success' THEN cr.crawl_target_id END) as crawl_success,
          COUNT(DISTINCT CASE WHEN cr.error_message LIKE '%Pre-LLM%' THEN cr.crawl_target_id END) as prescreen_fail,
          COUNT(DISTINCT CASE WHEN cr.error_message LIKE '%403%' OR cr.error_message LIKE '%404%' THEN cr.crawl_target_id END) as http_error
        FROM discovery_cache dc
        JOIN crawl_targets ct ON dc.crawl_target_id = ct.id
        LEFT JOIN crawl_results cr ON cr.crawl_target_id = ct.id
        WHERE dc.result = 'found'
        GROUP BY dc.discovery_method
        ORDER BY discovered DESC
      `)
      .all() as { discovery_method: string; discovered: number; crawl_success: number; prescreen_fail: number; http_error: number }[];

    return rows.map((r) => {
      const total = r.crawl_success + r.prescreen_fail + r.http_error;
      return {
        ...r,
        success_rate: total > 0 ? Math.round((r.crawl_success / total) * 100) : 0,
      };
    });
  } catch {
    return [];
  }
}

export function getIndexCacheStats(): {
  categories: number;
  computed_at: string | null;
  spotlight: IndexCacheEntry[];
} {
  const db = getDb();
  try {
    const count = db
      .prepare("SELECT COUNT(*) as cnt FROM fee_index_cache")
      .get() as { cnt: number };

    const computed = db
      .prepare("SELECT MAX(computed_at) as latest FROM fee_index_cache")
      .get() as { latest: string | null };

    const spotlightCats = [
      "monthly_maintenance", "overdraft", "nsf",
      "atm_non_network", "card_foreign_txn", "wire_domestic_outgoing",
    ];
    const placeholders = spotlightCats.map(() => "?").join(",");
    const spotlight = db
      .prepare(
        `SELECT * FROM fee_index_cache WHERE fee_category IN (${placeholders}) ORDER BY institution_count DESC`
      )
      .all(...spotlightCats) as IndexCacheEntry[];

    return {
      categories: count.cnt,
      computed_at: computed.latest,
      spotlight,
    };
  } catch {
    return { categories: 0, computed_at: null, spotlight: [] };
  }
}
