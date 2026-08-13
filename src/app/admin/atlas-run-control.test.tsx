// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AtlasRunControl } from "./atlas-run-control";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  runAtlasCycle: vi.fn(),
  triggerAgentRunExecution: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock("./atlas-actions", () => ({
  runAtlasCycle: () => mocks.runAtlasCycle(),
}));

vi.mock("@/lib/agents/client-execution", () => ({
  triggerAgentRunExecution: (runId: number) => mocks.triggerAgentRunExecution(runId),
}));

beforeEach(() => {
  mocks.refresh.mockReset();
  mocks.runAtlasCycle.mockReset();
  mocks.triggerAgentRunExecution.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("AtlasRunControl", () => {
  it("renders a visible run receipt after Atlas is queued", async () => {
    mocks.runAtlasCycle.mockResolvedValue({ success: true, runId: 123, reused: false });

    render(<AtlasRunControl />);

    fireEvent.click(screen.getByRole("button", { name: /queue full atlas cycle/i }));

    expect(await screen.findByText(/run created/i)).toBeInTheDocument();
    expect(screen.getByText(/#123/)).toBeInTheDocument();
    expect(screen.getByText("Atlas full data cycle")).toBeInTheDocument();
    expect(screen.getByText(/waiting for run events/i)).toBeInTheDocument();
    expect(mocks.triggerAgentRunExecution).toHaveBeenCalledWith(123);
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("shows a blocked reason when disabled before any run attempt", () => {
    render(<AtlasRunControl disabled disabledReason="Automation is stopped." />);

    expect(screen.getByRole("button", { name: /queue full atlas cycle/i })).toBeDisabled();
    expect(screen.getByText("Automation is stopped.")).toBeInTheDocument();
  });
});
