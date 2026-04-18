import { render, screen } from "@testing-library/react";
import { CircuitBanner } from "./circuit-banner";
import { describe, it, expect, vi } from "vitest";

describe("CircuitBanner", () => {
  it("renders nothing when not halted", () => {
    const { container } = render(
      <CircuitBanner
        status={{
          pending: 0,
          circuit: { halted: false },
        }}
        onReset={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders red banner with reason when halted", () => {
    render(
      <CircuitBanner
        status={{
          pending: 0,
          circuit: { halted: true, reason: "error_rate" },
        }}
        onReset={vi.fn()}
      />
    );
    expect(screen.getByText(/Agent halted/)).toBeInTheDocument();
    expect(screen.getByText(/error_rate/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reset/i })).toBeInTheDocument();
  });
});
