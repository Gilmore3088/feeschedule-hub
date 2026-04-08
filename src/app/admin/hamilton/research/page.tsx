export const dynamic = "force-dynamic";
import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { getHamilton } from "@/lib/research/agents";
import { ensureResearchTables, getUsageStats } from "@/lib/research/history";

export default async function ResearchHubPage() {
  const user = await requireAuth("view");
  await ensureResearchTables();

  // Build agent cards for pro and admin roles
  const [proAgent, adminAgent] = await Promise.all([
    getHamilton("pro"),
    getHamilton("admin"),
  ]);
  const agents = [proAgent, adminAgent];
  const usage = await getUsageStats(user.id);

  const roleOrder: Record<string, number> = { viewer: 0, premium: 1, analyst: 2, admin: 3 };
  const userLevel = roleOrder[user.role] ?? 0;

  return (
    <div className="admin-content space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-gray-900">
          Research Hub
        </h1>
        <p className="mt-1 text-[13px] text-gray-500">
          AI-powered research agents with access to the Bank Fee Index database.
          Ask questions in natural language.
        </p>
      </div>

      {/* Usage summary */}
      <div className="flex items-end gap-4">
        <div className="admin-card px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
            Queries Today
          </p>
          <p className="mt-0.5 text-lg font-bold tabular-nums text-gray-900">
            {usage.today}
          </p>
        </div>
        <div className="admin-card px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
            This Month
          </p>
          <p className="mt-0.5 text-lg font-bold tabular-nums text-gray-900">
            {usage.month}
          </p>
        </div>
        <div className="admin-card px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
            Est. Cost
          </p>
          <p className="mt-0.5 text-lg font-bold tabular-nums text-gray-900">
            ${(usage.total_cost_cents / 100).toFixed(2)}
          </p>
        </div>
        <Link
          href="/admin/research/usage"
          className="mb-0.5 text-[12px] font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
        >
          View detailed usage →
        </Link>
      </div>

      {/* Agent cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        {agents.map((agent) => {
          const requiredLevel =
            roleOrder[agent.requiredRole ?? "viewer"];
          const hasAccess = userLevel >= requiredLevel;

          return (
            <div
              key={agent.id}
              className={`admin-card px-5 py-4 ${!hasAccess ? "opacity-50" : ""}`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-sm font-bold text-gray-800">
                    {agent.name}
                  </h2>
                  <p className="mt-1 text-[12px] text-gray-500">
                    {agent.description}
                  </p>
                </div>
                {agent.requiredRole === "admin" && (
                  <span className="shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600">
                    Admin
                  </span>
                )}
              </div>

              <div className="mt-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                  Example Questions
                </p>
                <ul className="mt-1.5 space-y-1">
                  {agent.exampleQuestions.slice(0, 3).map((q, i) => (
                    <li
                      key={i}
                      className="text-[11px] text-gray-500 leading-relaxed"
                    >
                      &ldquo;{q}&rdquo;
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-4">
                {hasAccess ? (
                  <Link
                    href="/admin/hamilton/research/hamilton"
                    className="inline-block rounded-md bg-gray-900 px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-gray-800"
                  >
                    Open Agent
                  </Link>
                ) : (
                  <span className="text-[11px] text-gray-400">
                    Requires {agent.requiredRole} role
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
