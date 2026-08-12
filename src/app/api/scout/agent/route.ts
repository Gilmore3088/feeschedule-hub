// src/app/api/scout/agent/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, hasPermission } from "@/lib/auth";
import { ensureAgentTables, getLatestAgentRun, getAgentRunResults } from "@/lib/scout/agent-db";
import { spawnJob } from "@/lib/job-runner";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user, "view")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const state = req.nextUrl.searchParams.get("state")?.toUpperCase();
  if (!state || state.length !== 2) {
    return NextResponse.json({ error: "state param required" }, { status: 400 });
  }

  await ensureAgentTables();
  const run = await getLatestAgentRun(state);
  if (!run) {
    return NextResponse.json({ run: null });
  }

  const results = await getAgentRunResults(run.id);
  return NextResponse.json({ run: { ...run, results } });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user, "trigger_jobs")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { state } = await req.json();
  if (!state || !/^[A-Za-z]{2}$/.test(state)) {
    return NextResponse.json({ error: "state required (2-letter code)" }, { status: 400 });
  }

  try {
    const stateCode = String(state).toUpperCase();
    const result = await spawnJob(
      "discover",
      ["--state", stateCode, "--limit", "100"],
      user.username,
      undefined,
      { agent: "magellan", triggerSource: "api", idempotencyKey: `magellan:discover:${stateCode}` },
    );
    return NextResponse.json({ ok: true, job_id: result.jobId, reused: result.reused }, { status: 202 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
