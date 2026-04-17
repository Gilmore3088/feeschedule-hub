import { sql } from "./connection";
import {
  type AgentHealthTile,
  type HealthMetric,
  HEALTH_METRICS,
  HEALTH_METRIC_LABELS,
  type LineageTier1,
  type LineageTier2,
  type LineageTier3,
  type LineageGraph,
  type LineageError,
  type LineageGraphResult,
  type ReasoningTraceRow,
  type MessageThread,
} from "./agent-console-types";

/**
 * Agent console queries (Plan 62B-10, tabs: Overview/Lineage/Messages/Replay).
 *
 * Types + constants live in `./agent-console-types` (no DB dependency — safe
 * to import from client components). This module adds the server query
 * functions that hit Postgres, and re-exports the types for callers that
 * only need a single import.
 *
 * Backing DB objects:
 *   - `agent_health_rollup` (62B-09): 15-min bucket, 5 metrics per agent
 *   - `lineage_graph(fee_published_id)` (62B-01): JSONB Tier-3 → Tier-2 → Tier-1 → R2
 *   - `v_agent_reasoning_trace` (62B-05/06): events + messages unioned by correlation_id
 *   - `agent_messages` (62B-05): inter-agent message queue
 */

export {
  HEALTH_METRICS,
  HEALTH_METRIC_LABELS,
};
export type {
  AgentHealthTile,
  HealthMetric,
  LineageTier1,
  LineageTier2,
  LineageTier3,
  LineageGraph,
  LineageError,
  LineageGraphResult,
  ReasoningTraceRow,
  MessageThread,
};

function toIso(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Latest bucket per agent. Returns one row per distinct agent_name.
 */
export async function getAgentHealthTiles(
  agentNames?: string[],
): Promise<AgentHealthTile[]> {
  const rows =
    agentNames && agentNames.length > 0
      ? ((await sql`
          SELECT DISTINCT ON (agent_name) agent_name, bucket_start,
                 loop_completion_rate, review_latency_seconds,
                 pattern_promotion_rate, confidence_drift, cost_to_value_ratio
            FROM agent_health_rollup
           WHERE agent_name = ANY(${agentNames})
           ORDER BY agent_name, bucket_start DESC
        `) as unknown as Record<string, unknown>[])
      : ((await sql`
          SELECT DISTINCT ON (agent_name) agent_name, bucket_start,
                 loop_completion_rate, review_latency_seconds,
                 pattern_promotion_rate, confidence_drift, cost_to_value_ratio
            FROM agent_health_rollup
           ORDER BY agent_name, bucket_start DESC
        `) as unknown as Record<string, unknown>[]);

  return rows.map((r) => ({
    agent_name: String(r.agent_name),
    bucket_start: toIso(r.bucket_start),
    metrics: {
      loop_completion_rate: toNum(r.loop_completion_rate),
      review_latency_seconds: toNum(r.review_latency_seconds),
      pattern_promotion_rate: toNum(r.pattern_promotion_rate),
      confidence_drift: toNum(r.confidence_drift),
      cost_to_value_ratio: toNum(r.cost_to_value_ratio),
    },
  }));
}

/**
 * Returns a sorted (oldest → newest) array of metric values for sparkline rendering.
 * Metric column is whitelisted against HEALTH_METRICS to prevent injection via
 * `sql.unsafe` — see threat model T-62B-10-03.
 */
export async function getAgentHealthSparkline(
  agentName: string,
  metric: HealthMetric,
  bucketCount = 672,
): Promise<number[]> {
  if (!HEALTH_METRICS.includes(metric)) {
    throw new Error(`unknown metric: ${metric}`);
  }
  const rows = (await sql.unsafe(
    `SELECT ${metric} AS v
       FROM agent_health_rollup
      WHERE agent_name = $1
      ORDER BY bucket_start DESC
      LIMIT $2`,
    [agentName, bucketCount],
  )) as unknown as { v: unknown }[];
  return rows.reverse().map((r) => {
    const n = toNum(r.v);
    return n ?? 0;
  });
}

// The lineage_graph() SQL function returns a nested JSONB document.
// Shape (per 62B-01 lineage_graph function comment):
//   { tier_3: { row, children: [{ tier_2: { row, children: [{ tier_1: { row, r2_key? } }] } }] } }
// Or (since WR-06 fix, migration 20260517): a discriminated error payload
// when a lineage row is missing:
//   { error: "fee_published_not_found" | "tier_2_missing" | "tier_1_missing", ... }
// Types live in `./agent-console-types` and are re-exported above.

function isErrorPayload(
  g: unknown,
): g is { error: string } & Record<string, unknown> {
  return (
    typeof g === "object" &&
    g !== null &&
    "error" in g &&
    typeof (g as { error: unknown }).error === "string"
  );
}

export async function getLineageGraph(
  feePublishedId: number,
): Promise<LineageGraphResult> {
  const rows = (await sql`
    SELECT lineage_graph(${feePublishedId}::BIGINT) AS g
  `) as unknown as { g: unknown }[];
  const g = rows[0]?.g ?? null;
  if (isErrorPayload(g)) {
    const { error, ...details } = g;
    const code = error as LineageError["code"];
    return { ok: false, error: { code, details } };
  }
  return { ok: true, graph: (g as LineageGraph) ?? null };
}

export async function getReasoningTrace(
  correlationId: string,
  maxRows = 500,
): Promise<ReasoningTraceRow[]> {
  const rows = (await sql`
    SELECT kind, created_at, agent_name, intent_or_action, tool_name, entity, payload, row_id
      FROM v_agent_reasoning_trace
     WHERE correlation_id = ${correlationId}::UUID
     ORDER BY created_at
     LIMIT ${maxRows}
  `) as unknown as Record<string, unknown>[];
  return rows.map((r) => ({
    kind: (r.kind === "message" ? "message" : "event") as "event" | "message",
    created_at: toIso(r.created_at) ?? "",
    agent_name: String(r.agent_name ?? ""),
    intent_or_action: r.intent_or_action == null ? null : String(r.intent_or_action),
    tool_name: r.tool_name == null ? null : String(r.tool_name),
    entity: r.entity == null ? null : String(r.entity),
    payload: r.payload,
    row_id: String(r.row_id ?? ""),
  }));
}

export async function listRecentThreads(
  sinceHours = 72,
  limit = 50,
): Promise<MessageThread[]> {
  const rows = (await sql`
    SELECT correlation_id,
           MIN(created_at) AS started_at,
           MAX(round_number) AS round_count,
           (ARRAY_AGG(intent ORDER BY created_at DESC))[1] AS latest_intent,
           (ARRAY_AGG(state ORDER BY created_at DESC))[1] AS latest_state,
           ARRAY_AGG(DISTINCT sender_agent) AS participants
      FROM agent_messages
     WHERE created_at > NOW() - make_interval(hours => ${sinceHours})
     GROUP BY correlation_id
     ORDER BY started_at DESC
     LIMIT ${limit}
  `) as unknown as Record<string, unknown>[];
  return rows.map((r) => ({
    correlation_id: String(r.correlation_id),
    latest_state: String(r.latest_state ?? ""),
    round_count: Number(r.round_count ?? 0),
    latest_intent: String(r.latest_intent ?? ""),
    started_at: toIso(r.started_at) ?? "",
    participants: Array.isArray(r.participants)
      ? (r.participants as unknown[]).map(String)
      : [],
  }));
}
