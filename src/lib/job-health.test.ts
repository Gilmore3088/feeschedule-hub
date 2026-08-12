import { describe, expect, it } from "vitest";

import { isJobHealthDegraded } from "./job-health";

describe("isJobHealthDegraded", () => {
  it("keeps the endpoint healthy only when every failure count is zero", () => {
    expect(
      isJobHealthDegraded({
        stale_count: 0,
        failed_count: 0,
        never_ran_count: 0,
      }),
    ).toBe(false);
  });

  it.each([
    ["stale", { stale_count: 1, failed_count: 0, never_ran_count: 0 }],
    ["failed", { stale_count: 0, failed_count: 1, never_ran_count: 0 }],
    ["never run", { stale_count: 0, failed_count: 0, never_ran_count: 1 }],
    ["agent errors", { stale_count: 0, failed_count: 0, never_ran_count: 0, agent_error_count_24h: 1 }],
    ["provider failures", { stale_count: 0, failed_count: 0, never_ran_count: 0, provider_failure_count_24h: 1 }],
    ["emergency stop", { stale_count: 0, failed_count: 0, never_ran_count: 0, automation_enabled: false }],
  ])("marks the endpoint degraded for a %s scheduled job", (_label, health) => {
    expect(isJobHealthDegraded(health)).toBe(true);
  });
});
