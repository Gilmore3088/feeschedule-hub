import Link from "next/link";
import type { PipelineStats } from "@/lib/crawler-db/pipeline";
import { timeAgo } from "@/lib/format";

interface HealthTabProps {
  stats: PipelineStats;
  quality: {
    uncategorized_fees: number;
    null_amounts: number;
    duplicate_fees: { fee_name: string; count: number }[];
  };
  lastCrawlAt: string | null;
  activeJobCount: number;
  pendingReviewCount: number;
}

export function HealthTab({ stats, quality, lastCrawlAt, activeJobCount, pendingReviewCount }: HealthTabProps) {
  const t = stats.total_institutions || 1;

  // Funnel data
  const funnel = [
    { label: "Total Institutions", count: stats.total_institutions, pct: 100, color: "bg-gray-300 dark:bg-gray-600" },
    { label: "With Website", count: stats.with_website, pct: Math.round((stats.with_website / t) * 100), color: "bg-blue-400" },
    { label: "With Fee URL", count: stats.with_fee_url, pct: Math.round((stats.with_fee_url / t) * 100), color: "bg-amber-400" },
    { label: "With Fees", count: stats.with_fees, pct: Math.round((stats.with_fees / t) * 100), color: "bg-emerald-400" },
    { label: "Approved", count: stats.with_approved, pct: Math.round((stats.with_approved / t) * 100), color: "bg-emerald-600" },
  ];

  // Problems: only non-zero values
  const problems = [
    stats.failing_count > 0 && {
      label: "Failing institutions",
      count: stats.failing_count,
      severity: "red" as const,
      fix: "/admin/pipeline?tab=coverage&status=failing",
      desc: ">3 consecutive failures",
    },
    stats.stale_count > 0 && {
      label: "Stale data",
      count: stats.stale_count,
      severity: "amber" as const,
      fix: "/admin/pipeline?tab=coverage&status=stale",
      desc: ">90 days since crawl",
    },
    quality.uncategorized_fees > 0 && {
      label: "Uncategorized fees",
      count: quality.uncategorized_fees,
      severity: "amber" as const,
      fix: "/admin/review?status=staged",
      desc: "fees without category",
    },
    quality.duplicate_fees.length > 0 && {
      label: "Duplicate fees",
      count: quality.duplicate_fees.length,
      severity: "red" as const,
      fix: "/admin/review",
      desc: "duplicate fee names per institution",
    },
    quality.null_amounts > 100 && {
      label: "Null amounts",
      count: quality.null_amounts,
      severity: "gray" as const,
      fix: "/admin/review?status=flagged",
      desc: "non-free fees with no amount",
    },
  ].filter(Boolean) as { label: string; count: number; severity: "red" | "amber" | "gray"; fix: string; desc: string }[];

  const severityColors = {
    red: "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-900/40",
    amber: "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border-amber-100 dark:border-amber-900/40",
    gray: "text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-white/[0.03] border-gray-100 dark:border-white/5",
  };

  return (
    <div className="space-y-5">
      {/* KPI Strip — 5 numbers, no borders, just data */}
      <div className="flex items-baseline gap-8 flex-wrap">
        <KPI label="Last Crawl" value={lastCrawlAt ? timeAgo(lastCrawlAt) : "Never"} />
        <KPI
          label="Coverage"
          value={`${Math.round((stats.with_fees / t) * 100)}%`}
          sub={`${stats.with_fees.toLocaleString()} of ${stats.total_institutions.toLocaleString()}`}
        />
        <KPI
          label="Approved"
          value={stats.with_approved.toLocaleString()}
          sub="institutions"
        />
        <KPI
          label="Pending Review"
          value={pendingReviewCount.toLocaleString()}
          href="/admin/review"
        />
        <KPI
          label="Active Jobs"
          value={activeJobCount.toString()}
          href="/admin/pipeline?tab=ops"
          highlight={activeJobCount > 0}
        />
      </div>

      {/* Problems — only non-zero. Hidden when everything is green. */}
      {problems.length > 0 ? (
        <div className="space-y-1.5">
          {problems.map((p) => (
            <Link
              key={p.label}
              href={p.fix}
              className={`flex items-center justify-between px-3 py-2 rounded-lg border text-[12px] transition-colors hover:opacity-80 ${severityColors[p.severity]}`}
            >
              <div className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className={`w-1.5 h-1.5 rounded-full ${
                    p.severity === "red" ? "bg-red-500" : p.severity === "amber" ? "bg-amber-500" : "bg-gray-400"
                  }`}
                />
                <span className="sr-only">{p.severity === "red" ? "Critical" : p.severity === "amber" ? "Warning" : "Info"}</span>
                <span className="font-semibold">{p.count.toLocaleString()}</span>
                <span>{p.label}</span>
                <span className="text-[10px] opacity-60">{p.desc}</span>
              </div>
              <span className="text-[10px] font-medium opacity-60">Fix &rarr;</span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-900/40 text-emerald-700 dark:text-emerald-300 text-[12px]">
          <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          All systems healthy
        </div>
      )}

      {/* Coverage Funnel — compact */}
      <div className="admin-card p-4">
        <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Coverage Funnel</h3>
        <div className="space-y-2">
          {funnel.map((step) => (
            <div key={step.label}>
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[11px] text-gray-600 dark:text-gray-300">{step.label}</span>
                <span className="text-[11px] font-bold tabular-nums text-gray-900 dark:text-gray-100">
                  {step.count.toLocaleString()}
                  <span className="text-gray-400 font-normal ml-1">{step.pct}%</span>
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-gray-100 dark:bg-white/5 overflow-hidden">
                <div className={`h-full rounded-full ${step.color} transition-all`} style={{ width: `${step.pct}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function KPI({
  label,
  value,
  sub,
  href,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  href?: string;
  highlight?: boolean;
}) {
  const content = (
    <div>
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
      <p className={`text-xl font-bold tabular-nums mt-0.5 ${
        highlight ? "text-blue-600 dark:text-blue-400" : "text-gray-900 dark:text-gray-100"
      }`}>
        {value}
      </p>
      {sub && <p className="text-[10px] text-gray-400">{sub}</p>}
    </div>
  );

  if (href) {
    return <Link href={href} className="hover:opacity-70 transition-opacity">{content}</Link>;
  }
  return content;
}
