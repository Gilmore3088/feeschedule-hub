import { describe, expect, it } from "vitest";
import { summarizeJobOutput } from "./job-output-summary";

describe("summarizeJobOutput", () => {
  it("summarizes Atlas pipeline fee totals", () => {
    expect(summarizeJobOutput(`
      Tier 1 raw fees: 104,370
      Tier 2 verified fees: 6,391
      Tier 3 published fees: 13,317
      Awaiting Darwin classification: 98,936
    `)).toBe("Raw 104,370 / Verified 6,391 / Published 13,317 / Awaiting Darwin 98,936");
  });

  it("summarizes Magellan rescue circuit trips", () => {
    expect(summarizeJobOutput(
      "magellan-rescue batch 1/1: {'processed': 340, 'rescued': 0, 'dead': 5, 'circuit_tripped': True, 'halt_reason': 'consecutive_failures'}",
    )).toBe("attempted 340 / rescued 0 / dead 5 / circuit tripped / halt: consecutive_failures");
  });

  it("summarizes Magellan selected versus attempted counts", () => {
    expect(summarizeJobOutput(
      "magellan-rescue batch 1/1: {'selected': 340, 'processed': 5, 'rescued': 0, 'dead': 5}",
    )).toBe("Selected 340 / attempted 5 / rescued 0 / dead 5");
  });
});
