export type AdminAgent = "atlas" | "magellan" | "rosetta" | "darwin" | "knox" | "hamilton";

export type AgentRunStatus =
  | "queued"
  | "running"
  | "blocked"
  | "complete"
  | "completed"
  | "failed"
  | "cancel_requested"
  | "cancelled";

export type AgentRunStepStatus =
  | "queued"
  | "running"
  | "blocked"
  | "completed"
  | "failed"
  | "cancel_requested"
  | "cancelled"
  | "skipped";

export type AgentRunKind =
  | "workflow"
  | "workflow_lane"
  | "state_agent"
  | "report"
  | "manual_repair"
  | "dry_run";

export type AgentRunTriggerSource = "schedule" | "admin" | "api" | "agent";

export interface AgentRunStepDefinition {
  key: string;
  title: string;
  agent: AdminAgent;
  input?: Record<string, unknown>;
}

export interface AgentRunSnapshot {
  id: number;
  agent: AdminAgent;
  runKind: AgentRunKind;
  title: string;
  status: AgentRunStatus;
  startedAt: string;
  completedAt: string | null;
  updatedAt: string;
  triggerSource: AgentRunTriggerSource;
  triggeredBy: string | null;
  correlationId: string;
  backend: string;
  progressCurrent: number;
  progressTotal: number;
  currentStage: string | null;
  error: string | null;
  summary: string | null;
  params: Record<string, unknown>;
}

export interface AgentRunStepSnapshot {
  id: number;
  runId: number;
  stepKey: string;
  agent: AdminAgent;
  title: string;
  input: Record<string, unknown>;
  status: AgentRunStepStatus;
  sequence: number;
  summary: string | null;
  error: string | null;
  queuedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
}

export interface AgentRunEventSnapshot {
  id: number;
  runId: number;
  stepId: number | null;
  eventType: string;
  status: string;
  message: string;
  detail: Record<string, unknown>;
  createdAt: string;
}
