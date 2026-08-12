import type { DarwinStatus } from "../types";

export function BudgetGauge({ status }: { status: DarwinStatus }) {
  const metrics = [
    {
      label: "Waiting to classify",
      value: status.pending.toLocaleString("en-US"),
      detail: "Raw fee rows",
      tone: "text-gray-900 dark:text-gray-100",
    },
    {
      label: "Promoted today",
      value: status.today_promoted.toLocaleString("en-US"),
      detail: "Verified fees",
      tone: "text-emerald-700 dark:text-emerald-400",
    },
    {
      label: "Spend today",
      value: `$${status.today_cost_usd.toFixed(2)}`,
      detail: "Classifier calls",
      tone: "text-gray-900 dark:text-gray-100",
    },
    {
      label: "Run efficiency",
      value: status.recent_run_avg_tokens_per_row == null
        ? "No recent run"
        : Math.round(status.recent_run_avg_tokens_per_row).toLocaleString("en-US"),
      detail: status.recent_run_avg_tokens_per_row == null ? "Tokens unavailable" : "Avg tokens / row",
      tone: "text-gray-900 dark:text-gray-100",
    },
  ];

  return (
    <div className="grid gap-x-6 gap-y-4 border-y border-black/[0.06] py-4 sm:grid-cols-2 xl:grid-cols-4 dark:border-white/[0.06]">
      {metrics.map((metric) => (
        <div key={metric.label}>
          <p className="admin-label">{metric.label}</p>
          <p className={`mt-2 text-lg font-semibold tabular-nums tracking-tight ${metric.tone}`}>
            {metric.value}
          </p>
          <p className="admin-meta mt-1">{metric.detail}</p>
        </div>
      ))}
    </div>
  );
}
