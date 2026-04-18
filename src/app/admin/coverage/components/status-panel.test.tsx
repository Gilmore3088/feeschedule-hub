import { render, screen } from "@testing-library/react";
import { StatusPanel } from "./status-panel";
import { describe, it, expect } from "vitest";

describe("StatusPanel", () => {
  it("renders all 5 tiles with numbers", () => {
    render(
      <StatusPanel
        status={{
          pending: 965,
          rescued: 12,
          dead: 3,
          needs_human: 1,
          retry_after: 5,
          today_cost_usd: 0.4,
          circuit: { halted: false },
        }}
      />
    );
    expect(screen.getByText("965")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.getByText("Rescued")).toBeInTheDocument();
  });
});
