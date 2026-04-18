import { render, screen } from "@testing-library/react";
import { DecisionStream, rowFromEvent } from "./decision-stream";
import { describe, it, expect } from "vitest";

describe("DecisionStream", () => {
  it("shows empty state when no decisions", () => {
    render(<DecisionStream decisions={[]} />);
    expect(screen.getByText(/No decisions yet/)).toBeInTheDocument();
  });

  it("renders rows with colored outcomes", () => {
    const d = {
      fee_raw_id: 42,
      outcome: "promoted" as const,
      key: "monthly_maintenance",
      confidence: 0.95,
    };
    render(<DecisionStream decisions={[d]} />);
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("promoted")).toBeInTheDocument();
    expect(screen.getByText("monthly_maintenance")).toBeInTheDocument();
  });
});

describe("rowFromEvent", () => {
  it("returns null for non-row events", () => {
    expect(rowFromEvent({ type: "done", result: {} as any })).toBeNull();
  });

  it("maps row_complete to a Decision", () => {
    const r = rowFromEvent({
      type: "row_complete",
      fee_raw_id: 7,
      outcome: "cached_low_conf",
      key: null,
      confidence: 0.6,
    });
    expect(r).toMatchObject({ fee_raw_id: 7, outcome: "cached_low_conf" });
  });
});
