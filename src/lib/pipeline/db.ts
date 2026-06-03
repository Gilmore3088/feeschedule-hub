/**
 * Control-plane data layer for the pipeline rebuild.
 *
 * All reads/writes against pipeline_runs + pipeline_steps live here so the
 * runner and the control room share one typed surface. Template-literal SQL via
 * the shared postgres.js `sql` client, matching the rest of the codebase.
 *
 * Lives under src/lib/pipeline/ (not crawler-db/) so the rebuild is a clean,
 * self-contained module. The legacy crawler-db/pipeline-runs.ts reads the old
 * executor-era table and is orphaned; it is removed in Phase 5 demolition.
 */

import { sql } from "@/lib/crawler-db/connection";

export type RunStatus = "queued" | "running" | "succeeded" | "failed" | "canceled";
export type StepStatus = "pending" | "running" | "succeeded" | "failed" | "skipped";
export type TriggerSource = "manual" | "cron" | "api";

export interface PipelineRunRow {
  id: number;
  trigger_source: TriggerSource;
  triggered_by: string;
  status: RunStatus;
  params_json: Record<string, unknown>;
  workflow_run_id: string | null;
  stages_total: number;
  stages_done: number;
  started_at: Date | null;
  finished_at: Date | null;
  error: string | null;
  created_at: Date;
}

export interface PipelineStepRow {
  id: number;
  run_id: number;
  stage: string;
  seq: number;
  status: StepStatus;
  rows_in: number | null;
  rows_out: number | null;
  cost_cents: number;
  started_at: Date | null;
  finished_at: Date | null;
  error: string | null;
  notes_json: Record<string, unknown> | null;
}

export interface StepResult {
  rowsIn?: number;
  rowsOut?: number;
  costCents?: number;
  error?: string;
  notes?: Record<string, unknown>;
}

export async function createRun(
  triggerSource: TriggerSource,
  triggeredBy: string,
  stages: string[],
  params: Record<string, unknown>,
): Promise<number> {
  const rows = (await sql`
    INSERT INTO pipeline_runs (trigger_source, triggered_by, status, params_json, stages_total)
    VALUES (${triggerSource}, ${triggeredBy}, 'queued', ${sql.json(params as Parameters<typeof sql.json>[0])}, ${stages.length})
    RETURNING id
  `) as { id: number }[];
  return Number(rows[0].id);
}

export async function seedSteps(runId: number, stages: string[]): Promise<void> {
  for (let i = 0; i < stages.length; i++) {
    await sql`
      INSERT INTO pipeline_steps (run_id, stage, seq, status)
      VALUES (${runId}, ${stages[i]}, ${i + 1}, 'pending')
      ON CONFLICT (run_id, stage) DO NOTHING
    `;
  }
}

export async function markRunRunning(runId: number): Promise<void> {
  await sql`
    UPDATE pipeline_runs
       SET status = 'running', started_at = COALESCE(started_at, NOW())
     WHERE id = ${runId}
  `;
}

export async function markRunFinished(
  runId: number,
  status: Extract<RunStatus, "succeeded" | "failed" | "canceled">,
  error?: string,
): Promise<void> {
  await sql`
    UPDATE pipeline_runs
       SET status = ${status}, finished_at = NOW(), error = ${error ?? null}
     WHERE id = ${runId}
  `;
}

export async function setWorkflowRunId(runId: number, workflowRunId: string): Promise<void> {
  await sql`UPDATE pipeline_runs SET workflow_run_id = ${workflowRunId} WHERE id = ${runId}`;
}

export async function markStepRunning(runId: number, stage: string): Promise<void> {
  await sql`
    UPDATE pipeline_steps
       SET status = 'running', started_at = NOW()
     WHERE run_id = ${runId} AND stage = ${stage}
  `;
}

export async function markStepResult(
  runId: number,
  stage: string,
  status: Extract<StepStatus, "succeeded" | "failed" | "skipped">,
  result: StepResult = {},
): Promise<void> {
  await sql`
    UPDATE pipeline_steps
       SET status = ${status},
           rows_in = ${result.rowsIn ?? null},
           rows_out = ${result.rowsOut ?? null},
           cost_cents = ${result.costCents ?? 0},
           error = ${result.error ?? null},
           notes_json = ${result.notes ? sql.json(result.notes as Parameters<typeof sql.json>[0]) : null},
           finished_at = NOW()
     WHERE run_id = ${runId} AND stage = ${stage}
  `;
}

export async function incrementStagesDone(runId: number): Promise<void> {
  await sql`UPDATE pipeline_runs SET stages_done = stages_done + 1 WHERE id = ${runId}`;
}

export async function getRecentRuns(limit = 20): Promise<PipelineRunRow[]> {
  return (await sql`
    SELECT id, trigger_source, triggered_by, status, params_json, workflow_run_id,
           stages_total, stages_done, started_at, finished_at, error, created_at
      FROM pipeline_runs
     ORDER BY created_at DESC
     LIMIT ${limit}
  `) as unknown as PipelineRunRow[];
}

export async function getRunSteps(runId: number): Promise<PipelineStepRow[]> {
  return (await sql`
    SELECT id, run_id, stage, seq, status, rows_in, rows_out, cost_cents,
           started_at, finished_at, error, notes_json
      FROM pipeline_steps
     WHERE run_id = ${runId}
     ORDER BY seq ASC
  `) as unknown as PipelineStepRow[];
}
