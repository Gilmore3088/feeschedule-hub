import { withApiRoutePolicy } from "@/lib/api-hardening/route-wrapper";
// src/app/api/scout/agent/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, hasPermission } from "@/lib/auth";
import { getLatestAgentRun, getAgentRunResults } from "@/lib/scout/agent-db";
import { startAgentRun } from "@/lib/agents/run-store";

async function handleGET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user, "view")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const state = req.nextUrl.searchParams.get("state")?.toUpperCase();
  if (!state || state.length !== 2) {
    return NextResponse.json({ error: "state param required" }, { status: 400 });
  }

  const run = await getLatestAgentRun(state);
  if (!run) {
    return NextResponse.json({ run: null });
  }

  const results = await getAgentRunResults(run.id);
  return NextResponse.json({ run: { ...run, results } });
}

async function handlePOST(req: NextRequest) {
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
    const result = await startAgentRun({
      agent: "magellan",
      kind: "state_agent",
      title: `Scout ${stateCode} fee schedule discovery`,
      stateCode,
      params: { state: stateCode, limit: 100, source: "api.scout.agent" },
      triggeredBy: user.username,
      triggerSource: "api",
      idempotencyKey: `magellan:discover:${stateCode}`,
      steps: [
        {
          key: "discover",
          agent: "magellan",
          title: `Find ${stateCode} fee schedule URLs`,
          input: { state: stateCode, limit: 100 },
        },
        {
          key: "fetch",
          agent: "magellan",
          title: "Fetch discovered fee documents",
        },
        {
          key: "read",
          agent: "rosetta",
          title: "Read fee documents",
        },
        {
          key: "extract",
          agent: "knox",
          title: "Extract fee observations",
        },
      ],
      summary: "State agent run created. Worker execution waits for the agentic_v1 backend.",
    });
    return NextResponse.json(
      { ok: true, job_id: result.run.id, run_id: result.run.id, reused: result.reused },
      { status: 202 },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export const GET = withApiRoutePolicy("api.scout.agent", "GET", handleGET);
export const POST = withApiRoutePolicy("api.scout.agent", "POST", handlePOST);
