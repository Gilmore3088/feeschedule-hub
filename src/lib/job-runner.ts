/** Canonical execution envelope for admin, agent, API, and scheduled work. */

import { sql } from "./crawler-db/connection";
import { assertAutomationEnabled } from "./automation-control";
import { isAllowedCommand } from "./job-validation";
import { modalInternalSecret } from "./modal-endpoints";

const OPS_ENDPOINT_URL =
  process.env.OPS_RUN_URL ||
  "https://gilmore3088--bank-fee-index-workers-ops-run.modal.run";
const OPS_CANCEL_URL =
  process.env.OPS_CANCEL_URL ||
  "https://gilmore3088--bank-fee-index-workers-ops-cancel.modal.run";
const MAX_ACTIVE_JOBS = 3;

export type AdminAgent = "atlas" | "magellan" | "darwin" | "knox" | "hamilton";

export type AdminJobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancel_requested"
  | "cancelled"
  | "timed_out";

export type JobTriggerSource = "schedule" | "admin" | "api" | "agent";

export interface SpawnResult {
  jobId: number;
  pid: number;
  logPath: string;
  callId?: string;
  reused?: boolean;
}

export interface SpawnJobOptions {
  agent?: AdminAgent;
  triggerSource?: JobTriggerSource;
  idempotencyKey?: string;
  parentJobId?: number;
}

const COMMAND_OWNER: Record<string, AdminAgent> = {
  pipeline: "atlas",
  crawl: "magellan",
  discover: "magellan",
  "rediscover-failed": "magellan",
  "magellan-rescue": "magellan",
  "darwin-drain": "darwin",
  categorize: "darwin",
  validate: "darwin",
  "auto-review": "knox",
  "outlier-detect": "knox",
  "publish-index": "atlas",
};

function inferAgent(command: string): AdminAgent {
  return COMMAND_OWNER[command] ?? "atlas";
}

async function markFailed(jobId: number, reason: string): Promise<void> {
  await sql`
    UPDATE ops_jobs
       SET status = 'failed',
           error_summary = ${reason.slice(0, 1000)},
           completed_at = NOW(),
           updated_at = NOW()
     WHERE id = ${jobId}
       AND status IN ('queued', 'running', 'cancel_requested')
  `;
}

async function markCancelled(jobId: number, reason: string): Promise<void> {
  await sql`
    UPDATE ops_jobs
       SET status = 'cancelled',
           error_summary = ${reason.slice(0, 1000)},
           completed_at = NOW(),
           updated_at = NOW()
     WHERE id = ${jobId}
       AND status IN ('queued', 'running', 'cancel_requested')
  `;
  await sql`
    UPDATE report_jobs
       SET status = 'cancelled',
           error = COALESCE(error, ${reason.slice(0, 500)}),
           completed_at = NOW()
     WHERE ops_job_id = ${jobId}
       AND status IN ('pending', 'assembling', 'rendering', 'cancel_requested')
  `;
}

export async function reconcileStaleJobs(): Promise<number> {
  const rows = await sql`
    UPDATE ops_jobs
       SET status = 'timed_out',
           error_summary = CASE
             WHEN status = 'queued' THEN 'Modal did not acknowledge this job within 15 minutes'
             ELSE 'Job heartbeat expired after three hours'
           END,
           completed_at = NOW(),
           updated_at = NOW()
     WHERE (status = 'queued' AND created_at < NOW() - INTERVAL '15 minutes')
        OR (status IN ('running', 'cancel_requested')
            AND COALESCE(heartbeat_at, started_at, created_at) < NOW() - INTERVAL '3 hours')
     RETURNING id
  `;
  await sql`
    UPDATE report_jobs AS report
       SET status = 'failed',
           error = COALESCE(report.error, 'Remote report job timed out'),
           completed_at = NOW()
      FROM ops_jobs AS ops
     WHERE report.ops_job_id = ops.id
       AND ops.status = 'timed_out'
       AND report.status IN ('pending', 'assembling', 'rendering', 'cancel_requested')
  `;
  return rows.length;
}

