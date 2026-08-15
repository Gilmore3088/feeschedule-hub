import { sql, withTransaction } from "@/lib/data-store/connection";
import { startAgentRun, type StartAgentRunResult } from "@/lib/agents/run-store";
import type {
  AgentRunStepDefinition,
  AgentRunTriggerSource,
} from "@/lib/agents/types";
import { normalizeStateCode, syncStateLaneProfiles } from "./state-lane-memory";

export const STATE_LANE_STEPS: AgentRunStepDefinition[] = [
  {
    key: "enhance",
    agent: "atlas",
    title: "Refresh state source memory and lane health",
  },
  {
    key: "discover",
    agent: "magellan",
    title: "Find and verify missing fee schedule URLs",
  },
  {
    key: "fetch",
    agent: "magellan",
    title: "Fetch state source documents",
  },
  {
    key: "read",
    agent: "rosetta",
    title: "Read PDFs, HTML, and queued OCR candidates",
  },
  {
    key: "extract",
    agent: "knox",
    title: "Extract fee observations from normalized source text",
  },
  {
    key: "classify",
    agent: "darwin",
    title: "Verify state raw fee observations",
  },
  {
    key: "publish",
    agent: "hamilton",
    title: "Publish verified state fee intelligence",
  },
];

export interface StateLaneStartInput {
  stateCode: string;
  triggeredBy: string;
  triggerSource?: AgentRunTriggerSource;
  source?: "atlas.state_lane_scheduler" | "admin.state_lane";
  limit?: number;
}

export interface StateLaneStartResult extends StartAgentRunResult {
  stateCode: string;
  idempotencyKey: string;
}

export interface DueStateLaneScheduleResult {
  selected: number;
  scheduled: number;
  reused: number;
  failed: Array<{ stateCode: string; error: string }>;
  results: Array<{
    stateCode: string;
    runId: number;
    status: string;
    reused: boolean;
    idempotencyKey: string;
  }>;
}

function todayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function boundedLaneLimit(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 2;
  return Math.min(Math.max(Math.floor(parsed), 1), 10);
}

function isMissingStateLaneSchemaError(error: unknown): boolean {
  const message = String(error instanceof Error ? error.message : error).toLowerCase();
  return message.includes("agent_state_lanes") ||
    message.includes("institution_source_profiles") ||
    message.includes("does not exist") ||
    message.includes("undefined_table");
}

async function markLaneScheduled(stateCode: string, runId: number): Promise<void> {
  await sql`
    UPDATE public.agent_state_lanes
       SET last_agent_run_id = ${runId},
           last_run_at = NOW(),
           next_run_after = NOW() + (freshness_target_hours * INTERVAL '1 hour'),
           lease_token = NULL,
           lease_expires_at = NULL,
           updated_at = NOW()
     WHERE state_code = ${stateCode}
  `;
}

async function markLaneLaunchBlocked(stateCode: string, runId: number): Promise<void> {
  await sql`
    UPDATE public.agent_state_lanes
       SET last_agent_run_id = ${runId},
           next_run_after = NOW() + INTERVAL '30 minutes',
           lease_token = NULL,
           lease_expires_at = NULL,
           updated_at = NOW()
     WHERE state_code = ${stateCode}
  `;
}

async function markLaneScheduleFailure(stateCode: string): Promise<void> {
  await sql`
    UPDATE public.agent_state_lanes
       SET failure_count = failure_count + 1,
           next_run_after = NOW() + INTERVAL '1 hour',
           lease_token = NULL,
           lease_expires_at = NULL,
           updated_at = NOW()
     WHERE state_code = ${stateCode}
  `;
}

export async function startStateLaneRun(
  input: StateLaneStartInput,
): Promise<StateLaneStartResult> {
  const stateCode = normalizeStateCode(input.stateCode);
  if (!stateCode) throw new Error("Invalid state code for state lane run");

  await syncStateLaneProfiles(sql, stateCode);
  const idempotencyKey = `atlas:state-lane:${stateCode}:${todayKey()}`;
  const parsedLimit = Number(input.limit);
  const limit = Number.isFinite(parsedLimit)
    ? Math.min(Math.max(Math.floor(parsedLimit), 1), 500)
    : undefined;
  const result = await startAgentRun({
    agent: "atlas",
    kind: "workflow_lane",
    title: `Atlas ${stateCode} state lane`,
    stateCode,
    params: {
      scope: "state",
      state_code: stateCode,
      limit,
      source: input.source ?? "atlas.state_lane_scheduler",
    },
    triggeredBy: input.triggeredBy,
    triggerSource: input.triggerSource ?? "schedule",
    idempotencyKey,
    steps: STATE_LANE_STEPS,
    summary: `Atlas state lane accepted for ${stateCode}. All worker selectors are scoped to institution_sources.state_code.`,
  });
  if (result.run.status === "blocked") {
    await markLaneLaunchBlocked(stateCode, result.run.id);
  } else {
    await markLaneScheduled(stateCode, result.run.id);
  }
  return { ...result, stateCode, idempotencyKey };
}

export async function scheduleDueStateLaneRuns({
  limit = 2,
  triggeredBy = "atlas.scheduler",
}: {
  limit?: number;
  triggeredBy?: string;
} = {}): Promise<DueStateLaneScheduleResult> {
  const safeLimit = boundedLaneLimit(limit);
  await syncStateLaneProfiles(sql);

  let dueRows: Array<{ state_code: string }>;
  try {
    dueRows = await withTransaction(async (tx) => tx<{ state_code: string }[]>`
      WITH due AS (
        SELECT state_code
          FROM public.agent_state_lanes
         WHERE next_run_after <= NOW()
           AND (lease_expires_at IS NULL OR lease_expires_at < NOW())
         ORDER BY priority_score DESC, next_run_after ASC, state_code ASC
         LIMIT ${safeLimit}
         FOR UPDATE SKIP LOCKED
      )
      UPDATE public.agent_state_lanes lane
         SET lease_token = gen_random_uuid(),
             lease_expires_at = NOW() + INTERVAL '15 minutes',
             updated_at = NOW()
        FROM due
       WHERE lane.state_code = due.state_code
      RETURNING lane.state_code
    `);
  } catch (error) {
    if (isMissingStateLaneSchemaError(error)) {
      return {
        selected: 0,
        scheduled: 0,
        reused: 0,
        failed: [],
        results: [],
      };
    }
    throw error;
  }

  const output: DueStateLaneScheduleResult = {
    selected: dueRows.length,
    scheduled: 0,
    reused: 0,
    failed: [],
    results: [],
  };

  for (const row of dueRows) {
    const stateCode = String(row.state_code);
    try {
      const result = await startStateLaneRun({
        stateCode,
        triggeredBy,
        triggerSource: "schedule",
        source: "atlas.state_lane_scheduler",
      });
      output.scheduled += 1;
      if (result.reused) output.reused += 1;
      output.results.push({
        stateCode,
        runId: result.run.id,
        status: result.run.status,
        reused: result.reused,
        idempotencyKey: result.idempotencyKey,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      output.failed.push({ stateCode, error: message });
      await markLaneScheduleFailure(stateCode);
    }
  }

  return output;
}
