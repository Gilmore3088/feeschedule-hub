import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, hasPermission } from "@/lib/auth";
import { executeAgentRun } from "@/lib/agents/run-store";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;

function parseRunId(value: string): number | null {
  const runId = Number.parseInt(value, 10);
  return Number.isInteger(runId) && runId > 0 ? runId : null;
}

function parseMaxSteps(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(Math.max(Math.floor(parsed), 1), 5);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user, "trigger_jobs")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const runId = parseRunId(id);
  if (!runId) {
    return NextResponse.json({ error: "Invalid agent run id" }, { status: 400 });
  }

  let body: { maxSteps?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const result = await executeAgentRun(runId, { maxSteps: parseMaxSteps(body.maxSteps) });
  return NextResponse.json(result, { status: result.status === "missing" ? 404 : 202 });
}