export async function spawnJob(
  command: string,
  args: string[],
  triggeredBy: string,
  targetId?: number,
  options: SpawnJobOptions = {},
): Promise<SpawnResult> {
  if (!isAllowedCommand(command)) {
    throw new Error(`Command '${command}' is not available through the admin job service`);
  }

  await assertAutomationEnabled(`${command} job launch`);

  await reconcileStaleJobs().catch((error) => {
    console.error("ops_jobs stale reconciliation failed", error);
  });

  if (options.idempotencyKey) {
    const [active] = await sql`
      SELECT id, modal_call_id
        FROM ops_jobs
       WHERE idempotency_key = ${options.idempotencyKey}
         AND status IN ('queued', 'running', 'cancel_requested')
       ORDER BY created_at DESC
       LIMIT 1
    `;
    if (active) {
      return {
        jobId: Number(active.id),
        pid: 0,
        logPath: "",
        callId: active.modal_call_id ? String(active.modal_call_id) : undefined,
        reused: true,
      };
    }
  }

  const [countRow] = await sql`
    SELECT COUNT(*)::int AS cnt
      FROM ops_jobs
     WHERE status IN ('running', 'queued', 'cancel_requested')
  `;
  if (Number(countRow?.cnt ?? 0) >= MAX_ACTIVE_JOBS) {
    throw new Error(
      `Cannot start job: ${countRow.cnt} jobs already active (max ${MAX_ACTIVE_JOBS})`,
    );
  }

  const agent = options.agent ?? inferAgent(command);
  const triggerSource = options.triggerSource ?? "admin";
  let insertRow: Record<string, unknown>;
  try {
    [insertRow] = await sql`
      INSERT INTO ops_jobs
        (command, params_json, status, triggered_by, target_id, agent_name,
         parent_job_id, trigger_source, idempotency_key, updated_at)
      VALUES
        (${command}, ${JSON.stringify({ args })}, 'queued', ${triggeredBy},
         ${targetId ?? null}, ${agent}, ${options.parentJobId ?? null},
         ${triggerSource}, ${options.idempotencyKey ?? null}, NOW())
      RETURNING id
    `;
  } catch (error) {
    if (options.idempotencyKey && (error as { code?: string }).code === "23505") {
      const [active] = await sql`
        SELECT id, modal_call_id FROM ops_jobs
         WHERE idempotency_key = ${options.idempotencyKey}
           AND status IN ('queued', 'running', 'cancel_requested')
         LIMIT 1
      `;
      if (active) {
        return {
          jobId: Number(active.id),
          pid: 0,
          logPath: "",
          callId: active.modal_call_id ? String(active.modal_call_id) : undefined,
          reused: true,
        };
      }
    }
    throw error;
  }

  const jobId = Number(insertRow.id);
  try {
    await assertAutomationEnabled(`${command} Modal trigger`);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await markCancelled(jobId, reason);
    throw error;
  }
  let internalSecret: string;
  try {
    internalSecret = modalInternalSecret();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await markFailed(jobId, reason);
    throw new Error(reason);
  }
  let resp: Response;
  try {
    resp = await fetch(OPS_ENDPOINT_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ command, args, job_id: jobId, internal_secret: internalSecret }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await markFailed(jobId, `Modal trigger failed: ${reason}`);
    throw new Error(`Modal trigger failed: ${reason}`);
  }

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    const reason = `Modal ${resp.status}: ${body.slice(0, 500)}`;
    if (resp.status === 423) {
      await markCancelled(jobId, reason);
    } else {
      await markFailed(jobId, reason);
    }
    throw new Error(`Modal ops runner failed: ${resp.status}`);
  }

  let payload: { call_id?: unknown };
  try {
    payload = (await resp.json()) as { call_id?: unknown };
  } catch {
    await markFailed(jobId, "Modal trigger returned invalid JSON");
    throw new Error("Modal trigger returned invalid JSON");
  }
  if (typeof payload.call_id !== "string" || payload.call_id.length === 0) {
    await markFailed(jobId, "Modal trigger did not return a call_id");
    throw new Error("Modal trigger did not return a call_id");
  }

  await sql`
    UPDATE ops_jobs
       SET modal_call_id = ${payload.call_id},
           heartbeat_at = NOW(),
           updated_at = NOW()
     WHERE id = ${jobId}
       AND status IN ('queued', 'running')
  `;

  return { jobId, pid: 0, logPath: "", callId: payload.call_id };
}

