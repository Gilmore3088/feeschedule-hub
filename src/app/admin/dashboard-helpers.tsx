import Link from "next/link";
import { Sparkline } from "@/components/sparkline";

export function HealthTile({
  label,
  value,
  sub,
  highlight,
  href,
  global,
  delta,
  trend,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
  href?: string;
  global?: boolean;
  delta?: number;
  trend?: number[];
}) {
  const content = (
    <div
      className={`admin-card px-4 py-3 transition-all ${
        href ? "hover:shadow-md hover:border-gray-300 dark:hover:border-white/15 cursor-pointer" : ""
      } ${highlight ? "ring-1 ring-blue-100 border-blue-200 dark:ring-blue-900/30 dark:border-blue-800" : ""}`}
    >
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
          {label}
        </p>
        {global && (
          <span className="text-[9px] text-gray-300 dark:text-gray-600 uppercase">global</span>
        )}
      </div>
      <div className="flex items-center justify-between mt-1">
        <p
          className={`text-2xl font-bold tabular-nums ${
            highlight ? "text-blue-600 dark:text-blue-400" : "text-gray-900 dark:text-gray-100"
          }`}
        >
          {value}
        </p>
        {trend && trend.length >= 2 && (
          <Sparkline
            data={trend}
            width={56}
            height={20}
            color={highlight ? "rgb(37 99 235)" : "rgb(156 163 175)"}
            className="opacity-60"
          />
        )}
      </div>
      <div className="flex items-center gap-2 mt-0.5">
        {sub && <p className="text-[11px] text-gray-400 dark:text-gray-500">{sub}</p>}
        {delta !== undefined && delta !== 0 && (
          <span
            className={`text-[11px] font-semibold tabular-nums ${
              delta > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"
            }`}
          >
            {delta > 0 ? "+" : ""}{delta.toFixed(1)}% vs national
          </span>
        )}
      </div>
    </div>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }
  return content;
}

export function SummaryKPI({
  label,
  value,
  delta,
  deltaLabel,
  deltaFormat,
}: {
  label: string;
  value: string;
  delta?: number;
  deltaLabel?: string;
  deltaFormat?: "pct" | "abs";
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-sm font-bold tabular-nums text-gray-900 dark:text-gray-100">
          {value}
        </span>
        {delta !== undefined && deltaLabel && (
          <span className="text-[10px] text-gray-400 dark:text-gray-500">{deltaLabel}</span>
        )}
        {delta !== undefined && !deltaLabel && delta !== 0 && (
          <span
            className={`text-[10px] font-semibold tabular-nums ${
              delta > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"
            }`}
          >
            {deltaFormat === "pct"
              ? `${delta > 0 ? "+" : ""}${delta.toFixed(1)}pp`
              : `${delta > 0 ? "+" : ""}${delta.toFixed(0)}`}
          </span>
        )}
      </div>
    </div>
  );
}

export function CrawlStatusDot({ status }: { status: string }) {
  const color: Record<string, string> = {
    success: "bg-emerald-400",
    failed: "bg-red-400",
    unchanged: "bg-gray-300",
  };
  return (
    <span className="inline-flex items-center gap-1.5 text-gray-500">
      <span
        className={`w-1.5 h-1.5 rounded-full ${color[status] ?? "bg-gray-300"}`}
      />
      {status}
    </span>
  );
}

export function ReviewActionDot({ action }: { action: string }) {
  const color: Record<string, string> = {
    approve: "bg-emerald-400",
    reject: "bg-red-400",
    edit: "bg-blue-400",
    bulk_approve: "bg-emerald-400",
    flag: "bg-orange-400",
    stage: "bg-blue-400",
  };
  const labels: Record<string, string> = {
    approve: "Approved",
    reject: "Rejected",
    edit: "Edited",
    bulk_approve: "Bulk",
    flag: "Flagged",
    stage: "Staged",
  };
  return (
    <span className="inline-flex items-center gap-1.5 text-gray-500">
      <span
        className={`w-1.5 h-1.5 rounded-full ${color[action] ?? "bg-gray-300"}`}
      />
      {labels[action] ?? action}
    </span>
  );
}
