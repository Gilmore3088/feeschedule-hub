// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Tiles } from "../overview/tiles";
import type { AgentHealthTile } from "@/lib/crawler-db/agent-console-types";

afterEach(() => {
  cleanup();
});

describe("Tiles (OBS-05)", () => {
  it("renders 5 metric tiles per agent", () => {
    const data: AgentHealthTile[] = [
      {
        agent_name: "knox",
        bucket_start: "2026-04-16T00:00:00Z",
        metrics: {
          loop_completion_rate: 0.95,
          review_latency_seconds: 60,
          pattern_promotion_rate: 0.5,
          confidence_drift: 0.01,
          cost_to_value_ratio: 2.5,
        },
      },
    ];

    render(<Tiles data={data} sparklines={{}} />);

    // 5 tiles for knox
    expect(screen.getAllByTestId("agent-tile").length).toBe(5);
    // Agent name rendered
    expect(screen.getAllByText("knox").length).toBeGreaterThan(0);
  });

  it("renders em-dash for null metric values", () => {
    const data: AgentHealthTile[] = [
      {
        agent_name: "knox",
        bucket_start: "2026-04-16T00:00:00Z",
        metrics: {
          loop_completion_rate: 0.95,
          review_latency_seconds: 60,
          pattern_promotion_rate: null,
          confidence_drift: 0.01,
          cost_to_value_ratio: 2.5,
        },
      },
    ];

    render(<Tiles data={data} sparklines={{}} />);

    // em-dash should appear for the null pattern_promotion_rate tile
    const tiles = screen.getAllByTestId("agent-tile");
    const hasEmDash = tiles.some((t) => t.textContent?.includes("—"));
    expect(hasEmDash).toBe(true);
  });

  it("renders sparkline when history data provided", () => {
    const data: AgentHealthTile[] = [
      {
        agent_name: "knox",
        bucket_start: "2026-04-16T00:00:00Z",
        metrics: {
          loop_completion_rate: 0.95,
          review_latency_seconds: 60,
          pattern_promotion_rate: 0.5,
          confidence_drift: 0.01,
          cost_to_value_ratio: 2.5,
        },
      },
    ];

    const sparklines = {
      "knox:loop_completion_rate": [0.8, 0.85, 0.9, 0.95],
    };

    render(<Tiles data={data} sparklines={sparklines} />);

    // At least one sparkline svg must be present
    const sparks = document.querySelectorAll("[data-testid='sparkline']");
    expect(sparks.length).toBeGreaterThan(0);
  });

  it("renders empty-state when no agents present", () => {
    render(<Tiles data={[]} sparklines={{}} />);
    expect(screen.getByText(/no agent health data/i)).toBeTruthy();
  });

  it("renders tile root with title attribute from HEALTH_METRIC_DESCRIPTIONS (Gap 4 tooltip)", () => {
    const data: AgentHealthTile[] = [
      {
        agent_name: "knox",
        bucket_start: "2026-04-16T00:00:00Z",
        metrics: {
          loop_completion_rate: 0.95,
          review_latency_seconds: 60,
          pattern_promotion_rate: 0.5,
          confidence_drift: 0.01,
          cost_to_value_ratio: 2.5,
        },
      },
    ];
    render(<Tiles data={data} sparklines={{}} />);
    const loopTile = screen
      .getAllByTestId("agent-tile")
      .find((el) => el.getAttribute("data-metric") === "loop_completion_rate");
    expect(loopTile).toBeTruthy();
    expect(loopTile!.getAttribute("title")).toMatch(/5 loop steps/i);
  });

  it("applies threshold band (healthy for 0.95, critical for 0.5) on loop_completion_rate", () => {
    const healthy: AgentHealthTile[] = [
      {
        agent_name: "knox",
        bucket_start: "2026-04-16T00:00:00Z",
        metrics: {
          loop_completion_rate: 0.95,
          review_latency_seconds: 60,
          pattern_promotion_rate: 0.5,
          confidence_drift: 0.01,
          cost_to_value_ratio: 2.5,
        },
      },
    ];
    const { unmount } = render(<Tiles data={healthy} sparklines={{}} />);
    const healthyTile = screen
      .getAllByTestId("agent-tile")
      .find((el) => el.getAttribute("data-metric") === "loop_completion_rate");
    expect(healthyTile!.getAttribute("data-band")).toBe("healthy");
    unmount();

    const critical: AgentHealthTile[] = [
      {
        agent_name: "knox",
        bucket_start: "2026-04-16T00:00:00Z",
        metrics: {
          loop_completion_rate: 0.5,
          review_latency_seconds: 60,
          pattern_promotion_rate: 0.5,
          confidence_drift: 0.01,
          cost_to_value_ratio: 2.5,
        },
      },
    ];
    render(<Tiles data={critical} sparklines={{}} />);
    const criticalTile = screen
      .getAllByTestId("agent-tile")
      .find((el) => el.getAttribute("data-metric") === "loop_completion_rate");
    expect(criticalTile!.getAttribute("data-band")).toBe("critical");
  });

  it("renders the legend card with all 5 metric labels", () => {
    const data: AgentHealthTile[] = [
      {
        agent_name: "knox",
        bucket_start: "2026-04-16T00:00:00Z",
        metrics: {
          loop_completion_rate: 0.95,
          review_latency_seconds: 60,
          pattern_promotion_rate: 0.5,
          confidence_drift: 0.01,
          cost_to_value_ratio: 2.5,
        },
      },
    ];
    render(<Tiles data={data} sparklines={{}} />);
    const legend = screen.getByTestId("health-legend");
    expect(legend.textContent).toMatch(/Loop Completion/);
    expect(legend.textContent).toMatch(/Review Latency/);
    expect(legend.textContent).toMatch(/Pattern Promotion/);
    expect(legend.textContent).toMatch(/Confidence Drift/);
    expect(legend.textContent).toMatch(/Cost \/ Value/);
  });
});
