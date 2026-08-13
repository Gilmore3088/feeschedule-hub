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

/**
 * One-sentence plain-English definition for each health metric.
 * Surfaced as tooltip text on Overview tiles (UAT Gap 4).
 * Source: .planning/runbooks/agent-bootstrap.md + D-15.
 */
export const HEALTH_METRIC_DESCRIPTIONS: Record<HealthMetric, string> = {
  loop_completion_rate:
    "Share of review cycles that finished all 5 loop steps (LOG \u2192 REVIEW \u2192 DISSECT \u2192 UNDERSTAND \u2192 IMPROVE) without error or timeout.",
  review_latency_seconds:
    "Time from an unreviewed agent_event being written to the agent's review() being invoked by the dispatcher.",
  pattern_promotion_rate:
    "Share of IMPROVE proposals that passed the adversarial canary gate and were committed as a new lesson.",
  confidence_drift:
    "Signed change in mean extraction/verification confidence vs. the rolling 7-day baseline. Positive = improving, negative = regressing.",
  cost_to_value_ratio:
    "Dollars of Anthropic API spend per validated output unit (e.g. per accepted fee, per resolved handshake). Lower is better.",
};

/**
 * Unit suffix for each metric; shown next to the value in the Overview legend.
 */
export const HEALTH_METRIC_UNITS: Record<HealthMetric, string> = {
  loop_completion_rate: "% (0-100)",
  review_latency_seconds: "seconds (lower is better)",
  pattern_promotion_rate: "% (0-100)",
  confidence_drift: "signed ratio (target: \u2265 0)",
  cost_to_value_ratio: "$ per validated unit (lower is better)",
};

/**
 * Threshold bands for coloring metric values (UAT Gap 4).
 * - `healthy`: value is in a good state -> emerald
 * - `watch`: value is drifting but not critical -> amber
 * - else: critical -> red
 *
 * Each band is a predicate; the first one that returns true wins.
 * Anchored to runbook \u00a77 SLA table (REVIEW < 15min = 900s).
 */
export const HEALTH_METRIC_THRESHOLDS: Record<
  HealthMetric,
  { healthy: (v: number) => boolean; watch: (v: number) => boolean }
> = {
  loop_completion_rate: {
    healthy: (v) => v >= 0.95,
    watch: (v) => v >= 0.85,
  },
  review_latency_seconds: {
    healthy: (v) => v <= 900,
    watch: (v) => v <= 1800,
  },
  pattern_promotion_rate: {
    healthy: (v) => v >= 0.5,
    watch: (v) => v >= 0.2,
  },
  confidence_drift: {
    healthy: (v) => v >= -0.01,
    watch: (v) => v >= -0.05,
  },
  cost_to_value_ratio: {
    healthy: (v) => v <= 2.0,
    watch: (v) => v <= 5.0,
  },
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

/**
 * Recent published fee for the Lineage picker (UAT Gap 6b).
 * Sourced from fees_published ORDER BY published_at DESC LIMIT 10.
 */
export type RecentPublishedFee = {
  fee_published_id: number;
  canonical_fee_key: string;
  institution_id: number;
  fee_name: string;
  published_at: string;
};
