/**
 * Pure types for the pipeline control plane — no DB or server imports, so both
 * server modules (db.ts, runner, API routes) and client components (the live
 * control room) can import them safely.
 */

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
  started_at: Date | string | null;
  finished_at: Date | string | null;
  error: string | null;
  created_at: Date | string;
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
  started_at: Date | string | null;
  finished_at: Date | string | null;
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

/** Shape returned by GET /api/admin/pipeline/state (JSON-serialized dates). */
export interface PipelineState {
  runs: PipelineRunRow[];
  latestSteps: PipelineStepRow[];
}
