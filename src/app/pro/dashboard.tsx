import Link from "next/link";
import {
  getNationalIndexCached,
  getPublicStats,
  getDataFreshness,
  getPeerIndex,
} from "@/lib/crawler-db";
import {
  getDisplayName,
  TAXONOMY_COUNT,
} from "@/lib/fee-taxonomy";
import { formatAmount } from "@/lib/format";
import { STATE_TO_DISTRICT, DISTRICT_NAMES } from "@/lib/fed-districts";
import { STATE_NAMES } from "@/lib/us-states";
import { ensureResearchTables, listConversations, getUsageStats } from "@/lib/research/history";
import { getResearchQueryLimit } from "@/lib/access";
import { timeAgo } from "@/lib/format";

const SPOTLIGHT_CATS = ["overdraft", "nsf", "monthly_maintenance", "atm_non_network", "wire_domestic_outgoing", "card_foreign_txn"];

interface DashboardProps {
  user: {
    id: number;
    institution_name: string | null;
    state_code: string | null;
    email: string | null;
    username: string | null;
    role: string;
  };
}

export async function ProDashboard({ user }: DashboardProps) {
  const allEntries = await getNationalIndexCached();
  const stats = await getPublicStats();
  const freshness = await getDataFreshness();
  const district = user.state_code ? STATE_TO_DISTRICT[user.state_code] : null;
  const districtName = district ? DISTRICT_NAMES[district] : null;
  const stateName = user.state_code ? STATE_NAMES[user.state_code] : null;

  const lastUpdated = freshness.last_crawl_at
    ? new Date(freshness.last_crawl_at).toLocaleDateString("en-US", { month: "short", year: "numeric" })
    : "---";

  const spotlightEntries = SPOTLIGHT_CATS
    .map((cat) => allEntries.find((e) => e.fee_category === cat))
    .filter(Boolean);

  // State comparison
  let stateComparison: { category: string; stateMedian: number; nationalMedian: number; delta: number }[] = [];
  if (user.state_code) {
    const stateIndex = await getPeerIndex({ state_code: user.state_code });
    stateComparison = SPOTLIGHT_CATS.slice(0, 4).map((cat) => {
      const national = allEntries.find((e) => e.fee_category === cat);
      const state = stateIndex.find((e) => e.fee_category === cat);
      if (!national?.median_amount || !state?.median_amount) return null;
      return {
        category: cat,
        stateMedian: state.median_amount,
        nationalMedian: national.median_amount,
        delta: ((state.median_amount - national.median_amount) / national.median_amount) * 100,
      };
    }).filter(Boolean) as typeof stateComparison;
  }

  // Research usage
  let usage = { today: 0, month: 0, total_cost_cents: 0 };
  let recentConversations: { id: number; title: string | null; updated_at: string }[] = [];
  try {
    await ensureResearchTables();
    usage = await getUsageStats(user.id);
    recentConversations = await listConversations(user.id, undefined, 5);
  } catch {
    // research tables may not exist
  }
  const dailyLimit = getResearchQueryLimit(user as Parameters<typeof getResearchQueryLimit>[0]);

  const userInitial = (user.institution_name?.[0] || user.email?.[0] || user.username?.[0] || "P").toUpperCase();

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      {/* Welcome */}
      <div className="flex items-start justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-warm-900 text-[16px] font-bold text-white shrink-0">
            {userInitial}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="h-px w-6 bg-terra/40" />
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-terra/60">
                Pro Dashboard
              </span>
            </div>
            <h1
              className="mt-1 text-[1.5rem] sm:text-[1.75rem] leading-[1.15] tracking-[-0.02em] text-warm-900"
              style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
            >
              {user.institution_name || "Welcome back"}
            </h1>
            <p className="mt-1 text-[13px] text-warm-600">
              {stats.total_institutions.toLocaleString()} institutions &middot; {TAXONOMY_COUNT} fee categories &middot; Updated {lastUpdated}
              {stateName && <> &middot; {stateName}</>}
            </p>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 mb-10">
        {[
          { label: "Market Explorer", href: "/pro/market", icon: "M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" },
          { label: "Peer Builder", href: "/pro/peers", icon: "M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" },
          { label: "Categories", href: "/pro/categories", icon: "M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" },
          { label: "Districts", href: "/pro/districts", icon: "M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" },
          { label: "Data", href: "/pro/data", icon: "M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" },
          { label: "AI Research", href: "/pro/research", icon: "M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" },
          { label: "Export CSV", href: "/api/v1/fees?format=csv", icon: "M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" },
        ].map((action) => (
          <Link
            key={action.label}
            href={action.href}
            className="group rounded-xl border border-warm-200/80 bg-white/70 backdrop-blur-sm px-3 py-3 text-center transition-all duration-300 hover:border-terra/20 hover:shadow-md hover:shadow-terra/5 no-underline"
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 mx-auto text-terra/60 group-hover:text-terra transition-colors" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={action.icon} />
            </svg>
            <span className="block mt-1.5 text-[11px] font-medium text-warm-700 group-hover:text-terra transition-colors">
              {action.label}
            </span>
          </Link>
        ))}
      </div>

      {/* Row 1: research usage + recent conversations */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-10">
        {/* Usage */}
        <div className="rounded-xl border border-warm-200/80 bg-white/70 backdrop-blur-sm p-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-warm-500 mb-4">
            AI Research Usage
          </p>
          <div className="space-y-3">
            <div className="flex justify-between text-[13px]">
              <span className="text-warm-600">Queries today</span>
              <span className="font-medium tabular-nums text-warm-900">{usage.today} / {dailyLimit}</span>
            </div>
            <div className="flex justify-between text-[13px]">
              <span className="text-warm-600">This month</span>
              <span className="font-medium tabular-nums text-warm-900">{usage.month}</span>
            </div>
          </div>
          <Link
            href="/pro/research"
            className="mt-4 inline-flex items-center gap-1.5 text-[12px] font-medium text-terra/70 hover:text-terra transition-colors no-underline"
          >
            Open Analyst Hub &rarr;
          </Link>
        </div>

        {/* Recent conversations */}
        <div className="lg:col-span-2 rounded-xl border border-warm-200/80 bg-white/70 backdrop-blur-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-warm-500">
              Recent Research
            </p>
            <Link href="/pro/research" className="text-[11px] font-medium text-terra/70 hover:text-terra transition-colors no-underline">
              View all &rarr;
            </Link>
          </div>
          {recentConversations.length > 0 ? (
            <div className="space-y-2">
              {recentConversations.map((c) => (
                <div key={c.id} className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-warm-100 transition-colors">
                  <span className="text-[13px] text-warm-900 truncate mr-4">
                    {c.title || "Untitled conversation"}
                  </span>
                  <span className="text-[11px] text-warm-500 shrink-0 tabular-nums">
                    {timeAgo(c.updated_at)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-warm-600 py-4 text-center">
              No research conversations yet.{" "}
              <Link href="/pro/research" className="text-terra hover:underline">Start one</Link>
            </p>
          )}
        </div>
      </div>

      {/* Row 2: spotlight fees + state comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* National spotlight */}
        <div className="rounded-xl border border-warm-200/80 bg-white/70 backdrop-blur-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-warm-200/60 bg-warm-100/60 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-warm-500">
              National Fee Medians
            </span>
            <Link href="/pro/market" className="text-[11px] font-medium text-terra/70 hover:text-terra transition-colors no-underline">
              Market Explorer &rarr;
            </Link>
          </div>
          <div className="divide-y divide-warm-200/40">
            {spotlightEntries.map((entry) => (
              <Link
                key={entry!.fee_category}
                href={`/fees/${entry!.fee_category}`}
                className="flex items-center justify-between px-5 py-3 hover:bg-warm-100/60 transition-colors no-underline"
              >
                <span className="text-[13px] text-warm-900 font-medium">
                  {getDisplayName(entry!.fee_category)}
                </span>
                <span
                  className="text-[16px] font-light tabular-nums text-warm-900"
                  style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
                >
                  {formatAmount(entry!.median_amount)}
                </span>
              </Link>
            ))}
          </div>
        </div>

        {/* State comparison */}
        {stateComparison.length > 0 ? (
          <div className="rounded-xl border border-warm-200/80 bg-white/70 backdrop-blur-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-warm-200/60 bg-warm-100/60 flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-warm-500">
                {stateName} vs National
              </span>
              <Link href={`/research/state/${user.state_code}`} className="text-[11px] font-medium text-terra/70 hover:text-terra transition-colors no-underline">
                State report &rarr;
              </Link>
            </div>
            <div className="divide-y divide-warm-200/40">
              {stateComparison.map((row) => (
                <div key={row.category} className="flex items-center justify-between px-5 py-3">
                  <span className="text-[13px] text-warm-900">
                    {getDisplayName(row.category)}
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="text-[13px] tabular-nums text-warm-700">
                      {formatAmount(row.stateMedian)}
                    </span>
                    <span
                      className={`text-[11px] font-semibold tabular-nums ${
                        row.delta > 2 ? "text-red-500" : row.delta < -2 ? "text-emerald-600" : "text-warm-500"
                      }`}
                    >
                      {row.delta > 0 ? "+" : ""}{row.delta.toFixed(0)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-warm-200/80 bg-white/70 backdrop-blur-sm p-6 flex flex-col items-center justify-center text-center">
            <p className="text-[13px] text-warm-600">
              Add your state in{" "}
              <Link href="/account" className="text-terra hover:underline">Account Settings</Link>{" "}
              to see state-level comparisons.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
