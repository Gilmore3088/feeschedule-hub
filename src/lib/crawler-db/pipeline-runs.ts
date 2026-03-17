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
