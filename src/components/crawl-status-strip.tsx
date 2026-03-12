import Link from "next/link";
import type { CrawlHealth } from "@/lib/crawler-db";
import { timeAgo } from "@/lib/format";

interface CrawlStatusStripProps {
  health: CrawlHealth;
}

function Indicator({
  status,
  label,
  value,
  sub,
}: {
  status: "green" | "amber" | "red";
  label: string;
  value: string;
  sub?: string;
}) {
  const ring = {
    green: "bg-emerald-500 shadow-[0_0_0_2px_rgba(16,185,129,0.15)]",
    amber: "bg-amber-500 shadow-[0_0_0_2px_rgba(245,158,11,0.15)]",
    red: "bg-red-500 shadow-[0_0_0_2px_rgba(239,68,68,0.15)]",
  };
  return (
    <div className="flex items-center gap-2">
      <span className={`w-[6px] h-[6px] rounded-full ${ring[status]}`} />
      <span className="text-[11px] text-gray-400 dark:text-gray-500">
        {label}
      </span>
      <span className="text-[11px] font-bold text-gray-700 dark:text-gray-300 tabular-nums">
        {value}
      </span>
      {sub && (
        <span className="text-[10px] text-gray-300 dark:text-gray-600 tabular-nums">
          {sub}
        </span>
      )}
    </div>
  );
}

function getHealthStatus(rate: number): "green" | "amber" | "red" {
  if (rate >= 0.9) return "green";
  if (rate >= 0.7) return "amber";
  return "red";
}

export function CrawlStatusStrip({ health }: CrawlStatusStripProps) {
  return (
    <div className="admin-card px-4 py-2.5 flex flex-wrap items-center gap-x-5 gap-y-1.5">
      <Indicator
        status={health.last_run_status === "completed" ? "green" : "amber"}
        label="Last crawl"
        value={health.last_run_at ? timeAgo(health.last_run_at) : "Never"}
      />
      <Indicator
        status={getHealthStatus(health.success_rate_24h)}
        label="24h"
        value={`${(health.success_rate_24h * 100).toFixed(0)}%`}
        sub={
          health.total_crawled_24h > 0
            ? `(${health.total_crawled_24h})`
            : undefined
        }
      />
      <Indicator
        status={getHealthStatus(health.avg_confidence)}
        label="Conf"
        value={`${(health.avg_confidence * 100).toFixed(0)}%`}
      />

      {health.institutions_failing > 0 && (
        <Link
          href="/admin/peers"
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
        >
          <span className="w-[6px] h-[6px] rounded-full bg-red-500 shadow-[0_0_0_2px_rgba(239,68,68,0.15)]" />
          <span className="text-[11px] font-bold text-red-600 dark:text-red-400 tabular-nums">
            {health.institutions_failing} failing
          </span>
        </Link>
      )}

      <div className="flex items-center gap-2">
        <span className="text-[11px] text-gray-400 dark:text-gray-500">
          7d runs
        </span>
        <span className="text-[11px] font-bold text-gray-700 dark:text-gray-300 tabular-nums">
          {health.crawl_runs_7d}
        </span>
      </div>
    </div>
  );
}
