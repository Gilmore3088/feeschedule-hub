import { render, screen } from "@testing-library/react";
import { RescueStream, rowFromEvent } from "./rescue-stream";
import { describe, it, expect } from "vitest";

describe("RescueStream", () => {
  it("renders empty state when no rows", () => {
    render(<RescueStream rows={[]} />);
    expect(screen.getByText(/No rescues yet/)).toBeInTheDocument();
  });

  it("renders row with correct outcome label", () => {
    render(
      <RescueStream
        rows={[
          {
            target_id: 42,
            outcome: "rescued",
            rung: "playwright_stealth",
            fees: 5,
          },
        ]}
      />
    );
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("rescued")).toBeInTheDocument();
    expect(screen.getByText("playwright_stealth")).toBeInTheDocument();
  });
});

describe("rowFromEvent", () => {
  it("returns null for non-row events", () => {
    expect(rowFromEvent({ type: "done", result: {} as any })).toBeNull();
  });

  it("maps row_complete to Row", () => {
    const r = rowFromEvent({
      type: "row_complete",
      target_id: 7,
      outcome: "dead",
      rung: "ua_rotation",
      fees: 0,
    });
    expect(r).toMatchObject({
      target_id: 7,
      outcome: "dead",
      rung: "ua_rotation",
    });
  });
});
