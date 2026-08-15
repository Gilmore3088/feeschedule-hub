import { describe, expect, it } from "vitest";
import type { AgentRunDetail, AgentRunResult } from "@/lib/data-store/states";
import type { AgentRunStepSnapshot } from "@/lib/agents/types";
import { buildRunSummaryStats, isLedgerOnlyRun } from "./run-detail-helpers";

const legacyRun: AgentRunDetail = {
  id: 123,
  state_code: "CA",
  status: "completed",
  discovered: 4,
  classified: 3,
  extracted: 2,
  validated: 1,
  failed: 5,
  started_at: "2026-08-15T20:00:00.000Z",
  completed_at: "2026-08-15T20:01:00.000Z",
};

function step(status: AgentRunStepSnapshot["status"]): Pick<AgentRunStepSnapshot, "status"> {
  return { status };
}

describe("state run detail helpers", () => {
  it("uses legacy institution counters when no agent ledger steps exist", () => {
    expect(buildRunSummaryStats({ legacyRun, steps: [] })).toEqual([
      { label: "Discovered", value: 4 },
      { label: "Classified", value: 3 },
      { label: "Extracted", value: 2 },
      { label: "Validated", value: 1 },
      { label: "Failed", value: 5, alert: true },
    ]);
  });

  it("uses step ledger counters for workflow-lane runs", () => {
    expect(buildRunSummaryStats({
      legacyRun,
      steps: [
        step("completed"),
        step("skipped"),
        step("queued"),
        step("running"),
        step("blocked"),
        step("failed"),
      ],
    })).toEqual([
      { label: "Steps total", value: 6 },
      { label: "Completed", value: 2 },
      { label: "Queued", value: 1 },
      { label: "Running", value: 1 },
      { label: "Blocked/failed", value: 2, alert: true },
    ]);
  });

  it("identifies ledger-only runs without per-institution result rows", () => {
    const results: AgentRunResult[] = [];
    const steps = [
      { id: 1, status: "queued" },
    ] as AgentRunStepSnapshot[];

    expect(isLedgerOnlyRun({ results, steps })).toBe(true);
    expect(isLedgerOnlyRun({ results: [{} as AgentRunResult], steps })).toBe(false);
    expect(isLedgerOnlyRun({ results, steps: [] })).toBe(false);
  });
});
