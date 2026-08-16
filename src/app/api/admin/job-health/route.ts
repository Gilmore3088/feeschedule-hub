import { withApiRoutePolicy } from "@/lib/api-hardening/route-wrapper";
// Reliability Roadmap #1 — external cron health endpoint.
//
// Returns a JSON summary of whether each expected scheduled job has completed
// within its cadence window. Intended for external monitors (Uptime Kuma,
// Better Stack, Pingdom) to poll every few minutes.
//
// HTTP status is 200 when all jobs are healthy, 503 when any job is stale or
// has never recorded a completion. That way monitors can trigger alerts off a
// plain HTTP check without having to parse the payload.

import { NextResponse } from "next/server";
import { getJobFreshness } from "@/lib/admin-queries";
import { getAutomationControl } from "@/lib/automation-control";
import { sql } from "@/lib/data-store/connection";
import { isJobHealthDegraded } from "@/lib/job-health";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function handleGET() {
  const [scheduleHealth, control, counts] = await Promise.all([
    getJobFreshness(),
    getAutomationControl(),
    sql`
      SELECT
        (SELECT COUNT(*)::int FROM agent_events
          WHERE status = 'error'
            AND created_at >= NOW() - INTERVAL '24 hours') AS agent_errors,
        (SELECT COUNT(*)::int FROM ai_api_usage_events
          WHERE status = 'failed'
            AND created_at >= NOW() - INTERVAL '24 hours') AS provider_failures
    `,
  ]);
  const health = {
    ...scheduleHealth,
    automation_enabled: control.enabled,
    automation_changed_at: control.changedAt,
    agent_error_count_24h: Number(counts[0]?.agent_errors ?? 0),
    provider_failure_count_24h: Number(counts[0]?.provider_failures ?? 0),
  };
  const degraded = isJobHealthDegraded(health);
  return NextResponse.json(health, { status: degraded ? 503 : 200 });
}

export const GET = withApiRoutePolicy("api.admin.job_health", "GET", handleGET);
