import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sqlMock, txMock, beginMock } = vi.hoisted(() => {
  const tx = vi.fn();
  const begin = vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx));
  const sql = Object.assign(vi.fn(), { begin });
  return { sqlMock: sql, txMock: tx, beginMock: begin };
});

vi.mock("./crawler-db/connection", () => ({
  sql: sqlMock,
  withTransaction: beginMock,
}));
vi.mock("./automation-control", () => ({
  assertAutomationEnabled: vi.fn().mockResolvedValue({ enabled: true }),
}));

import { triggerReportJob } from "./report-job-runner";

function response(body: unknown, status = 200): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("report job envelope", () => {
  beforeEach(() => {
    sqlMock.mockReset();
    txMock.mockReset().mockResolvedValue([]);
    beginMock.mockClear();
    process.env.MODAL_REPORT_URL = "https://modal.example/report";
    process.env.REPORT_INTERNAL_SECRET = "test-modal-secret";
    vi.restoreAllMocks();
  });

  afterEach(() => {
    delete process.env.MODAL_REPORT_URL;
    delete process.env.REPORT_INTERNAL_SECRET;
  });

  it("marks both records failed when the Modal trigger fails", async () => {
    sqlMock
      .mockResolvedValueOnce([{ id: 90 }])
      .mockResolvedValueOnce([]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response("worker down", 503)));

    await expect(triggerReportJob(
      "report-1",
      "monthly_pulse",
      {},
      "admin",
    )).resolves.toMatchObject({ success: false, opsJobId: 90 });

    expect(beginMock).toHaveBeenCalledOnce();
    expect(txMock).toHaveBeenCalledTimes(2);
    expect(txMock.mock.calls[0][0].join(" ")).toContain("status = 'failed'");
    expect(txMock.mock.calls[1][0].join(" ")).toContain("status = 'failed'");
  });

  it("persists the same Modal call ID on report_jobs and ops_jobs", async () => {
    sqlMock
      .mockResolvedValueOnce([{ id: 91 }])
      .mockResolvedValueOnce([]);
    const fetchMock = vi.fn().mockResolvedValue(response({ call_id: "fc-report" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(triggerReportJob(
      "report-2",
      "national_index",
      { quarter: "2026-Q2" },
      "admin",
    )).resolves.toEqual({
      success: true,
      opsJobId: 91,
      callId: "fc-report",
    });

    expect(txMock).toHaveBeenCalledTimes(2);
    expect(txMock.mock.calls[0].slice(1)).toContain("fc-report");
    expect(txMock.mock.calls[1].slice(1)).toContain("fc-report");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
      internal_secret: "test-modal-secret",
    });
  });
});
