import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getAgent } from "@/lib/research/agents";
import { ensureResearchTables, getUsageStats } from "@/lib/research/history";
import { ResearchChat } from "@/app/admin/research/[agentId]/research-chat";

export default async function ProResearchPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?redirect=/pro/research");

  const roleOrder: Record<string, number> = { viewer: 0, premium: 1, analyst: 2, admin: 3 };
  if ((roleOrder[user.role] ?? 0) < 1) {
    redirect("/login?redirect=/pro/research");
  }

  ensureResearchTables();

  const agent = getAgent("fee-analyst");
  if (!agent) redirect("/pro");

  const usage = getUsageStats(user.id);
  const dailyLimit = user.role === "premium" ? 20 : user.role === "analyst" ? 50 : 200;

  return (
    <div className="space-y-6">
      {/* Usage bar */}
      <div className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-5 py-3">
        <div className="flex items-center gap-6">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
              Queries Today
            </p>
            <p className="mt-0.5 text-lg font-bold tabular-nums text-white">
              {usage.today}
              <span className="text-[11px] font-normal text-slate-600"> / {dailyLimit}</span>
            </p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
              This Month
            </p>
            <p className="mt-0.5 text-lg font-bold tabular-nums text-white">
              {usage.month}
            </p>
          </div>
        </div>
        <div className="text-[11px] text-slate-600">
          {user.display_name} &middot; {user.role}
        </div>
      </div>

      {/* Agent chat */}
      <div className="rounded-lg border border-white/[0.06] bg-[#0c0f1a] overflow-hidden">
        <ResearchChat
          agentId="fee-analyst"
          agentName={agent.name}
          agentDescription={agent.description}
          exampleQuestions={agent.exampleQuestions}
          conversations={[]}
        />
      </div>
    </div>
  );
}
