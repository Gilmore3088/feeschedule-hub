import Link from "next/link";
import type { CrawlHealth } from "@/lib/crawler-db";
import { timeAgo } from "@/lib/format";

interface CrawlStatusStripProps {
  health: CrawlHealth;
}

function StatusDot({ status }: { status: "green" | "amber" | "red" }) {
  const colors = {
    green: "bg-green-500",
    amber: "bg-amber-500",
    red: "bg-red-500",
  };
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${colors[status]}`}
    />
  );
}

function getHealthStatus(rate: number): "green" | "amber" | "red" {
  if (rate >= 0.9) return "green";
  if (rate >= 0.7) return "amber";
  return "red";
}

export function CrawlStatusStrip({ health }: CrawlStatusStripProps) {
  const successStatus = getHealthStatus(health.success_rate_24h);
  const confStatus = getHealthStatus(health.avg_confidence);

  return (
    <div className="rounded-lg border bg-white px-5 py-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
      <div className="flex items-center gap-2">
        <StatusDot status={health.last_run_status === "completed" ? "green" : "amber"} />
        <span className="text-gray-500">Last crawl</span>
        <span className="font-medium text-gray-900">
          {health.last_run_at ? timeAgo(health.last_run_at) : "Never"}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <StatusDot status={successStatus} />
        <span className="text-gray-500">Success (24h)</span>
        <span className="font-medium text-gray-900">
          {(health.success_rate_24h * 100).toFixed(0)}%
        </span>
        {health.total_crawled_24h > 0 && (
          <span className="text-xs text-gray-400">
            ({health.total_crawled_24h} crawled)
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <StatusDot status={confStatus} />
        <span className="text-gray-500">Avg confidence</span>
        <span className="font-medium text-gray-900">
          {(health.avg_confidence * 100).toFixed(0)}%
        </span>
      </div>

      {health.institutions_failing > 0 && (
        <Link
          href="/admin/peers"
          className="flex items-center gap-2 text-red-600 hover:underline"
        >
          <StatusDot status="red" />
          <span>{health.institutions_failing} failing (&gt;3x)</span>
        </Link>
      )}

      <div className="flex items-center gap-2">
        <span className="text-gray-500">Runs (7d)</span>
        <span className="font-medium text-gray-900">
          {health.crawl_runs_7d}
        </span>
      </div>
    </div>
  );
}
