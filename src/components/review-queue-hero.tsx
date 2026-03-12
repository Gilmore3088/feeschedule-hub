import Link from "next/link";
import type { ReviewStats, StuckReviewItems } from "@/lib/crawler-db";

interface ReviewQueueHeroProps {
  stats: ReviewStats;
  stuck: StuckReviewItems;
  isAdmin: boolean;
}

export function ReviewQueueHero({
  stats,
  stuck,
  isAdmin,
}: ReviewQueueHeroProps) {
  const needsReview = stats.staged + stats.flagged + stats.pending;
  const total = needsReview + stats.approved + stats.rejected;

  const approvedPct = total > 0 ? (stats.approved / total) * 100 : 0;
  const stagedPct = total > 0 ? (stats.staged / total) * 100 : 0;
  const flaggedPct = total > 0 ? (stats.flagged / total) * 100 : 0;
  const rejectedPct = total > 0 ? (stats.rejected / total) * 100 : 0;

  return (
    <div className="admin-card admin-card--elevated">
      <div className="px-5 py-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <h2 className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.08em]">
                Review Queue
              </h2>
              {needsReview > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/10 px-2 py-0.5 text-[10px] font-bold text-orange-600 dark:text-orange-400 tabular-nums">
                  <span className="w-1 h-1 rounded-full bg-orange-500 animate-pulse" />
                  {needsReview.toLocaleString()} awaiting
                </span>
              )}
            </div>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-3xl font-extrabold tabular-nums tracking-tight text-gray-900 dark:text-gray-100 leading-none">
                {stats.approved.toLocaleString()}
              </span>
              <span className="text-sm text-gray-400">
                / {total.toLocaleString()}
              </span>
              <span className="text-xs text-gray-400 hidden sm:inline">
                approved
              </span>
            </div>
          </div>
          {stats.flagged > 0 && (
            <Link
              href="/admin/review?status=flagged"
              className="shrink-0 rounded-lg bg-gray-900 dark:bg-white/10 px-4 py-2 text-xs font-bold text-white hover:bg-gray-800 dark:hover:bg-white/15 transition-colors"
            >
              Review flagged ({stats.flagged})
            </Link>
          )}
        </div>

        {/* Segmented progress bar */}
        <div className="mt-4">
          <div className="progress-bar flex">
            {approvedPct > 0 && (
              <div
                className="h-full bg-emerald-500 transition-all first:rounded-l-[3px]"
                style={{ width: `${approvedPct}%` }}
                title={`${stats.approved.toLocaleString()} approved`}
              />
            )}
            {stagedPct > 0 && (
              <div
                className="h-full bg-blue-400 transition-all"
                style={{ width: `${stagedPct}%` }}
                title={`${stats.staged.toLocaleString()} staged`}
              />
            )}
            {flaggedPct > 0 && (
              <div
                className="h-full bg-orange-400 transition-all"
                style={{ width: `${flaggedPct}%` }}
                title={`${stats.flagged.toLocaleString()} flagged`}
              />
            )}
            {rejectedPct > 0 && (
              <div
                className="h-full bg-red-400 transition-all last:rounded-r-[3px]"
                style={{ width: `${rejectedPct}%` }}
                title={`${stats.rejected.toLocaleString()} rejected`}
              />
            )}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2.5">
            <LegendItem
              href="/admin/review?status=approved"
              color="bg-emerald-500"
              count={stats.approved}
              label="Approved"
            />
            {stats.staged > 0 && (
              <LegendItem
                href="/admin/review?status=staged"
                color="bg-blue-400"
                count={stats.staged}
                label="Staged"
              />
            )}
            {stats.flagged > 0 && (
              <LegendItem
                href="/admin/review?status=flagged"
                color="bg-orange-400"
                count={stats.flagged}
                label="Flagged"
              />
            )}
            <span className="flex items-center gap-1.5 text-[11px] text-gray-400 tabular-nums">
              <span className="w-1.5 h-1.5 rounded-full bg-gray-200 dark:bg-gray-600" />
              {stats.pending.toLocaleString()} Pending
            </span>
          </div>
        </div>

        {/* Actions + stuck warnings */}
        <div className="flex flex-wrap items-center gap-4 mt-3 pt-3 border-t border-gray-100 dark:border-white/[0.06]">
          <Link
            href="/admin/review?status=staged"
            className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 transition-colors"
          >
            Review staged
          </Link>
          {isAdmin && stats.staged > 0 && (
            <Link
              href="/admin/review?status=staged"
              className="text-xs font-semibold text-purple-600 dark:text-purple-400 hover:text-purple-700 transition-colors"
            >
              Bulk approve
            </Link>
          )}

          {(stuck.flagged_over_14d > 0 || stuck.staged_over_30d > 0) && (
            <div className="flex gap-3 ml-auto">
              {stuck.flagged_over_14d > 0 && (
                <Link
                  href="/admin/review?status=flagged"
                  className="flex items-center gap-1 text-[10px] font-semibold text-orange-600 dark:text-orange-400 hover:underline tabular-nums"
                >
                  <span className="inline-block w-1 h-1 rounded-full bg-orange-500" />
                  {stuck.flagged_over_14d} stale &gt;14d
                </Link>
              )}
              {stuck.staged_over_30d > 0 && (
                <Link
                  href="/admin/review?status=staged"
                  className="flex items-center gap-1 text-[10px] font-semibold text-blue-600 dark:text-blue-400 hover:underline tabular-nums"
                >
                  <span className="inline-block w-1 h-1 rounded-full bg-blue-500" />
                  {stuck.staged_over_30d} stale &gt;30d
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LegendItem({
  href,
  color,
  count,
  label,
}: {
  href: string;
  color: string;
  count: number;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 tabular-nums transition-colors"
    >
      <span className={`w-1.5 h-1.5 rounded-full ${color}`} />
      {count.toLocaleString()} {label}
    </Link>
  );
}
