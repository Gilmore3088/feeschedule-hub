import { sql } from "./connection";

export interface OpsJob {
  id: number;
  command: string;
  params_json: unknown;
  status: string;
  triggered_by: string;
  target_id: number | null;
  crawl_run_id: number | null;
  pid: number | null;
  log_path: string | null;
  started_at: string | Date | null;
  completed_at: string | Date | null;
  exit_code: number | null;
  stdout_tail: string | null;
  error_summary: string | null;
  result_summary: string | null;
  created_at: string | Date;
}

export interface OpsJobSummary {
  total: number;
  running: number;
  queued: number;
  completed: number;
  failed: number;
  cancelled: number;
}

export async function getOpsJobs(
  limit = 50,
  offset = 0,
  status?: string,
): Promise<{ jobs: OpsJob[]; total: number }> {
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (status) {
    conditions.push("status = $1");
    params.push(status);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const [countRow] = await sql.unsafe(
    `SELECT COUNT(*) as cnt FROM ops_jobs ${where}`,
    params,
  );

  const jobs = await sql.unsafe(
    `SELECT * FROM ops_jobs ${where} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset],
  ) as OpsJob[];

  return { jobs, total: Number(countRow.cnt) };
}

export async function getOpsJob(id: number): Promise<OpsJob | null> {
  const [row] = await sql`SELECT * FROM ops_jobs WHERE id = ${id}`;
  return (row as OpsJob) ?? null;
}

export async function getOpsJobSummary(): Promise<OpsJobSummary> {
  const rows = await sql`
    SELECT status, COUNT(*) as cnt FROM ops_jobs GROUP BY status
  ` as { status: string; cnt: number }[];

  const summary: OpsJobSummary = {
    total: 0,
    running: 0,
    queued: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
  };

  for (const row of rows) {
    const cnt = Number(row.cnt);
    summary.total += cnt;
    if (row.status in summary) {
      summary[row.status as keyof Omit<OpsJobSummary, "total">] = cnt;
    }
  }

  return summary;
}

export async function getActiveJobs(): Promise<OpsJob[]> {
  return await sql`
    SELECT * FROM ops_jobs WHERE status IN ('running', 'queued') ORDER BY created_at DESC
  ` as OpsJob[];
}

export async function getRecentJobs(limit = 10): Promise<OpsJob[]> {
  return await sql`
    SELECT * FROM ops_jobs ORDER BY created_at DESC LIMIT ${limit}
  ` as OpsJob[];
}
