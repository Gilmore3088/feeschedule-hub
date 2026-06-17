/**
 * Vercel Cron entry point — schedules a pipeline run through the same code path
 * as the admin trigger. Records a DRY-RUN snapshot (backlog at each stage) so the
 * control room reflects current state over time. It does NOT run apply, so it
 * never conflicts with the owner's parallel Modal crons that do the real work.
 *
 * Auth: Vercel includes `Authorization: Bearer <CRON_SECRET>` when CRON_SECRET is
 * set in the project env. To run apply on a schedule later, pass params here.
 *
 * Schedule is declared in vercel.json.
 */

import { NextRequest, NextResponse } from "next/server";
import { createRun, seedSteps } from "@/lib/pipeline/db";
import { executeRun } from "@/lib/pipeline/runner";
import { stageNames } from "@/lib/pipeline/stages";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CRON_SECRET = process.env.CRON_SECRET || "";

export async function GET(request: NextRequest) {
  const token = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!CRON_SECRET || token !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const stages = stageNames();
  try {
    const runId = await createRun("cron", "vercel-cron", stages, {});
    await seedSteps(runId, stages);
    const outcome = await executeRun(runId, stages, {});
    return NextResponse.json({
      ok: outcome.status === "succeeded",
      runId,
      status: outcome.status,
      stages,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
