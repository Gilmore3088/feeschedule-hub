import { beforeEach, describe, expect, it, vi } from "vitest";

const { sqlMock, startAgentRunMock, assertAutomationEnabledMock } = vi.hoisted(() => ({
  sqlMock: vi.fn(),
  startAgentRunMock: vi.fn(),
  assertAutomationEnabledMock: vi.fn(),
}));

vi.mock("./crawler-db/connection", () => ({
  sql: sqlMock,
}));
vi.mock("./automation-control", () => ({
  assertAutomationEnabled: assertAutomationEnabledMock,
}));
vi.mock("./agents/run-store", () => ({
  startAgentRun: startAgentRunMock,
}));

import { triggerReportJob } from "./report-agent-runs";

describe("agentic report job envelope", () => {
  beforeEach(() => {
    sqlMock.mockReset().mockResolvedValue([]);
    startAgentRunMock.mockReset().mockResolvedValue({
      run: { id: 501 },
      reused: false,
      steps: [],
    });
    assertAutomationEnabledMock.mockReset().mockResolvedValue({ enabled: true });
  });

  it("creates a Hamilton report run and links it to report_jobs", async () => {
    await expect(triggerReportJob(
      "report-1",
      "monthly_pulse",
      { state: "CA" },
      "admin",
    )).resolves.toEqual({ success: true, agentRunId: 501 });

    expect(startAgentRunMock).toHaveBeenCalledWith(expect.objectContaining({
      agent: "hamilton",
      kind: "report",
      triggeredBy: "admin",
      idempotencyKey: "report:report-1",
      params: expect.objectContaining({
        report_job_id: "report-1",
        report_type: "monthly_pulse",
        state: "CA",
      }),
    }));
    expect(sqlMock).toHaveBeenCalledOnce();
    expect(sqlMock.mock.calls[0][0].join(" ")).toContain("UPDATE report_jobs");
    expect(sqlMock.mock.calls[0][0].join(" ")).toContain("agent_run_id");
  });

  it("does not create a run when automation safety is stopped", async () => {
    assertAutomationEnabledMock.mockRejectedValueOnce(new Error("Emergency stop is active"));

    await expect(triggerReportJob(
      "report-2",
      "national_index",
      {},
      "admin",
    )).resolves.toEqual({
      success: false,
      error: "Emergency stop is active",
    });

    expect(startAgentRunMock).not.toHaveBeenCalled();
    expect(sqlMock).not.toHaveBeenCalled();
  });
});
