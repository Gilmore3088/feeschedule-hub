import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { canAccessPremium } from "@/lib/access";
import { getAgent } from "@/lib/research/agents";
import { ensureResearchTables, getUsageStats } from "@/lib/research/history";
import { getResearchQueryLimit } from "@/lib/access";
import { ResearchChat } from "@/app/admin/research/[agentId]/research-chat";

export default async function ProResearchPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?from=/pro/research");

  if (!canAccessPremium(user)) {
    redirect("/subscribe");
  }

  ensureResearchTables();

  const agent = getAgent("fee-analyst");
  if (!agent) redirect("/account");

  const usage = getUsageStats(user.id);
  const dailyLimit = getResearchQueryLimit(user);

  return (
    <div className="space-y-6">
      {/* Usage bar */}
      <div className="flex items-center justify-between rounded-xl border border-[#E8DFD1] bg-[#FFFDF9] px-5 py-3">
        <div className="flex items-center gap-6">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#A69D90]">
              Queries Today
            </p>
            <p className="mt-0.5 text-lg font-bold tabular-nums text-[#1A1815]">
              {usage.today}
              <span className="text-[11px] font-normal text-[#A69D90]"> / {dailyLimit}</span>
            </p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#A69D90]">
              This Month
            </p>
            <p className="mt-0.5 text-lg font-bold tabular-nums text-[#1A1815]">
              {usage.month}
            </p>
          </div>
        </div>
        <div className="text-[11px] text-[#A69D90]">
          {user.display_name}
        </div>
      </div>

      {/* Agent chat */}
      <div className="rounded-xl border border-[#E8DFD1] bg-[#FFFDF9] overflow-hidden">
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
