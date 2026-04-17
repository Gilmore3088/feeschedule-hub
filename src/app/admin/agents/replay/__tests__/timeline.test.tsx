// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Timeline } from "../timeline";
import type { ReasoningTraceRow } from "@/lib/crawler-db/agent-console";

afterEach(() => {
  cleanup();
});

describe("Timeline (OBS-04)", () => {
  const FIXTURE: ReasoningTraceRow[] = [
    {
      kind: "event",
      created_at: "2026-04-16T00:00:00Z",
      agent_name: "darwin",
      intent_or_action: "review",
      tool_name: "_agent_base",
      entity: "_review",
      payload: {},
      row_id: "e1",
    },
    {
      kind: "message",
      created_at: "2026-04-16T00:00:05Z",
      agent_name: "darwin",
      intent_or_action: "challenge",
      tool_name: null,
      entity: "agent_messages",
      payload: { question: "why?" },
      row_id: "m1",
    },
  ];

  it("renders both rows in created_at order", () => {
    render(<Timeline rows={FIXTURE} />);
    const rows = screen.getAllByTestId("timeline-row");
    expect(rows.length).toBe(2);
    // First rendered row corresponds to the earlier event
    expect(rows[0].getAttribute("data-kind")).toBe("event");
    expect(rows[1].getAttribute("data-kind")).toBe("message");
  });

  it("shows kind badges labelled 'event' and 'message'", () => {
    render(<Timeline rows={FIXTURE} />);
    const badges = screen.getAllByTestId("kind-badge");
    const texts = badges.map((b) => b.textContent?.trim().toLowerCase());
    expect(texts).toContain("event");
    expect(texts).toContain("message");
  });

  it("does NOT render a re-execute button (D-16 read-only)", () => {
    render(<Timeline rows={FIXTURE} />);
    const btns = screen.queryAllByRole("button", { name: /re-?execute/i });
    expect(btns.length).toBe(0);
  });

  it("renders empty-state when rows is empty", () => {
    render(<Timeline rows={[]} />);
    expect(screen.getByText(/no trace rows/i)).toBeTruthy();
  });
});
