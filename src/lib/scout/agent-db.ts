// src/lib/scout/agent-db.ts

import { sql } from "@/lib/crawler-db/connection";
import type { AgentRun, AgentRunResult } from "./agent-types";

export async function ensureAgentTables() {
  await sql`
    CREATE TABLE IF NOT EXISTS agent_runs (
      id SERIAL PRIMARY KEY,
      state_code TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      started_at TIMESTAMPTZ DEFAULT NOW(),
      completed_at TIMESTAMPTZ,
      total_institutions INTEGER DEFAULT 0,
      discovered INTEGER DEFAULT 0,
      classified INTEGER DEFAULT 0,
      extracted INTEGER DEFAULT 0,
      validated INTEGER DEFAULT 0,
      failed INTEGER DEFAULT 0,
      current_stage TEXT,
      current_institution TEXT
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS agent_run_results (
      id SERIAL PRIMARY KEY,
      agent_run_id INTEGER REFERENCES agent_runs(id),
      crawl_target_id INTEGER NOT NULL,
      stage TEXT NOT NULL,
      status TEXT NOT NULL,
      detail JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_agent_run_results_run
    ON agent_run_results(agent_run_id)
  `;
}

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