export async function cancelJob(jobId: number): Promise<{ success: boolean; error?: string }> {
  const [job] = await sql`
    SELECT id, status, modal_call_id
      FROM ops_jobs
     WHERE id = ${jobId}
  `;
  if (!job) return { success: false, error: "Job not found" };
  if (!["queued", "running", "cancel_requested"].includes(String(job.status))) {
    return { success: false, error: `Job is already ${job.status}` };
  }
  if (!job.modal_call_id) {
    return { success: false, error: "Job has not received a Modal call ID yet" };
  }
  let internalSecret: string;
  try {
    internalSecret = modalInternalSecret();
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }

  await sql`
    UPDATE ops_jobs
       SET status = 'cancel_requested',
           cancel_requested_at = NOW(),
           updated_at = NOW()
     WHERE id = ${jobId}
       AND status IN ('queued', 'running')
  `;

  try {
    const resp = await fetch(OPS_CANCEL_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        job_id: jobId,
        call_id: String(job.modal_call_id),
        internal_secret: internalSecret,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      await sql`
        UPDATE ops_jobs
           SET error_summary = ${`Cancellation failed (${resp.status}): ${body.slice(0, 500)}`},
               updated_at = NOW()
         WHERE id = ${jobId}
           AND status = 'cancel_requested'
      `;
      return { success: false, error: `Modal cancellation failed (${resp.status})` };
    }
    const payload = await resp.json().catch(() => null) as { status?: unknown } | null;
    if (payload?.status !== "cancelled") {
      await sql`
        UPDATE ops_jobs
           SET error_summary = 'Modal cancellation returned no terminal confirmation',
               updated_at = NOW()
         WHERE id = ${jobId}
           AND status = 'cancel_requested'
      `;
      return { success: false, error: "Modal did not confirm cancellation" };
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await sql`
      UPDATE ops_jobs
         SET error_summary = ${`Cancellation failed: ${reason}`.slice(0, 1000)},
             updated_at = NOW()
       WHERE id = ${jobId}
         AND status = 'cancel_requested'
    `;
    return { success: false, error: `Modal cancellation failed: ${reason}` };
  }

  const [confirmed] = await sql`
    SELECT status FROM ops_jobs WHERE id = ${jobId}
  `;
  if (confirmed?.status === "cancelled") {
    await sql`
      UPDATE report_jobs
         SET status = 'cancelled', completed_at = NOW()
       WHERE ops_job_id = ${jobId}
         AND status IN ('pending', 'assembling', 'rendering', 'cancel_requested')
    `;
    return { success: true };
  }
  return { success: false, error: `Cancellation ended in unexpected status: ${confirmed?.status ?? "missing"}` };
}

export interface CancelAllJobsResult {
  requested: number;
  cancelled: number;
  failed: Array<{ jobId: number; error: string }>;
}

export async function cancelAllActiveJobs(): Promise<CancelAllJobsResult> {
  const activeJobs = await sql`
    SELECT id, modal_call_id
      FROM ops_jobs
     WHERE status IN ('queued', 'running', 'cancel_requested')
     ORDER BY created_at ASC
  `;
  const result: CancelAllJobsResult = {
    requested: activeJobs.length,
    cancelled: 0,
    failed: [],
  };

  for (const job of activeJobs) {
    const jobId = Number(job.id);
    if (!job.modal_call_id) {
      await markCancelled(jobId, "Cancelled by the global emergency stop before Modal launch");
      result.cancelled += 1;
      continue;
    }
    const cancellation = await cancelJob(jobId);
    if (cancellation.success) {
      result.cancelled += 1;
    } else {
      result.failed.push({ jobId, error: cancellation.error ?? "Unknown cancellation failure" });
    }
  }
  return result;
}
