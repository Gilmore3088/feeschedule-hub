import { withApiRoutePolicy } from "@/lib/api-hardening/route-wrapper";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, hasPermission } from "@/lib/auth";
import { executeQueuedAgentRuns } from "@/lib/agents/run-store";
import { scheduleDueStateLaneRuns } from "@/lib/agents/state-lane-scheduler";
import { scheduleDueLinkCheckRun } from "@/lib/agents/magellan/link-check-scheduler";
import { getAutomationControl } from "@/lib/automation-control";
import { matchesConfiguredCronSecret } from "@/lib/cron-secret";
import { getExecutionBackendStatus } from "@/lib/execution-backend";
import { assertCronTickBudgetAllowed } from "@/lib/api-hardening/budget";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;

async function isAuthorized(request: NextRequest): Promise<boolean> {
  if (matchesConfiguredCronSecret(request.headers.get("authorization"))) return true;
  if (matchesConfiguredCronSecret(request.headers.get("x-cron-secret"))) return true;
  const user = await getCurrentUser();
  return Boolean(user && hasPermission(user, "trigger_jobs"));
}

function parsePositiveInt(value: string | null, fallback: number, max: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

async function handleGET(request: NextRequest) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [automation, execution] = await Promise.all([
    getAutomationControl(),
    Promise.resolve(getExecutionBackendStatus()),
  ]);
  if (!automation.enabled || !execution.enabled) {
    return NextResponse.json({
      ok: true,
      paused: true,
      pauseReason: !automation.enabled
        ? automation.reason ?? "Automation safety stop is active."
        : execution.detail,
      automation: {
        enabled: automation.enabled,
        reason: automation.reason,
        changedAt: automation.changedAt,
        changedBy: automation.changedBy,
      },
      execution: {
        backend: execution.backend,
        enabled: execution.enabled,
        detail: execution.detail,
      },
      scheduledStateLanes: {
        selected: 0,
        scheduled: 0,
        reused: 0,
        failed: [],
        results: [],
      },
      selected: 0,
      results: [],
    });
  }

  const runLimit = parsePositiveInt(request.nextUrl.searchParams.get("runLimit"), 2, 10);
  const maxStepsPerRun = parsePositiveInt(request.nextUrl.searchParams.get("maxStepsPerRun"), 1, 5);
  const stateLaneLimit = parsePositiveInt(request.nextUrl.searchParams.get("stateLaneLimit"), 2, 10);
  const budget = await assertCronTickBudgetAllowed({
    routeId: "api.admin.agents.tick",
    requestedRunLimit: runLimit,
    requestedMaxStepsPerRun: maxStepsPerRun,
    requestedStateLaneLimit: stateLaneLimit,
    triggeredBy: "api.admin.agents.tick",
  });
  if (!budget.allowed) {
    return NextResponse.json({
      ok: true,
      paused: true,
      pauseReason: budget.message ?? "Agent tick budget policy blocks execution.",
      blockedReason: budget.reasonCode,
      budget: {
        policyId: budget.policyId ?? null,
        configured: false,
        reasonCode: budget.reasonCode,
      },
      scheduledStateLanes: {
        selected: 0,
        scheduled: 0,
        reused: 0,
        failed: [],
        results: [],
      },
      selected: 0,
      results: [],
    }, { status: 423 });
  }

  const scheduledStateLanes = await scheduleDueStateLaneRuns({
    limit: stateLaneLimit,
    triggeredBy: "api.admin.agents.tick",
  });
  const scheduledLinkCheck = await scheduleDueLinkCheckRun({
    triggeredBy: "api.admin.agents.tick",
  }).then(
    (scheduled) =>
      scheduled
        ? { scheduled: scheduled.scheduled, runId: scheduled.run.id }
        : { scheduled: false, runId: null },
    // Surface scheduler failures in the tick response instead of swallowing them —
    // an operator watching the tick endpoint should see why link-check didn't run.
    (error: unknown) => ({
      scheduled: false,
      runId: null,
      reason: error instanceof Error ? error.message : String(error),
    }),
  );
  const result = await executeQueuedAgentRuns({
    runLimit,
    maxStepsPerRun,
    budgetPolicyId: budget.policyId ?? null,
    maxProviderCallsPerRun: budget.maxProviderCalls ?? null,
    maxEstimatedCostMicrousd: budget.maxEstimatedMicrousd ?? null,
  });
  return NextResponse.json({
    ok: true,
    scheduledStateLanes,
    scheduledLinkCheck,
    ...result,
  });
}

async function handlePOST(request: NextRequest) {
  return handleGET(request);
}

export const GET = withApiRoutePolicy("api.admin.agents.tick", "GET", handleGET);
export const POST = withApiRoutePolicy("api.admin.agents.tick", "POST", handlePOST);
