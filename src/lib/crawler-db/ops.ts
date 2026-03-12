import { getDb } from "./connection";

export interface OpsJob {
  id: number;
  command: string;
  params_json: string;
  status: string;
  triggered_by: string;
  target_id: number | null;
  crawl_run_id: number | null;
  pid: number | null;
  log_path: string | null;
  started_at: string | null;
  completed_at: string | null;
  exit_code: number | null;
  stdout_tail: string | null;
  error_summary: string | null;
  result_summary: string | null;
  created_at: string;
}

export interface OpsJobSummary {
  total: number;
  running: number;
  queued: number;
  completed: number;
  failed: number;
  cancelled: number;
}

export function getOpsJobs(
  limit = 50,
  offset = 0,
  status?: string,
): { jobs: OpsJob[]; total: number } {
  const db = getDb();
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (status) {
    conditions.push("status = ?");
    params.push(status);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const { cnt } = db
    .prepare(`SELECT COUNT(*) as cnt FROM ops_jobs ${where}`)
    .get(...params) as { cnt: number };

  const jobs = db
    .prepare(
      `SELECT * FROM ops_jobs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset) as OpsJob[];

  return { jobs, total: cnt };
}

export function getOpsJob(id: number): OpsJob | null {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM ops_jobs WHERE id = ?")
    .get(id) as OpsJob | undefined;
  return row ?? null;
}

export function getOpsJobSummary(): OpsJobSummary {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT status, COUNT(*) as cnt FROM ops_jobs GROUP BY status`,
    )
    .all() as { status: string; cnt: number }[];

  const summary: OpsJobSummary = {
    total: 0,
    running: 0,
    queued: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
  };

  for (const row of rows) {
    summary.total += row.cnt;
    if (row.status in summary) {
      summary[row.status as keyof Omit<OpsJobSummary, "total">] = row.cnt;
    }
  }

  return summary;
}

export function getActiveJobs(): OpsJob[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM ops_jobs WHERE status IN ('running', 'queued') ORDER BY created_at DESC`,
    )
    .all() as OpsJob[];
}

export function getRecentJobs(limit = 10): OpsJob[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM ops_jobs ORDER BY created_at DESC LIMIT ?`,
    )
    .all(limit) as OpsJob[];
}
