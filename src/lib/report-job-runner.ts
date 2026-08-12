import { sql, withTransaction } from "./crawler-db/connection";
import { assertAutomationEnabled } from "./automation-control";
import { modalInternalSecret } from "./modal-endpoints";
import type { ReportType } from "./report-engine/types";

export async function triggerReportJob(
  reportJobId: string,
  reportType: ReportType,
  params: Record<string, unknown>,
  triggeredBy: string,
  triggerSource: "admin" | "api" | "schedule" = "admin",
): Promise<{ success: boolean; opsJobId?: number; callId?: string; error?: string }> {
  try {
    await assertAutomationEnabled("Hamilton report generation");
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
  const modalUrl = process.env.MODAL_REPORT_URL;
  const [opsJob] = await sql`
    INSERT INTO ops_jobs
      (command, params_json, status, triggered_by, agent_name, trigger_source,
       idempotency_key, updated_at)
    VALUES
      ('generate-report', ${JSON.stringify({ report_job_id: reportJobId, report_type: reportType })},
       'queued', ${triggeredBy}, 'hamilton', ${triggerSource},
       ${`report:${reportJobId}`}, NOW())
    RETURNING id
  `;
  const opsJobId = Number(opsJob.id);
  await sql`
    UPDATE report_jobs SET ops_job_id = ${opsJobId} WHERE id = ${reportJobId}
  `;

  const markFailed = async (reason: string) => {
    await withTransaction(async (tx) => {
      await tx`
        UPDATE ops_jobs
           SET status = 'failed', error_summary = ${reason.slice(0, 1000)},
               completed_at = NOW(), updated_at = NOW()
         WHERE id = ${opsJobId}
      `;
      await tx`
        UPDATE report_jobs
           SET status = 'failed', error = ${reason.slice(0, 500)}, completed_at = NOW()
         WHERE id = ${reportJobId}
      `;
    });
  };

  const markCancelled = async (reason: string) => {
    await withTransaction(async (tx) => {
      await tx`
        UPDATE ops_jobs
           SET status = 'cancelled', error_summary = ${reason.slice(0, 1000)},
               completed_at = NOW(), updated_at = NOW()
         WHERE id = ${opsJobId}
      `;
      await tx`
        UPDATE report_jobs
           SET status = 'cancelled', error = ${reason.slice(0, 500)}, completed_at = NOW()
         WHERE id = ${reportJobId}
      `;
    });
  };

  try {
    await assertAutomationEnabled("Hamilton report Modal trigger");
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await markCancelled(reason);
    return { success: false, opsJobId, error: reason };
  }

  if (!modalUrl) {
    const reason = "Report worker not configured (MODAL_REPORT_URL missing)";
    await markFailed(reason);
    return { success: false, opsJobId, error: reason };
  }
  let internalSecret: string;
  try {
    internalSecret = modalInternalSecret();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await markFailed(reason);
    return { success: false, opsJobId, error: reason };
  }

  let response: Response;
  try {
    response = await fetch(modalUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        job_id: reportJobId,
        report_type: reportType,
        params,
        internal_secret: internalSecret,
      }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    const reason = `Modal trigger failed: ${error instanceof Error ? error.message : String(error)}`;
    await markFailed(reason);
    return { success: false, opsJobId, error: reason };
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const reason = `Modal trigger failed (${response.status}): ${body.slice(0, 300)}`;
    if (response.status === 423) {
      await markCancelled(reason);
    } else {
      await markFailed(reason);
    }
    return { success: false, opsJobId, error: reason };
  }

  let payload: { call_id?: unknown };
  try {
    payload = (await response.json()) as { call_id?: unknown };
  } catch {
    const reason = "Modal report trigger returned invalid JSON";
    await markFailed(reason);
    return { success: false, opsJobId, error: reason };
  }
  if (typeof payload.call_id !== "string" || payload.call_id.length === 0) {
    const reason = "Modal report trigger did not return a call_id";
    await markFailed(reason);
    return { success: false, opsJobId, error: reason };
  }
  const callId = payload.call_id;

  await withTransaction(async (tx) => {
    await tx`
      UPDATE ops_jobs
         SET modal_call_id = ${callId}, heartbeat_at = NOW(), updated_at = NOW()
       WHERE id = ${opsJobId}
    `;
    await tx`
      UPDATE report_jobs SET modal_call_id = ${callId} WHERE id = ${reportJobId}
    `;
  });
  return { success: true, opsJobId, callId };
}
