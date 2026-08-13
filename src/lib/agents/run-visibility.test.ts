import { describe, expect, it } from "vitest";
import { getAgentRunVisibility } from "./run-visibility";

const now = new Date("2026-08-13T02:00:00.000Z");

describe("getAgentRunVisibility", () => {
  it("marks fresh queued runs as waiting for pickup", () => {
    expect(getAgentRunVisibility({
      status: "queued",
      startedAt: "2026-08-13T01:59:10.000Z",
      updatedAt: "2026-08-13T01:59:10.000Z",
      completedAt: null,
      now,
    })).toMatchObject({
      state: "waiting_for_pickup",
      stale: false,
      nextPickupAt: "2026-08-13T02:04:10.000Z",
      ageSeconds: 50,
    });
  });

  it("marks old queued runs as stale pickup failures", () => {
    expect(getAgentRunVisibility({
      status: "queued",
      startedAt: "2026-08-13T01:55:00.000Z",
      updatedAt: "2026-08-13T01:55:00.000Z",
      completedAt: null,
      now,
    })).toMatchObject({
      state: "stale_queued",
      stale: true,
      ageSeconds: 300,
    });
  });

  it("uses events as running heartbeat evidence", () => {
    expect(getAgentRunVisibility({
      status: "running",
      startedAt: "2026-08-13T01:00:00.000Z",
      updatedAt: "2026-08-13T01:20:00.000Z",
      lastEventAt: "2026-08-13T01:59:30.000Z",
      completedAt: null,
      now,
    })).toMatchObject({
      state: "running",
      stale: false,
      ageSeconds: 30,
    });
  });

  it("marks running runs stale when ledger activity is old", () => {
    expect(getAgentRunVisibility({
      status: "running",
      startedAt: "2026-08-13T01:00:00.000Z",
      updatedAt: "2026-08-13T01:50:00.000Z",
      completedAt: null,
      now,
    })).toMatchObject({
      state: "stale_running",
      stale: true,
      ageSeconds: 600,
    });
  });
});
