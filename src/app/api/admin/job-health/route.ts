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

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const health = await getJobFreshness();
  const degraded = health.stale_count > 0 || health.never_ran_count > 0;
  return NextResponse.json(health, { status: degraded ? 503 : 200 });
}
