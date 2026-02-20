import Link from "next/link";
import type { Insight } from "@/lib/insight-engine";

interface ActionCardStripProps {
  insights: Insight[];
}

const SEVERITY_BORDER_TOP: Record<string, string> = {
  critical: "border-t-red-500",
  warning: "border-t-amber-400",
  info: "border-t-blue-400",
  positive: "border-t-emerald-400",
};

const SEVERITY_BG: Record<string, string> = {
  critical: "bg-red-50/30 dark:bg-red-950/15",
  warning: "bg-amber-50/30 dark:bg-amber-950/15",
  info: "",
  positive: "bg-emerald-50/20 dark:bg-emerald-950/10",
};

const SEVERITY_LINK: Record<string, string> = {
  critical: "text-red-600 dark:text-red-400",
  warning: "text-amber-700 dark:text-amber-400",
  info: "text-blue-600 dark:text-blue-400",
  positive: "text-emerald-600 dark:text-emerald-400",
};

export function ActionCardStrip({ insights }: ActionCardStripProps) {
  const actionInsights = insights.filter((i) => i.action).slice(0, 4);

  if (actionInsights.length === 0) return null;

  return (
    <div
      className={`grid gap-3 ${
        actionInsights.length === 1
          ? "grid-cols-1"
          : actionInsights.length === 2
            ? "grid-cols-1 md:grid-cols-2"
            : actionInsights.length === 3
              ? "grid-cols-1 md:grid-cols-3"
              : "grid-cols-1 md:grid-cols-2 lg:grid-cols-4"
      }`}
    >
      {actionInsights.map((insight) => (
        <div
          key={insight.id}
          className={`admin-card border-t-[3px] ${SEVERITY_BORDER_TOP[insight.severity]} ${SEVERITY_BG[insight.severity]} p-4`}
        >
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 line-clamp-2">
            {insight.headline}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-1">
            {insight.body}
          </p>
          <Link
            href={insight.action!.href}
            className={`inline-block mt-2 text-xs font-semibold ${SEVERITY_LINK[insight.severity]} hover:underline`}
          >
            {insight.action!.label} &rarr;
          </Link>
        </div>
      ))}
    </div>
  );
}
