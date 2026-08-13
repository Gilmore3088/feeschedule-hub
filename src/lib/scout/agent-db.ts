// src/lib/scout/agent-db.ts

import { sql } from "@/lib/data-store/connection";
import type { AgentRun, AgentRunResult } from "./agent-types";

export async function getAgentRun(id: number): Promise<AgentRun | null> {
  const [row] = await sql<AgentRun[]>`
    SELECT * FROM agent_runs WHERE id = ${id}
  `;
  return row || null;
}

export async function getAgentRunResults(runId: number): Promise<AgentRunResult[]> {
  return sql<AgentRunResult[]>`
    SELECT * FROM agent_run_results
    WHERE agent_run_id = ${runId}
    ORDER BY created_at
  `;
}

export async function getLatestAgentRun(stateCode: string): Promise<AgentRun | null> {
  const [row] = await sql<AgentRun[]>`
    SELECT * FROM agent_runs
    WHERE state_code = ${stateCode}
    ORDER BY started_at DESC LIMIT 1
  `;
  return row || null;
}
