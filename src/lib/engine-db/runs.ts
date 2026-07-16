/**
 * Run timeline — from `pipeline_runs` (always terminal; never the orphaned
 * `running` rows the legacy crawl_runs freshness view suffered from).
 */

import { sql } from "@/lib/crawler-db/connection";

export interface PipelineRun {
  id: number;
  kind: string; // state | national | worker-pool
  stateCode: string | null;
  cycle: number | null;
  status: "running" | "completed" | "failed";
  stats: Record<string, unknown>;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
  durationSecs: number | null;
}

export async function getRecentRuns(limit = 40): Promise<PipelineRun[]> {
  try {
    const rows = await sql<
      {
        id: string;
        kind: string;
        state_code: string | null;
        cycle: string | null;
        status: string;
        stats: Record<string, unknown> | null;
        error: string | null;
        started_at: string;
        finished_at: string | null;
        dur: string | null;
      }[]
    >`
      SELECT id, kind, state_code, cycle, status, stats, error, started_at, finished_at,
             EXTRACT(EPOCH FROM (COALESCE(finished_at, NOW()) - started_at)) AS dur
        FROM pipeline_runs
       ORDER BY started_at DESC
       LIMIT ${limit}
    `;
    return rows.map((r) => ({
      id: Number(r.id),
      kind: r.kind,
      stateCode: r.state_code,
      cycle: r.cycle == null ? null : Number(r.cycle),
      status: r.status as PipelineRun["status"],
      stats: r.stats ?? {},
      error: r.error,
      startedAt: r.started_at,
      finishedAt: r.finished_at,
      durationSecs: r.dur == null ? null : Math.round(Number(r.dur)),
    }));
  } catch {
    return [];
  }
}

/** Freshness: is any run wedged in `running` past a threshold? (dashboards read
 * this instead of crawl_runs, so they can't show a dead run as healthy). */
export async function getStuckRunCount(thresholdSecs = 7200): Promise<number> {
  try {
    const [row] = await sql<{ n: string }[]>`
      SELECT count(*) AS n FROM pipeline_runs
       WHERE status='running' AND heartbeat_at < NOW() - (${thresholdSecs} * INTERVAL '1 second')
    `;
    return Number(row?.n ?? 0);
  } catch {
    return 0;
  }
}
