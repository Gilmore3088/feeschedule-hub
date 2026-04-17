// Types + constants for the agent console. Kept in a separate module so client
// components (tiles / tree-view / timeline / thread-view) can import them without
// pulling the server-only `postgres` module into the browser bundle.
//
// Server-side callers should continue importing from `./agent-console`, which
// re-exports these same symbols alongside the query functions.

export type AgentHealthTile = {
  agent_name: string;
  metrics: {
    loop_completion_rate: number | null;
    review_latency_seconds: number | null;
    pattern_promotion_rate: number | null;
    confidence_drift: number | null;
    cost_to_value_ratio: number | null;
  };
  bucket_start: string | null;
};

export type HealthMetric =
  | "loop_completion_rate"
  | "review_latency_seconds"
  | "pattern_promotion_rate"
  | "confidence_drift"
  | "cost_to_value_ratio";

export const HEALTH_METRICS: HealthMetric[] = [
  "loop_completion_rate",
  "review_latency_seconds",
  "pattern_promotion_rate",
  "confidence_drift",
  "cost_to_value_ratio",
];

export const HEALTH_METRIC_LABELS: Record<HealthMetric, string> = {
  loop_completion_rate: "Loop Completion",
  review_latency_seconds: "Review Latency",
  pattern_promotion_rate: "Pattern Promotion",
  confidence_drift: "Confidence Drift",
  cost_to_value_ratio: "Cost / Value",
};

export type LineageTier1 = {
  row: Record<string, unknown>;
  r2_key?: string | null;
};
export type LineageTier2 = {
  row: Record<string, unknown>;
  children?: Array<{ tier_1: LineageTier1 }>;
};
export type LineageTier3 = {
  row: Record<string, unknown>;
  children?: Array<{ tier_2: LineageTier2 }>;
};
export type LineageGraph = {
  tier_3?: LineageTier3;
} | null;

export type LineageError = {
  code:
    | "fee_published_not_found"
    | "tier_2_missing"
    | "tier_1_missing";
  details: Record<string, unknown>;
};

export type LineageGraphResult =
  | { ok: true; graph: LineageGraph }
  | { ok: false; error: LineageError };

export type ReasoningTraceRow = {
  kind: "event" | "message";
  created_at: string;
  agent_name: string;
  intent_or_action: string | null;
  tool_name: string | null;
  entity: string | null;
  payload: unknown;
  row_id: string;
};

export type MessageThread = {
  correlation_id: string;
  latest_state: string;
  round_count: number;
  latest_intent: string;
  started_at: string;
  participants: string[];
};
