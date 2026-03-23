import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import {
  ensureResearchTables,
  getUsageDashboard,
} from "@/lib/research/history";
import { getAgent } from "@/lib/research/agents";

export default async function ResearchUsagePage() {
  await requireAuth("view");
  await ensureResearchTables();

  const dashboard = await getUsageDashboard();

  // Pre-resolve agent configs for display
  const agentNames: Record<string, string> = {};
  for (const row of dashboard.by_agent) {
    const config = await getAgent(row.agent_id);
    agentNames[row.agent_id] = config?.name ?? row.agent_id;
  }

  return (
    <div className="admin-content space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-gray-900">
            Research Usage
          </h1>
          <p className="mt-1 text-[13px] text-gray-500">
            Query volume, cost tracking, and usage analytics for AI research
            agents.
          </p>
        </div>
        <Link
          href="/admin/research"
          className="rounded-md border border-gray-200 px-3 py-1.5 text-[12px] font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
        >
          Back to Research Hub
        </Link>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="admin-card px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
            Today
          </p>
          <p className="mt-0.5 text-lg font-bold tabular-nums text-gray-900">
            {dashboard.today_queries}
          </p>
          <p className="text-[11px] text-gray-400">
            ${(dashboard.today_cost_cents / 100).toFixed(2)} est. cost
          </p>
        </div>
        <div className="admin-card px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
            This Month
          </p>
          <p className="mt-0.5 text-lg font-bold tabular-nums text-gray-900">
            {dashboard.month_queries}
          </p>
          <p className="text-[11px] text-gray-400">
            ${(dashboard.month_cost_cents / 100).toFixed(2)} est. cost
          </p>
        </div>
        <div className="admin-card px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
            All Time
          </p>
          <p className="mt-0.5 text-lg font-bold tabular-nums text-gray-900">
            {dashboard.total_queries}
          </p>
          <p className="text-[11px] text-gray-400">
            ${(dashboard.total_cost_cents / 100).toFixed(2)} total cost
          </p>
        </div>
        <div className="admin-card px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
            Daily Budget
          </p>
          <p className="mt-0.5 text-lg font-bold tabular-nums text-gray-900">
            ${(dashboard.today_cost_cents / 100).toFixed(2)}
            <span className="text-[13px] font-normal text-gray-400">
              {" "}
              / $50.00
            </span>
          </p>
          <div className="mt-1.5 h-1.5 w-full rounded-full bg-gray-100 dark:bg-gray-800">
            <div
              className={`h-1.5 rounded-full transition-all ${
                dashboard.today_cost_cents >= 4000
                  ? "bg-red-500"
                  : dashboard.today_cost_cents >= 2500
                    ? "bg-amber-500"
                    : "bg-emerald-500"
              }`}
              style={{
                width: `${Math.min(100, (dashboard.today_cost_cents / 5000) * 100)}%`,
              }}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* By Agent */}
        <div className="admin-card">
          <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-800">
            <h2 className="text-sm font-bold text-gray-800">Usage by Agent</h2>
          </div>
          <div className="px-4 py-3">
            {dashboard.by_agent.length === 0 ? (
              <p className="text-[12px] text-gray-400">No usage data yet</p>
            ) : (
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                    <th className="pb-2">Agent</th>
                    <th className="pb-2 text-right">Queries</th>
                    <th className="pb-2 text-right">Est. Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                  {dashboard.by_agent.map((row) => {
                    return (
                      <tr key={row.agent_id}>
                        <td className="py-2 font-medium text-gray-700 dark:text-gray-300">
                          {agentNames[row.agent_id] ?? row.agent_id}
                        </td>
                        <td className="py-2 text-right tabular-nums text-gray-600 dark:text-gray-400">
                          {row.queries}
                        </td>
                        <td className="py-2 text-right tabular-nums text-gray-600 dark:text-gray-400">
                          ${(row.cost_cents / 100).toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Top Users */}
        <div className="admin-card">
          <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-800">
            <h2 className="text-sm font-bold text-gray-800">
              Top Users (This Month)
            </h2>
          </div>
          <div className="px-4 py-3">
            {dashboard.top_users.length === 0 ? (
              <p className="text-[12px] text-gray-400">No usage data yet</p>
            ) : (
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                    <th className="pb-2">User</th>
                    <th className="pb-2 text-right">Queries</th>
                    <th className="pb-2 text-right">Est. Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                  {dashboard.top_users.map((row) => (
                    <tr key={row.user_id ?? "public"}>
                      <td className="py-2 font-medium text-gray-700 dark:text-gray-300">
                        {row.username}
                      </td>
                      <td className="py-2 text-right tabular-nums text-gray-600 dark:text-gray-400">
                        {row.queries}
                      </td>
                      <td className="py-2 text-right tabular-nums text-gray-600 dark:text-gray-400">
                        ${(row.cost_cents / 100).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Daily breakdown */}
      <div className="admin-card">
        <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-800">
          <h2 className="text-sm font-bold text-gray-800">
            Daily Usage (Last 30 Days)
          </h2>
        </div>
        <div className="px-4 py-3">
          {dashboard.by_day.length === 0 ? (
            <p className="text-[12px] text-gray-400">No usage data yet</p>
          ) : (
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                  <th className="pb-2">Date</th>
                  <th className="pb-2 text-right">Queries</th>
                  <th className="pb-2 text-right">Est. Cost</th>
                  <th className="pb-2 text-right">Avg/Query</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                {dashboard.by_day.map((row) => (
                  <tr key={row.date}>
                    <td className="py-2 text-gray-700 dark:text-gray-300">
                      {new Date(row.date + "T00:00:00").toLocaleDateString(
                        "en-US",
                        { month: "short", day: "numeric" }
                      )}
                    </td>
                    <td className="py-2 text-right tabular-nums text-gray-600 dark:text-gray-400">
                      {row.queries}
                    </td>
                    <td className="py-2 text-right tabular-nums text-gray-600 dark:text-gray-400">
                      ${(row.cost_cents / 100).toFixed(2)}
                    </td>
                    <td className="py-2 text-right tabular-nums text-gray-600 dark:text-gray-400">
                      $
                      {row.queries > 0
                        ? (row.cost_cents / row.queries / 100).toFixed(3)
                        : "0.000"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
