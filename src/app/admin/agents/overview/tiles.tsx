"use client";

import { Sparkline } from "@/components/sparkline";
import {
  HEALTH_METRICS,
  HEALTH_METRIC_LABELS,
  type AgentHealthTile,
  type HealthMetric,
} from "@/lib/crawler-db/agent-console-types";

type Props = {
  data: AgentHealthTile[];
  /** Keyed by `${agent_name}:${metric}` → array of values (oldest → newest). */
  sparklines: Record<string, number[]>;
};

const EM_DASH = "\u2014";

function formatMetric(metric: HealthMetric, value: number | null): string {
  if (value === null) return EM_DASH;
  switch (metric) {
    case "loop_completion_rate":
    case "pattern_promotion_rate":
      return `${(value * 100).toFixed(1)}%`;
    case "review_latency_seconds":
      return value >= 60
        ? `${(value / 60).toFixed(1)}m`
        : `${value.toFixed(0)}s`;
    case "confidence_drift":
      return value.toFixed(3);
    case "cost_to_value_ratio":
      return value.toFixed(2);
  }
}

export function Tiles({ data, sparklines }: Props) {
  if (data.length === 0) {
    return (
      <div className="admin-card p-6 text-center text-sm text-gray-500 dark:text-gray-400">
        No agent health data available yet. Run
        <code className="mx-1 font-mono text-[11px] bg-gray-100 dark:bg-white/[0.05] px-1.5 py-0.5 rounded">
          SELECT refresh_agent_health_rollup()
        </code>
        after agents emit events.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {data.map((agent) => (
        <section key={agent.agent_name} className="admin-card p-4">
          <header className="flex items-baseline justify-between mb-3">
            <h2 className="text-sm font-bold tracking-tight text-gray-900 dark:text-gray-100">
              {agent.agent_name}
            </h2>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              {agent.bucket_start
                ? `Last bucket: ${agent.bucket_start.slice(0, 16).replace("T", " ")}`
                : "No recent bucket"}
            </span>
          </header>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
            {HEALTH_METRICS.map((metric) => {
              const value = agent.metrics[metric];
              const key = `${agent.agent_name}:${metric}`;
              const history = sparklines[key] ?? [];
              return (
                <div
                  key={metric}
                  data-testid="agent-tile"
                  data-metric={metric}
                  data-agent={agent.agent_name}
                  className="rounded-md border border-black/[0.06] dark:border-white/[0.06] bg-gray-50/40 dark:bg-white/[0.02] p-3 flex flex-col gap-1"
                >
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    {HEALTH_METRIC_LABELS[metric]}
                  </span>
                  <span className="text-lg font-bold tabular-nums text-gray-900 dark:text-gray-100">
                    {formatMetric(metric, value)}
                  </span>
                  <span className="text-[11px] text-gray-500 dark:text-gray-400">
                    {agent.agent_name}
                  </span>
                  <div className="mt-1 text-gray-500 dark:text-gray-400" data-testid="sparkline-slot">
                    {history.length >= 2 ? (
                      <span data-testid="sparkline">
                        <Sparkline data={history} />
                      </span>
                    ) : (
                      <span className="text-[10px] text-gray-300 dark:text-gray-600">
                        No history
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
