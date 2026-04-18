/**
 * Queue jobs to Modal for execution. No local subprocess — runs on Vercel.
 */

import { sql } from "./crawler-db/connection";

const OPS_ENDPOINT_URL =
  process.env.OPS_RUN_URL ||
  "https://gilmore3088--bank-fee-index-workers-ops-run.modal.run";
const MAX_ACTIVE_JOBS = 3;

export interface SpawnResult {
  jobId: number;
  pid: number;
  logPath: string;
}

export async function spawnJob(
  command: string,
  args: string[],
  triggeredBy: string,
  targetId?: number,
): Promise<SpawnResult> {
  try {
    const [row] = await sql`
      SELECT COUNT(*) as cnt FROM ops_jobs WHERE status IN ('running', 'queued')
    `;
    if (row && (row as { cnt: number }).cnt >= MAX_ACTIVE_JOBS) {
      throw new Error(
        `Cannot start job: ${(row as { cnt: number }).cnt} jobs already active (max ${MAX_ACTIVE_JOBS}). Wait for running jobs to complete.`
      );
    }
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("Cannot start job")) throw e;
    // If ops_jobs table doesn't exist yet, allow the job to proceed
  }

  const [insertRow] = await sql`
    INSERT INTO ops_jobs (command, params_json, status, triggered_by, target_id)
    VALUES (${command}, ${JSON.stringify({ args })}, 'queued', ${triggeredBy}, ${targetId ?? null})
    RETURNING id
  `;
  const jobId = Number(insertRow.id);

  // Fire-and-forget to Modal; the Modal function updates ops_jobs as it runs.
  const resp = await fetch(OPS_ENDPOINT_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ command, args, job_id: jobId }),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    await sql`
      UPDATE ops_jobs
         SET status = 'failed',
             error  = ${`modal ${resp.status}: ${body.slice(0, 300)}`}
       WHERE id = ${jobId}
    `;
    throw new Error(`Modal ops_run failed: ${resp.status}`);
  }

  return { jobId, pid: 0, logPath: "" };
}

export async function cancelJob(jobId: number): Promise<{ success: boolean }> {
  await sql`
    UPDATE ops_jobs
       SET status = 'cancelled'
     WHERE id = ${jobId}
       AND status IN ('queued', 'running')
  `;
  return { success: true };
}
