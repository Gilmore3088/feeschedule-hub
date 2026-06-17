/**
 * Inline orchestrator — the Phase 1 engine adapter.
 *
 * Runs a run's stages in sequence, writing a status transition to
 * pipeline_steps / pipeline_runs at every boundary. This is the engine-neutral
 * adapter the architecture promises: the Vercel Workflow DevKit swaps in here in
 * a later phase WITHOUT changing the stage contract or the state tables. For
 * Phase 1 (a single fast, read-only `publish` stage) a direct inline await is
 * the right call — no new framework, no build risk, fully verifiable.
 *
 * Fail-fast: a stage that throws marks itself + the run failed and stops the
 * sequence. The error is recorded, never swallowed.
 */

import { getStage } from "./stages";
import * as db from "./db";

export async function executeRun(
  runId: number,
  stages: string[],
  params: Record<string, unknown> = {},
): Promise<{ status: "succeeded" | "failed"; error?: string }> {
  await db.markRunRunning(runId);

  for (const name of stages) {
    const stage = getStage(name);
    if (!stage) {
      const error = `Unknown stage: ${name}`;
      await db.markStepResult(runId, name, "failed", { error });
      await db.markRunFinished(runId, "failed", error);
      return { status: "failed", error };
    }

    await db.markStepRunning(runId, name);
    try {
      const result = await stage.run({ runId, params });
      await db.markStepResult(runId, name, "succeeded", {
        rowsIn: result.rowsIn,
        rowsOut: result.rowsOut,
        costCents: result.costCents,
        notes: result.notes,
      });
      await db.incrementStagesDone(runId);
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      await db.markStepResult(runId, name, "failed", { error });
      await db.markRunFinished(runId, "failed", `stage '${name}' failed: ${error}`);
      return { status: "failed", error };
    }
  }

  await db.markRunFinished(runId, "succeeded");
  return { status: "succeeded" };
}
