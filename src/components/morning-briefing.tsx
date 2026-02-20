import Link from "next/link";
import type { Insight } from "@/lib/insight-engine";
import type { ReviewStats, CrawlHealth } from "@/lib/crawler-db";
import { timeAgo } from "@/lib/format";

interface MorningBriefingProps {
  insights: Insight[];
  reviewStats: ReviewStats;
  crawlHealth: CrawlHealth;
  userName: string;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function formatDate(): string {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

const SEVERITY_BORDER: Record<string, string> = {
  critical: "border-l-red-500",
  warning: "border-l-amber-400",
  info: "border-l-blue-400",
  positive: "border-l-emerald-400",
};

const SEVERITY_BG: Record<string, string> = {
  critical: "bg-red-50/40 dark:bg-red-950/20",
  warning: "bg-amber-50/40 dark:bg-amber-950/20",
  info: "bg-transparent",
  positive: "bg-emerald-50/30 dark:bg-emerald-950/15",
};

const SEVERITY_TEXT: Record<string, string> = {
  critical: "text-red-700 dark:text-red-400",
  warning: "text-amber-700 dark:text-amber-400",
  info: "text-blue-700 dark:text-blue-400",
  positive: "text-emerald-700 dark:text-emerald-400",
};

function HealthDot({ status }: { status: "green" | "amber" | "red" }) {
  const colors = {
    green: "bg-emerald-500",
    amber: "bg-amber-500",
    red: "bg-red-500",
  };
  return (
    <span className={`inline-block w-2 h-2 rounded-full ${colors[status]}`} />
  );
}

function getCrawlStatus(rate: number): "green" | "amber" | "red" {
  if (rate >= 0.9) return "green";
  if (rate >= 0.7) return "amber";
  return "red";
}

export function MorningBriefing({
  insights,
  reviewStats,
  crawlHealth,
  userName,
}: MorningBriefingProps) {
  const topInsights = insights.slice(0, 3);
  const total =
    reviewStats.pending +
    reviewStats.staged +
    reviewStats.flagged +
    reviewStats.approved +
    reviewStats.rejected;
  const approvedPct = total > 0 ? (reviewStats.approved / total) * 100 : 0;
  const stagedPct = total > 0 ? (reviewStats.staged / total) * 100 : 0;
  const flaggedPct = total > 0 ? (reviewStats.flagged / total) * 100 : 0;
  const needsReview = reviewStats.staged + reviewStats.flagged + reviewStats.pending;

  return (
    <div className="admin-card overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-gray-100 dark:divide-white/[0.06]">
        {/* Left: Greeting + Insights */}
        <div className="lg:col-span-8 p-5">
          <div className="flex items-center gap-3 mb-1">
            <h2 className="text-base font-medium text-gray-900 dark:text-gray-100">
              {getGreeting()}, {userName}
            </h2>
            <HealthDot
              status={
                crawlHealth.total_crawled_24h === 0
                  ? "red"
                  : getCrawlStatus(crawlHealth.success_rate_24h)
              }
            />
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-4">
            {formatDate()}
          </p>

          {topInsights.length > 0 ? (
            <div className="space-y-2">
              {topInsights.map((insight) => (
                <div
                  key={insight.id}
                  className={`border-l-[3px] ${SEVERITY_BORDER[insight.severity]} ${SEVERITY_BG[insight.severity]} rounded-r-md px-3 py-2`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {insight.headline}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
                        {insight.body}
                      </p>
                    </div>
                    {insight.metric && (
                      <span
                        className={`text-sm font-bold tabular-nums shrink-0 ${SEVERITY_TEXT[insight.severity]}`}
                      >
                        {insight.metric}
                      </span>
                    )}
                  </div>
                  {insight.action && (
                    <Link
                      href={insight.action.href}
                      className={`inline-block mt-1 text-xs font-semibold ${SEVERITY_TEXT[insight.severity]} hover:underline`}
                    >
                      {insight.action.label} &rarr;
                    </Link>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 dark:text-gray-500">
              All systems operating normally.
            </p>
          )}
        </div>

        {/* Right: Review Progress + Crawl Health */}
        <div className="lg:col-span-4 p-5 space-y-4">
          {/* Review Progress */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                Review Pipeline
              </span>
              {needsReview > 0 && (
                <Link
                  href="/admin/review?status=flagged"
                  className="text-[10px] font-semibold text-orange-600 dark:text-orange-400 hover:underline"
                >
                  {needsReview} pending
                </Link>
              )}
            </div>
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-xl font-bold tabular-nums text-gray-900 dark:text-gray-100">
                {reviewStats.approved.toLocaleString()}
              </span>
              <span className="text-xs text-gray-400 dark:text-gray-500">
                of {total.toLocaleString()} approved
              </span>
            </div>
            <div className="w-full bg-gray-100 dark:bg-white/[0.06] rounded-full h-1.5 flex overflow-hidden">
              {approvedPct > 0 && (
                <div
                  className="bg-emerald-500 h-full"
                  style={{ width: `${approvedPct}%` }}
                />
              )}
              {stagedPct > 0 && (
                <div
                  className="bg-blue-400 h-full"
                  style={{ width: `${stagedPct}%` }}
                />
              )}
              {flaggedPct > 0 && (
                <div
                  className="bg-orange-400 h-full"
                  style={{ width: `${flaggedPct}%` }}
                />
              )}
            </div>
            <div className="flex gap-3 mt-1.5">
              <Link
                href="/admin/review?status=approved"
                className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-600"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                {reviewStats.approved.toLocaleString()}
              </Link>
              <Link
                href="/admin/review?status=staged"
                className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-600"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                {reviewStats.staged.toLocaleString()}
              </Link>
              <Link
                href="/admin/review?status=flagged"
                className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-600"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />
                {reviewStats.flagged.toLocaleString()}
              </Link>
            </div>
          </div>

          {/* Crawl Health */}
          <div className="pt-3 border-t border-gray-100 dark:border-white/[0.06]">
            <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
              Crawl Health
            </span>
            <div className="mt-2 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
                  <HealthDot
                    status={
                      crawlHealth.last_run_status === "completed"
                        ? "green"
                        : "amber"
                    }
                  />
                  Last crawl
                </span>
                <span className="font-medium text-gray-700 dark:text-gray-300">
                  {crawlHealth.last_run_at
                    ? timeAgo(crawlHealth.last_run_at)
                    : "Never"}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
                  <HealthDot
                    status={getCrawlStatus(crawlHealth.success_rate_24h)}
                  />
                  Success (24h)
                </span>
                <span className="font-medium tabular-nums text-gray-700 dark:text-gray-300">
                  {(crawlHealth.success_rate_24h * 100).toFixed(0)}%
                  <span className="text-gray-400 dark:text-gray-500 ml-1">
                    ({crawlHealth.total_crawled_24h})
                  </span>
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
                  <HealthDot
                    status={getCrawlStatus(crawlHealth.avg_confidence)}
                  />
                  Confidence
                </span>
                <span className="font-medium tabular-nums text-gray-700 dark:text-gray-300">
                  {(crawlHealth.avg_confidence * 100).toFixed(0)}%
                </span>
              </div>
              {crawlHealth.institutions_failing > 0 && (
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-red-500 dark:text-red-400">
                    <HealthDot status="red" />
                    Failing
                  </span>
                  <Link
                    href="/admin/peers"
                    className="font-medium text-red-600 dark:text-red-400 hover:underline"
                  >
                    {crawlHealth.institutions_failing} institutions
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
