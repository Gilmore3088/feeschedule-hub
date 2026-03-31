// src/app/api/scout/agent/[id]/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getAgentRun, getAgentRunResults } from "@/lib/scout/agent-db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const runId = parseInt(id, 10);
  if (isNaN(runId)) {
    return NextResponse.json({ error: "Invalid run ID" }, { status: 400 });
  }

  const run = await getAgentRun(runId);
  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  const results = await getAgentRunResults(runId);

  return NextResponse.json({ ...run, results });
}
