import { render, screen } from "@testing-library/react";
import { CircuitBanner } from "./circuit-banner";
import { describe, it, expect, vi } from "vitest";

describe("CircuitBanner", () => {
  it("renders nothing when not halted", () => {
    const { container } = render(
      <CircuitBanner
        status={{
          pending: 0,
          today_promoted: 0,
          today_cost_usd: 0,
          circuit: { halted: false },
          recent_run_avg_tokens_per_row: null,
        }}
        onReset={() => {}}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders red banner with reason when halted", () => {
    render(
      <CircuitBanner
        status={{
          pending: 0,
          today_promoted: 0,
          today_cost_usd: 0,
          circuit: { halted: true, reason: "error_rate" },
          recent_run_avg_tokens_per_row: null,
        }}
        onReset={() => {}}
      />
    );
    expect(screen.getByText(/Darwin halted/)).toBeInTheDocument();
    expect(screen.getByText(/error_rate/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reset/i })).toBeInTheDocument();
  });
});
