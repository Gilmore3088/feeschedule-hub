import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUserMock = vi.fn();
const hasPermissionMock = vi.fn();
const matchesConfiguredCronSecretMock = vi.fn();
const getAutomationControlMock = vi.fn();
const getExecutionBackendStatusMock = vi.fn();
const scheduleDueStateLaneRunsMock = vi.fn();
const scheduleDueLinkCheckRunMock = vi.fn();
const executeQueuedAgentRunsMock = vi.fn();
const assertCronTickBudgetAllowedMock = vi.fn();

vi.mock("@/lib/auth", () => ({
  getCurrentUser: getCurrentUserMock,
  hasPermission: hasPermissionMock,
}));

vi.mock("@/lib/cron-secret", () => ({
  matchesConfiguredCronSecret: matchesConfiguredCronSecretMock,
}));

vi.mock("@/lib/automation-control", () => ({
  getAutomationControl: getAutomationControlMock,
}));

vi.mock("@/lib/execution-backend", () => ({
  getExecutionBackendStatus: getExecutionBackendStatusMock,
}));

vi.mock("@/lib/agents/state-lane-scheduler", () => ({
  scheduleDueStateLaneRuns: scheduleDueStateLaneRunsMock,
}));

vi.mock("@/lib/agents/magellan/link-check-scheduler", () => ({
  scheduleDueLinkCheckRun: scheduleDueLinkCheckRunMock,
}));

vi.mock("@/lib/agents/run-store", () => ({
  executeQueuedAgentRuns: executeQueuedAgentRunsMock,
}));

vi.mock("@/lib/api-hardening/budget", () => ({
  assertCronTickBudgetAllowed: assertCronTickBudgetAllowedMock,
}));

function request(url = "https://feeinsight.com/api/admin/agents/tick") {
  return new NextRequest(url);
}

describe("/api/admin/agents/tick", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    matchesConfiguredCronSecretMock.mockReturnValue(true);
    getAutomationControlMock.mockResolvedValue({
      enabled: true,
      reason: null,
      changedBy: "system",
      changedAt: "2026-08-15T00:00:00.000Z",
      revision: 1,
    });
    getExecutionBackendStatusMock.mockReturnValue({
      backend: "agentic_v1",
      enabled: true,
      label: "Agentic backend selected",
      detail: "Agentic backend selected",
    });
    scheduleDueStateLaneRunsMock.mockResolvedValue({
      selected: 1,
      scheduled: 1,
      reused: 0,
      failed: [],
      results: [{ stateCode: "CA", runId: 123, status: "queued", reused: false }],
    });
    scheduleDueLinkCheckRunMock.mockResolvedValue({
      run: { id: 456 },
      steps: [],
      reused: false,
      scheduled: true,
      idempotencyKey: "magellan:link-check:2026-08-18",
    });
    executeQueuedAgentRunsMock.mockResolvedValue({
      selected: 1,
      results: [{ runId: 123, status: "queued", terminal: false, executedSteps: 1 }],
    });
    assertCronTickBudgetAllowedMock.mockResolvedValue({
      allowed: true,
      policyId: 42,
      maxProviderCalls: 3,
      maxEstimatedMicrousd: 250_000,
    });
  });

  it("schedules due state lanes before draining when Atlas is enabled", async () => {
    const { GET } = await import("./route");

    const response = await GET(request("https://feeinsight.com/api/admin/agents/tick?stateLaneLimit=3&runLimit=2&maxStepsPerRun=1"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.paused).toBeUndefined();
    expect(scheduleDueStateLaneRunsMock).toHaveBeenCalledWith({
      limit: 3,
      triggeredBy: "api.admin.agents.tick",
    });
    expect(scheduleDueLinkCheckRunMock).toHaveBeenCalledWith({
      triggeredBy: "api.admin.agents.tick",
    });
    expect(body.scheduledLinkCheck).toEqual({ scheduled: true, runId: 456 });
    expect(executeQueuedAgentRunsMock).toHaveBeenCalledWith({
      runLimit: 2,
      maxStepsPerRun: 1,
      budgetPolicyId: 42,
      maxProviderCallsPerRun: 3,
      maxEstimatedCostMicrousd: 250_000,
    });
  });

  it("reports no scheduled link check when nothing was due", async () => {
    scheduleDueLinkCheckRunMock.mockResolvedValue(null);
    const { GET } = await import("./route");

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.scheduledLinkCheck).toEqual({ scheduled: false, runId: null });
  });

  it("does not create blocked runs while automation is stopped", async () => {
    getAutomationControlMock.mockResolvedValue({
      enabled: false,
      reason: "Provider credit failure",
      changedBy: "codex-provider-guard",
      changedAt: "2026-08-15T00:00:00.000Z",
      revision: 2,
    });
    const { GET } = await import("./route");

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.paused).toBe(true);
    expect(body.pauseReason).toBe("Provider credit failure");
    expect(scheduleDueStateLaneRunsMock).not.toHaveBeenCalled();
    expect(scheduleDueLinkCheckRunMock).not.toHaveBeenCalled();
    expect(executeQueuedAgentRunsMock).not.toHaveBeenCalled();
  });

  it("does not drain queued runs when the execution backend is disabled", async () => {
    getExecutionBackendStatusMock.mockReturnValue({
      backend: "disabled",
      enabled: false,
      label: "Agentic backend disabled",
      detail: "Agent execution is blocked.",
    });
    const { GET } = await import("./route");

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.paused).toBe(true);
    expect(body.pauseReason).toBe("Agent execution is blocked.");
    expect(scheduleDueStateLaneRunsMock).not.toHaveBeenCalled();
    expect(scheduleDueLinkCheckRunMock).not.toHaveBeenCalled();
    expect(executeQueuedAgentRunsMock).not.toHaveBeenCalled();
  });

  it("does not schedule or drain when the cron budget policy is not configured", async () => {
    assertCronTickBudgetAllowedMock.mockResolvedValue({
      allowed: false,
      reasonCode: "budget_policy_disabled",
      policyId: 42,
      message: "Cron tick policy is disabled.",
    });
    const { GET } = await import("./route");

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(423);
    expect(body.paused).toBe(true);
    expect(body.blockedReason).toBe("budget_policy_disabled");
    expect(scheduleDueStateLaneRunsMock).not.toHaveBeenCalled();
    expect(scheduleDueLinkCheckRunMock).not.toHaveBeenCalled();
    expect(executeQueuedAgentRunsMock).not.toHaveBeenCalled();
  });
});
