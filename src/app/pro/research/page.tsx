export const dynamic = "force-dynamic";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { canAccessPremium, getResearchQueryLimit } from "@/lib/access";
import { getHamilton } from "@/lib/research/agents";
import {
  ensureResearchTables,
  getUsageStats,
  listConversations,
} from "@/lib/research/history";
import { getPublicStats, getDataFreshness } from "@/lib/crawler-db";
import { TAXONOMY_COUNT } from "@/lib/fee-taxonomy";
import { AnalystHub } from "./analyst-hub";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI Research | Bank Fee Index",
};

export default async function ProResearchPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?from=/pro/research");

  if (!canAccessPremium(user)) {
    redirect("/subscribe");
  }

  await ensureResearchTables();

  const agent = await getHamilton("pro");

  const usage = await getUsageStats(user.id);
  const dailyLimit = getResearchQueryLimit(user);
  const stats = await getPublicStats();
  const freshness = await getDataFreshness();

  let conversations: { id: number; title: string; updatedAt: string }[] = [];
  try {
    const raw = await listConversations(user.id, "fee-analyst", 20);
    conversations = raw.map((c) => ({
      id: c.id,
      title: c.title ?? "Untitled",
      updatedAt: c.updated_at,
    }));
  } catch {
    // history tables may not exist yet
  }

  const lastUpdated = freshness.last_crawl_at
    ? new Date(freshness.last_crawl_at).toLocaleDateString("en-US", {
        month: "short",
        year: "numeric",
      })
    : "---";

  return (
    <div>
      {/* Dataset info bar */}
      <div className="border-b border-[#E8DFD1] bg-[#FFFDF9]">
        <div className="mx-auto max-w-[1600px] px-4 py-2 flex items-center gap-4 text-[11px] overflow-x-auto scrollbar-none">
          <span
            className="shrink-0 font-medium text-[#1A1815]"
            style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
          >
            Dataset: Bank Fee Index
          </span>
          <span className="shrink-0 h-3 w-px bg-[#D4C9BA]" />
          <span className="shrink-0 text-[#A09788]">
            <span className="tabular-nums font-medium text-[#5A5347]">
              {stats.total_observations.toLocaleString()}
            </span>{" "}
            observations
          </span>
          <span className="shrink-0 text-[#A09788]">
            <span className="tabular-nums font-medium text-[#5A5347]">
              {stats.total_institutions.toLocaleString()}
            </span>{" "}
            institutions
          </span>
          <span className="shrink-0 text-[#A09788]">
            {TAXONOMY_COUNT} fee types
          </span>
          <span className="shrink-0 ml-auto text-[#D4C9BA]">
            Updated {lastUpdated}
          </span>
        </div>
      </div>

      {/* Analyst Hub */}
      <AnalystHub
        agentId="fee-analyst"
        agentName={agent.name}
        conversations={conversations}
        queriesToday={usage.today}
        dailyLimit={dailyLimit}
        queryMonth={usage.month}
      />
    </div>
  );
}
