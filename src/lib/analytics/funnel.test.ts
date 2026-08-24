import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/data-store/connection", () => ({
  getSql: vi.fn(),
}));

import { getSql } from "@/lib/data-store/connection";
import { getDemandSnapshot, formatDemandLine } from "./funnel";

const getSqlMock = getSql as unknown as ReturnType<typeof vi.fn>;

/** A tagged-template stand-in that answers every count query with `n`. */
function sqlReturning(n: number) {
  return vi.fn(() => Promise.resolve([{ n }]));
}

describe("getDemandSnapshot", () => {
  beforeEach(() => vi.clearAllMocks());

  it("should_return_a_window_for_seven_and_thirty_days", async () => {
    getSqlMock.mockReturnValue(sqlReturning(4));
    const snap = await getDemandSnapshot();
    expect(snap.windows.map((w) => w.days)).toEqual([7, 30]);
  });

  it("should_count_every_funnel_step_from_the_database", async () => {
    getSqlMock.mockReturnValue(sqlReturning(4));
    const snap = await getDemandSnapshot();
    const week = snap.windows[0];
    expect(week.leads).toBe(4);
    expect(week.reportRequests).toBe(4);
    expect(week.registrations).toBe(4);
    expect(week.paying).toBe(4);
    expect(week.reportsGenerated).toBe(4);
    expect(snap.warnings).toEqual([]);
  });

  it("should_coerce_string_counts_postgres_returns", async () => {
    getSqlMock.mockReturnValue(vi.fn(() => Promise.resolve([{ n: "12" }])));
    const snap = await getDemandSnapshot();
    expect(snap.windows[0].leads).toBe(12);
  });

  it("should_report_zero_when_a_table_is_missing_rather_than_throwing", async () => {
    getSqlMock.mockReturnValue(
      vi.fn(() => Promise.reject(new Error('relation "leads" does not exist'))),
    );
    const snap = await getDemandSnapshot();
    expect(snap.windows[0].leads).toBe(0);
    expect(snap.warnings.length).toBeGreaterThan(0);
  });

  it("should_not_duplicate_a_warning_across_windows", async () => {
    getSqlMock.mockReturnValue(vi.fn(() => Promise.reject(new Error("boom"))));
    const snap = await getDemandSnapshot();
    expect(new Set(snap.warnings).size).toBe(snap.warnings.length);
  });

  it("should_group_generated_reports_by_type", async () => {
    getSqlMock.mockReturnValue(
      vi.fn((strings: TemplateStringsArray) => {
        const text = strings.join("?");
        if (text.includes("GROUP BY report_type")) {
          return Promise.resolve([
            { report_type: "competitive_positioning", n: 3 },
            { report_type: "peer_benchmarking", n: 1 },
          ]);
        }
        return Promise.resolve([{ n: 0 }]);
      }),
    );
    const snap = await getDemandSnapshot();
    expect(snap.byReportType).toEqual([
      { reportType: "competitive_positioning", count: 3 },
      { reportType: "peer_benchmarking", count: 1 },
    ]);
  });
});

describe("formatDemandLine", () => {
  it("should_summarise_the_seven_day_window", () => {
    const line = formatDemandLine({
      windows: [
        { days: 7, leads: 2, reportRequests: 1, registrations: 3, paying: 1, reportsGenerated: 5 },
        { days: 30, leads: 9, reportRequests: 4, registrations: 8, paying: 1, reportsGenerated: 20 },
      ],
      byReportType: [],
      warnings: [],
    });
    expect(line).toBe("2 leads · 3 signups · 5 reports · 1 paying");
  });

  it("should_degrade_when_the_window_is_missing", () => {
    expect(formatDemandLine({ windows: [], byReportType: [], warnings: [] })).toBe(
      "Demand: no window",
    );
  });
});
