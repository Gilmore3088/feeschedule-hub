import { sql, withTransaction } from "./data-store/connection";

export interface AutomationControlState {
  enabled: boolean;
  reason: string | null;
  changedBy: string;
  changedAt: string;
  revision: number;
}

export class EmergencyStopActiveError extends Error {
  readonly control: AutomationControlState;

  constructor(control: AutomationControlState, context: string) {
    super(`Emergency stop is active; ${context} is blocked${control.reason ? `: ${control.reason}` : ""}`);
    this.name = "EmergencyStopActiveError";
    this.control = control;
  }
}

function mapControl(row: Record<string, unknown>): AutomationControlState {
  return {
    enabled: Boolean(row.enabled),
    reason: row.reason ? String(row.reason) : null,
    changedBy: String(row.changed_by ?? "system"),
    changedAt: new Date(row.changed_at as string | Date).toISOString(),
    revision: Number(row.revision ?? 1),
  };
}

export async function getAutomationControl(): Promise<AutomationControlState> {
  const [row] = await sql`
    SELECT enabled, reason, changed_by, changed_at, revision
      FROM automation_control
     WHERE control_key = 'global'
  `;
  if (!row) {
    throw new Error("Global automation control is not configured");
  }
  return mapControl(row);
}

export async function assertAutomationEnabled(context: string): Promise<AutomationControlState> {
  const control = await getAutomationControl();
  if (!control.enabled) {
    throw new EmergencyStopActiveError(control, context);
  }
  return control;
}

export async function engageEmergencyStop(
  actor: string,
  reason: string,
): Promise<AutomationControlState> {
  const normalizedReason = reason.trim().slice(0, 500)
    || "Emergency stop engaged by an administrator";

  return withTransaction(async (tx) => {
    const [active] = await tx`
      SELECT COUNT(*)::int AS count
        FROM agent_runs
       WHERE run_kind IN ('workflow', 'workflow_lane', 'report', 'manual_repair', 'dry_run')
         AND status IN ('queued', 'running', 'cancel_requested')
    `;
    const [row] = await tx`
      UPDATE automation_control
         SET enabled = FALSE,
             reason = ${normalizedReason},
             changed_by = ${actor},
             changed_at = NOW(),
             revision = revision + 1
       WHERE control_key = 'global'
       RETURNING enabled, reason, changed_by, changed_at, revision
    `;
    await tx`
      INSERT INTO automation_control_audit
        (action, reason, actor, active_job_count)
      VALUES
        ('emergency_stop', ${normalizedReason}, ${actor}, ${Number(active?.count ?? 0)})
    `;
    if (!row) throw new Error("Global automation control is not configured");
    return mapControl(row);
  });
}

async function assertNoRecentProviderCreditFailure(): Promise<void> {
  const [failure] = await sql`
    SELECT provider, model, agent_name, operation, created_at
      FROM ai_api_usage_events
     WHERE status = 'failed'
       AND error_summary ILIKE '%credit balance is too low%'
       AND created_at >= NOW() - INTERVAL '24 hours'
     ORDER BY created_at DESC
     LIMIT 1
  `;
  if (!failure) return;
  const provider = String(failure.provider ?? "provider");
  const agent = String(failure.agent_name ?? "unknown agent");
  const operation = String(failure.operation ?? "unknown operation");
  const seenAt = new Date(failure.created_at as string | Date).toISOString();
  throw new Error(
    `Cannot resume automation: latest ${provider} credit-balance failure was ${seenAt} on ${agent}.${operation}. Fix provider billing or move this route off the failing provider before resuming.`,
  );
}

export async function resumeAutomation(
  actor: string,
  reason: string,
): Promise<AutomationControlState> {
  await assertNoRecentProviderCreditFailure();

  const normalizedReason = reason.trim().slice(0, 500)
    || "Automation resumed after operator review";

  return withTransaction(async (tx) => {
    const [row] = await tx`
      UPDATE automation_control
         SET enabled = TRUE,
             reason = ${normalizedReason},
             changed_by = ${actor},
             changed_at = NOW(),
             revision = revision + 1
       WHERE control_key = 'global'
       RETURNING enabled, reason, changed_by, changed_at, revision
    `;
    await tx`
      INSERT INTO automation_control_audit
        (action, reason, actor, active_job_count)
      VALUES
        ('resume', ${normalizedReason}, ${actor}, 0)
    `;
    if (!row) throw new Error("Global automation control is not configured");
    return mapControl(row);
  });
}

export async function recordEmergencyStopOutcome(
  actor: string,
  outcome: {
    requested: number;
    cancelled: number;
    failed: Array<{ runId: number; error: string }>;
  },
): Promise<void> {
  await sql`
    UPDATE automation_control_audit
       SET metadata = ${JSON.stringify({
         cancellation_requested: outcome.requested,
         cancellation_confirmed: outcome.cancelled,
         cancellation_failures: outcome.failed,
       })}::JSONB
     WHERE id = (
       SELECT id
         FROM automation_control_audit
        WHERE action = 'emergency_stop'
          AND actor = ${actor}
        ORDER BY created_at DESC
        LIMIT 1
     )
  `;
}
