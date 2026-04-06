// src/lib/scout/agent-types.ts

export interface AgentRun {
  id: number;
  state_code: string;
  status: "running" | "complete" | "failed";
  started_at: string;
  completed_at: string | null;
  total_institutions: number;
  discovered: number;
  classified: number;
  extracted: number;
  validated: number;
  failed: number;
  current_stage: string | null;
  current_institution: string | null;
  results?: AgentRunResult[];
}

export interface AgentRunResult {
  id: number;
  agent_run_id: number;
  crawl_target_id: number;
  stage: "discover" | "classify" | "extract" | "validate";
  status: "ok" | "failed" | "skipped";
  detail: Record<string, unknown>;
  created_at: string;
}
