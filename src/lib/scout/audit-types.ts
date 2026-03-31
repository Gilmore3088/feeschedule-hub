// src/lib/scout/audit-types.ts

export type AuditAgentId = "validator" | "discoverer" | "ai_scout" | "reporter";
export type AuditAgentStatus = "idle" | "running" | "ok" | "warn" | "error";

export interface AuditSSEEvent {
  type: "log" | "agent" | "result" | "batch_progress" | "batch_summary" | "done" | "error";
  agentId?: AuditAgentId;
  status?: AuditAgentStatus;
  durationMs?: number;
  msg?: string;
  result?: AuditResult;
  batchProgress?: { current: number; total: number; institution: string };
  batchSummary?: BatchSummary;
  success?: boolean;
}

export interface AuditResult {
  institutionId: number;
  institutionName: string;
  urlBefore: string | null;
  urlAfter: string | null;
  action: "validated" | "cleared" | "discovered" | "ai_found" | "not_found";
  discoveryMethod: string | null;
  confidence: number | null;
  reason: string | null;
}

export interface BatchSummary {
  total: number;
  validated: number;
  cleared: number;
  discovered: number;
  aiFound: number;
  stillMissing: number;
  aiCostCents: number;
}

export interface DiscoveryResponse {
  found: boolean;
  fee_schedule_url: string | null;
  document_type: string | null;
  method: string | null;
  confidence: number;
  pages_checked: number;
  error: string | null;
  methods_tried: string[];
}
