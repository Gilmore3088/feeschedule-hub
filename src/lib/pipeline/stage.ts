/**
 * Engine-neutral stage contract.
 *
 * Every pipeline stage implements this interface. The orchestration engine
 * (today: an inline runner; later: the Vercel Workflow DevKit) is a thin,
 * swappable adapter behind this contract — a stage never knows which engine
 * drives it. That is what bounds the risk of the engine choice: swapping the
 * runner leaves every stage, and the two state tables, untouched.
 */

export interface StageContext {
  /** The pipeline_runs.id this stage is executing under. */
  runId: number;
  /** Free-form run parameters (e.g. minConfidence). */
  params: Record<string, unknown>;
}

export interface StageResult {
  /** Rows the stage considered / read. */
  rowsIn: number;
  /** Rows the stage produced / wrote. */
  rowsOut: number;
  /** LLM / API spend attributable to this stage, in cents. */
  costCents?: number;
  /** Structured, human-readable detail surfaced in the control room. */
  notes?: Record<string, unknown>;
}

export interface Stage {
  /** Stable identifier, also the pipeline_steps.stage value. */
  name: string;
  /** One-line description for the control room. */
  description: string;
  run(ctx: StageContext): Promise<StageResult>;
}

/** Read a numeric run param with a default. */
export function numParam(v: unknown, dflt: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : dflt;
}

/** Read a boolean run param (default false). Stages are dry-run unless apply=true. */
export function boolParam(v: unknown): boolean {
  return v === true;
}
