import { sql } from "./connection";

export interface PipelineRun {
  id: number;
  status: string;
  last_completed_phase: number | null;
  last_completed_job: string | null;
  config_json: unknown;
  started_at: string;
  completed_at: string | null;
  error_msg: string | null;
  inst_count: number | null;
  summary_json: unknown;
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

export async function getPipelineRuns(limit = 10): Promise<PipelineRun[]> {
  try {
    return await sql`
      SELECT * FROM pipeline_runs ORDER BY started_at DESC LIMIT ${limit}
    ` as PipelineRun[];
  } catch {
    return [];
  }
}

export async function getActivePipelineRun(): Promise<PipelineRun | null> {
  try {
    const [row] = await sql`
      SELECT * FROM pipeline_runs WHERE status = 'running' ORDER BY started_at DESC LIMIT 1
    `;
    return (row as PipelineRun) ?? null;
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

export async function getDiscoveryMethodStats(): Promise<DiscoveryMethodStats[]> {
  try {
    const rows = await sql`
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
    ` as { discovery_method: string; discovered: number; crawl_success: number; prescreen_fail: number; http_error: number }[];

    return rows.map((r) => {
      const discovered = Number(r.discovered);
      const crawl_success = Number(r.crawl_success);
      const prescreen_fail = Number(r.prescreen_fail);
      const http_error = Number(r.http_error);
      const total = crawl_success + prescreen_fail + http_error;
      return {
        discovery_method: r.discovery_method,
        discovered,
        crawl_success,
        prescreen_fail,
        http_error,
        success_rate: total > 0 ? Math.round((crawl_success / total) * 100) : 0,
      };
    });
  } catch {
    return [];
  }
}

export async function getIndexCacheStats(): Promise<{
  categories: number;
  computed_at: string | null;
  spotlight: IndexCacheEntry[];
}> {
  try {
    const [count] = await sql`
      SELECT COUNT(*) as cnt FROM fee_index_cache
    `;

    const [computed] = await sql`
      SELECT MAX(computed_at) as latest FROM fee_index_cache
    `;

    const spotlightCats = [
      "monthly_maintenance", "overdraft", "nsf",
      "atm_non_network", "card_foreign_txn", "wire_domestic_outgoing",
    ];
    const spotlight = await sql`
      SELECT * FROM fee_index_cache
      WHERE fee_category IN ${sql(spotlightCats)}
      ORDER BY institution_count DESC
    ` as IndexCacheEntry[];

    return {
      categories: Number(count.cnt),
      computed_at: computed.latest,
      spotlight,
    };
  } catch {
    return { categories: 0, computed_at: null, spotlight: [] };
  }
}
