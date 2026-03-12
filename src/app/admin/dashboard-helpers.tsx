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
  const inner = (
    <div
      className={`admin-card admin-card--interactive kpi-card px-4 py-3.5 ${
        highlight ? "kpi-card--accent" : ""
      } ${href ? "cursor-pointer" : ""}`}
    >
      <div className="flex items-center justify-between mb-1">
        <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-[0.08em]">
          {label}
        </p>
        {global && (
          <span className="text-[8px] text-gray-300 dark:text-gray-600 uppercase tracking-widest font-semibold">
            all
          </span>
        )}
      </div>
      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0">
          <p
            className={`text-[1.75rem] font-extrabold tabular-nums leading-none tracking-tight ${
              highlight
                ? "text-blue-600 dark:text-blue-400"
                : "text-gray-900 dark:text-gray-100"
            }`}
          >
            {value}
          </p>
          <div className="flex items-center gap-1.5 mt-1.5 min-h-[16px]">
            {sub && (
              <p className="text-[11px] text-gray-400 dark:text-gray-500 tabular-nums">
                {sub}
              </p>
            )}
            {delta !== undefined && delta !== 0 && (
              <span
                className={`inline-flex items-center gap-0.5 text-[10px] font-bold tabular-nums ${
                  delta > 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-red-500 dark:text-red-400"
                }`}
              >
                <svg
                  viewBox="0 0 8 8"
                  className={`w-2 h-2 ${delta < 0 ? "rotate-180" : ""}`}
                  fill="currentColor"
                >
                  <path d="M4 1L7 6H1z" />
                </svg>
                {Math.abs(delta).toFixed(1)}%
              </span>
            )}
          </div>
        </div>
        {trend && trend.length >= 2 && (
          <Sparkline
            data={trend}
            width={64}
            height={24}
            color={highlight ? "rgb(59 130 246)" : "rgb(156 163 175)"}
            className="opacity-50 shrink-0"
          />
        )}
      </div>
    </div>
  );

  if (href) {
    return <Link href={href}>{inner}</Link>;
  }
  return inner;
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
    <div className="flex items-center justify-between py-1">
      <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-sm font-bold tabular-nums text-gray-900 dark:text-gray-100">
          {value}
        </span>
        {delta !== undefined && deltaLabel && (
          <span className="text-[10px] text-gray-400 dark:text-gray-500">
            {deltaLabel}
          </span>
        )}
        {delta !== undefined && !deltaLabel && delta !== 0 && (
          <span
            className={`inline-flex items-center gap-0.5 text-[10px] font-bold tabular-nums ${
              delta > 0
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-red-500 dark:text-red-400"
            }`}
          >
            <svg
              viewBox="0 0 8 8"
              className={`w-1.5 h-1.5 ${delta < 0 ? "rotate-180" : ""}`}
              fill="currentColor"
            >
              <path d="M4 1L7 6H1z" />
            </svg>
            {deltaFormat === "pct"
              ? `${Math.abs(delta).toFixed(1)}pp`
              : `${Math.abs(delta).toFixed(0)}`}
          </span>
        )}
      </div>
    </div>
  );
}

export function CrawlStatusDot({ status }: { status: string }) {
  const config: Record<string, { color: string; label: string }> = {
    success: { color: "bg-emerald-500", label: "OK" },
    failed: { color: "bg-red-500", label: "Fail" },
    unchanged: { color: "bg-gray-300 dark:bg-gray-600", label: "Same" },
  };
  const { color, label } = config[status] ?? {
    color: "bg-gray-300",
    label: status,
  };
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`w-1.5 h-1.5 rounded-full ${color}`} />
      <span className="text-[11px] text-gray-500 dark:text-gray-400">
        {label}
      </span>
    </span>
  );
}

export function ReviewActionDot({ action }: { action: string }) {
  const config: Record<string, { color: string; label: string }> = {
    approve: { color: "bg-emerald-500", label: "Approved" },
    reject: { color: "bg-red-500", label: "Rejected" },
    edit: { color: "bg-blue-500", label: "Edited" },
    bulk_approve: { color: "bg-emerald-500", label: "Bulk" },
    flag: { color: "bg-orange-500", label: "Flagged" },
    stage: { color: "bg-blue-400", label: "Staged" },
  };
  const { color, label } = config[action] ?? {
    color: "bg-gray-300",
    label: action,
  };
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`w-1.5 h-1.5 rounded-full ${color}`} />
      <span className="text-[11px] text-gray-500 dark:text-gray-400">
        {label}
      </span>
    </span>
  );
}
