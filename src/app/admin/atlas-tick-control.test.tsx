// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AtlasTickControl } from "./atlas-tick-control";

const mocks = vi.hoisted(() => ({
  triggerAgentRunExecution: vi.fn(),
}));

vi.mock("@/lib/agents/client-execution", () => ({
  triggerAgentRunExecution: (runId: number) => mocks.triggerAgentRunExecution(runId),
}));

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => body,
  } as Response;
}

beforeEach(() => {
  mocks.triggerAgentRunExecution.mockReset();
  vi.restoreAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("AtlasTickControl", () => {
  it("shows scheduler and execution counts after Atlas tick succeeds", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({
      ok: true,
      scheduledStateLanes: {
        selected: 1,
        scheduled: 1,
        reused: 0,
        failed: [],
        results: [{ stateCode: "CA", runId: 123, status: "queued", reused: false }],
      },
      selected: 1,
      results: [{ runId: 123, status: "queued", terminal: false, executedSteps: 1, message: "Completed enhance; next step queued." }],
    }));
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    render(<AtlasTickControl />);

    fireEvent.click(screen.getByRole("button", { name: /tick atlas now/i }));

    expect(await screen.findByText("1 scheduled · 0 reused")).toBeInTheDocument();
    expect(screen.getByText("Steps executed")).toBeInTheDocument();
    expect(screen.getByText("Completed enhance; next step queued.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/agents/tick?stateLaneLimit=2&runLimit=2&maxStepsPerRun=1",
      { cache: "no-store" },
    );
    expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: "atlas:started" }));
    expect(mocks.triggerAgentRunExecution).toHaveBeenCalledWith(123);
  });

  it("shows the pause reason when the tick route is paused", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({
      ok: true,
      paused: true,
      pauseReason: "Automation safety stop is active.",
    }));

    render(<AtlasTickControl />);

    fireEvent.click(screen.getByRole("button", { name: /tick atlas now/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Automation safety stop is active.");
    expect(mocks.triggerAgentRunExecution).not.toHaveBeenCalled();
  });

  it("shows a blocked reason without calling tick when disabled", () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    render(<AtlasTickControl disabled disabledReason="Agent execution is disabled." />);

    expect(screen.getByRole("button", { name: /tick atlas now/i })).toBeDisabled();
    expect(screen.getByText("Agent execution is disabled.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
