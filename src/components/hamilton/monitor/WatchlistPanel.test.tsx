import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { HamiltonRefreshJobEntry } from "@/lib/hamilton/refresh-jobs";
import type { WatchlistEntry } from "@/lib/hamilton/monitor-data";
import { WatchlistPanel } from "./WatchlistPanel";

vi.mock("@/app/pro/(hamilton)/monitor/actions", () => ({
  addToWatchlist: vi.fn(),
  removeFromWatchlist: vi.fn(),
}));

describe("WatchlistPanel", () => {
  it("shows operational monitoring posture instead of prototype brand copy", () => {
    const entries: WatchlistEntry[] = [
      { institutionId: "2945", displayName: "Example Bank", status: "current" },
    ];
    const refreshJobs: HamiltonRefreshJobEntry[] = [
      {
        id: "job-1",
        institutionId: "2945",
        jobType: "report_refresh",
        status: "queued",
        priority: 2,
        reason: "Published fee movement detected.",
        sourceSignalId: "signal-1",
        sourceSignalType: "hamilton_fee_movement_detected",
        evidencePolicy: "verified-only",
        providerCallQueued: false,
        automationMode: "manual_rerun",
        pipelineStage: "publication",
        createdAt: "2026-08-15T12:00:00.000Z",
        updatedAt: "2026-08-15T12:00:00.000Z",
        completedAt: null,
      },
    ];

    const html = renderToStaticMarkup(
      <WatchlistPanel entries={entries} refreshJobs={refreshJobs} />,
    );

    expect(html).toContain("Monitoring Posture");
    expect(html).toContain("Canonical IDs");
    expect(html).toContain("Manual reruns");
    expect(html).toContain("Provider queued");
    expect(html).not.toContain("Recurring Value preserves institutional permanence");
    expect(html).not.toContain("Hamilton Strategy Protocol");
    expect(html).not.toContain("Custodial Premium");
  });
});
