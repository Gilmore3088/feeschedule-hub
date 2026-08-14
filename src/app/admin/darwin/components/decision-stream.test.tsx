import { render, screen } from "@testing-library/react";
import { DecisionStream, rowFromEvent } from "./decision-stream";
import { describe, it, expect } from "vitest";

describe("DecisionStream", () => {
  it("shows empty state when no decisions", () => {
    render(<DecisionStream decisions={[]} />);
    expect(screen.getByText(/No live classification rows/)).toBeInTheDocument();
  });

  it("renders rows with colored outcomes", () => {
    const d = {
      fee_raw_id: 42,
      fee_name: "Monthly Maintenance Fee",
      outcome: "promoted" as const,
      key: "monthly_maintenance",
      confidence: 0.95,
    };
    render(<DecisionStream decisions={[d]} />);
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("Monthly Maintenance Fee")).toBeInTheDocument();
    expect(screen.getByText("promoted")).toBeInTheDocument();
    expect(screen.getByText("monthly_maintenance")).toBeInTheDocument();
  });
});

describe("rowFromEvent", () => {
  it("returns null for non-row events", () => {
    expect(
      rowFromEvent({
        type: "done",
        result: {
          processed: 0,
          cache_hits: 0,
          llm_calls: 0,
          promoted: 0,
          cached_low_conf: 0,
          rejected: 0,
          failures: 0,
          cost_usd: 0,
          duration_s: 0,
          circuit_tripped: false,
          halt_reason: null,
        },
      }),
    ).toBeNull();
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
