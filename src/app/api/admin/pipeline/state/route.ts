/**
 * Live state endpoint for the control room. Returns recent runs + the latest
 * run's steps as JSON so the client can poll for live updates without a full
 * page refresh. Admin-only; read-only.
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getRecentRuns, getRunSteps } from "@/lib/pipeline/db";
import type { PipelineState } from "@/lib/pipeline/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const runs = await getRecentRuns(10);
    const latestSteps = runs.length > 0 ? await getRunSteps(runs[0].id) : [];
    const body: PipelineState = { runs, latestSteps };
    return NextResponse.json(body);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
