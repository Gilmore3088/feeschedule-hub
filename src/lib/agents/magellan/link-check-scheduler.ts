import { sql } from "@/lib/data-store/connection";
import { startAgentRun, type StartAgentRunResult } from "@/lib/agents/run-store";
import { MAGELLAN_LINK_CHECK_DEFAULT_LIMIT } from "./link-check";

function todayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export interface ScheduleLinkCheckOptions {
  triggeredBy: string;
  limit?: number;
}

export interface ScheduleLinkCheckResult extends StartAgentRunResult {
  scheduled: boolean;
  idempotencyKey: string;
}

/**
 * Starts Magellan's link-check run at most once per calendar day. Unlike
 * `startAgentRun`'s own idempotency check (which only dedupes concurrently
 * active runs), this looks for *any* run — active or finished — tagged with
 * today's key, so a tick that fires every few minutes does not launch a new
 * run every time the previous one completes.
 */
export async function scheduleDueLinkCheckRun(
  options: ScheduleLinkCheckOptions,
): Promise<ScheduleLinkCheckResult | null> {
  const idempotencyKey = `magellan:link-check:${todayKey()}`;
  const [existing] = await sql`
    SELECT id FROM agent_runs WHERE idempotency_key = ${idempotencyKey} LIMIT 1
  `;
  if (existing) return null;

  const limit = options.limit ?? MAGELLAN_LINK_CHECK_DEFAULT_LIMIT;
  const result = await startAgentRun({
    agent: "magellan",
    kind: "workflow",
    title: "Magellan link health check",
    params: { limit, source: "magellan.link_check_scheduler" },
    triggeredBy: options.triggeredBy,
    triggerSource: "schedule",
    idempotencyKey,
    steps: [
      {
        key: "link_check",
        agent: "magellan",
        title: "Check published fee source links for availability",
        input: { limit },
      },
    ],
    summary: "Magellan checks HTTP reachability of source documents backing published fees.",
  });
  return { ...result, scheduled: !result.reused, idempotencyKey };
}
