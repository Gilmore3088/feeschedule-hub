import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/data-store/connection", () => ({ getSql: vi.fn() }));

import { getSql } from "@/lib/data-store/connection";
import {
  getPublishabilitySnapshot,
  publishabilityVerdict,
  REPORT_READY_TARGET,
} from "./publishability";

const getSqlMock = getSql as unknown as ReturnType<typeof vi.fn>;

function rows(r: unknown[]) {
  return vi.fn(() => Promise.resolve(r));
}

describe("getPublishabilitySnapshot", () => {
  beforeEach(() => vi.clearAllMocks());

  it("should_total_institutions_and_ready_counts_across_states", async () => {
    getSqlMock.mockReturnValue(
      rows([
        { state_code: "OH", institutions: 358, any_featured: 40, full_ready: 1, viable_ready: 4 },
        { state_code: "CA", institutions: 366, any_featured: 60, full_ready: 2, viable_ready: 6 },
      ]),
    );
    const s = await getPublishabilitySnapshot();
    expect(s.institutions).toBe(724);
    expect(s.withAnyFeaturedFee).toBe(100);
    expect(s.fullReportReady).toBe(3);
    expect(s.viableReportReady).toBe(10);
  });

  it("should_stay_below_the_line_when_ready_count_is_under_target", async () => {
    getSqlMock.mockReturnValue(
      rows([{ state_code: "OH", institutions: 100, any_featured: 10, full_ready: 1, viable_ready: 5 }]),
    );
    const s = await getPublishabilitySnapshot();
    expect(s.aboveLine).toBe(false);
    expect(publishabilityVerdict(s)).toContain("outranks other inward work");
  });

  it("should_clear_the_line_at_the_target", async () => {
    getSqlMock.mockReturnValue(
      rows([
        {
          state_code: "OH",
          institutions: 500,
          any_featured: 200,
          full_ready: 40,
          viable_ready: REPORT_READY_TARGET,
        },
      ]),
    );
    const s = await getPublishabilitySnapshot();
    expect(s.aboveLine).toBe(true);
    expect(publishabilityVerdict(s)).toContain("ranks below outward work");
  });

  it("should_order_states_by_ready_count_and_drop_empty_ones", async () => {
    getSqlMock.mockReturnValue(
      rows([
        { state_code: "OH", institutions: 358, any_featured: 40, full_ready: 1, viable_ready: 2 },
        { state_code: "CA", institutions: 366, any_featured: 60, full_ready: 2, viable_ready: 6 },
        { state_code: "WY", institutions: 12, any_featured: 0, full_ready: 0, viable_ready: 0 },
      ]),
    );
    const s = await getPublishabilitySnapshot();
    expect(s.states.map((x) => x.stateCode)).toEqual(["CA", "OH"]);
  });

  it("should_surface_a_query_failure_instead_of_reporting_a_false_zero", async () => {
    getSqlMock.mockReturnValue(vi.fn(() => Promise.reject(new Error("no such table"))));
    const s = await getPublishabilitySnapshot();
    expect(s.error).toContain("no such table");
    expect(publishabilityVerdict(s)).toContain("unknown");
  });
});
