import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sqlMock } = vi.hoisted(() => ({ sqlMock: vi.fn() }));

vi.mock("./crawler-db/connection", () => ({ sql: sqlMock }));
vi.mock("./automation-control", () => ({
  assertAutomationEnabled: vi.fn().mockResolvedValue({ enabled: true }),
}));

import { cancelJob, spawnJob } from "./job-runner";

function response(body: unknown, init: ResponseInit = {}): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

describe("canonical job lifecycle", () => {
  beforeEach(() => {
    sqlMock.mockReset();
    vi.restoreAllMocks();
    process.env.REPORT_INTERNAL_SECRET = "test-modal-secret";
  });

  afterEach(() => {
    delete process.env.REPORT_INTERNAL_SECRET;
  });

  it("marks a Modal trigger failure terminally", async () => {
    sqlMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ cnt: 0 }])
      .mockResolvedValueOnce([{ id: 42 }])
      .mockResolvedValueOnce([]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response("worker unavailable", { status: 503 })));

    await expect(spawnJob("pipeline", ["--limit", "100"], "admin")).rejects.toThrow(
      "Modal ops runner failed: 503",
    );

    const failedUpdate = sqlMock.mock.calls[4];
    expect(failedUpdate[0].join(" ")).toContain("status = 'failed'");
    expect(failedUpdate.slice(1)).toContain("Modal 503: worker unavailable");
  });

  it("rejects malformed Modal acknowledgements and marks the row failed", async () => {
    sqlMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ cnt: 0 }])
      .mockResolvedValueOnce([{ id: 43 }])
      .mockResolvedValueOnce([]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ ok: true })));

    await expect(spawnJob("pipeline", [], "admin")).rejects.toThrow(
      "Modal trigger did not return a call_id",
    );
    expect(sqlMock.mock.calls[4].slice(1)).toContain("Modal trigger did not return a call_id");
  });

  it("persists the Modal call ID before returning success", async () => {
    sqlMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ cnt: 0 }])
      .mockResolvedValueOnce([{ id: 44 }])
      .mockResolvedValueOnce([]);
    const fetchMock = vi.fn().mockResolvedValue(response({ call_id: "fc-123" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(spawnJob("pipeline", [], "admin")).resolves.toMatchObject({
      jobId: 44,
      callId: "fc-123",
    });
    expect(sqlMock.mock.calls[4].slice(1)).toContain("fc-123");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
      internal_secret: "test-modal-secret",
    });
  });

  it("returns an active idempotent run instead of triggering a duplicate", async () => {
    sqlMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 45, modal_call_id: "fc-active" }]);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(spawnJob("pipeline", [], "admin", undefined, {
      idempotencyKey: "atlas:full-cycle",
    })).resolves.toMatchObject({ jobId: 45, callId: "fc-active", reused: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports success only when Modal and the database confirm cancellation", async () => {
    sqlMock
      .mockResolvedValueOnce([{ id: 46, status: "running", modal_call_id: "fc-cancel" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ status: "cancelled" }]);
    const fetchMock = vi.fn().mockResolvedValue(response({ status: "cancelled" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(cancelJob(46)).resolves.toEqual({ success: true });
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
      internal_secret: "test-modal-secret",
    });
  });

  it("keeps cancellation non-terminal without Modal confirmation", async () => {
    sqlMock
      .mockResolvedValueOnce([{ id: 47, status: "running", modal_call_id: "fc-uncertain" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ ok: true })));

    await expect(cancelJob(47)).resolves.toEqual({
      success: false,
      error: "Modal did not confirm cancellation",
    });
    expect(sqlMock.mock.calls[2][0].join(" ")).toContain("error_summary");
  });
});
