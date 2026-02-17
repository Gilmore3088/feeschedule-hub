import Link from "next/link";
import type { ReviewStats, StuckReviewItems } from "@/lib/crawler-db";

interface ReviewQueueHeroProps {
  stats: ReviewStats;
  stuck: StuckReviewItems;
  isAdmin: boolean;
}

export function ReviewQueueHero({ stats, stuck, isAdmin }: ReviewQueueHeroProps) {
  const needsReview = stats.staged + stats.flagged + stats.pending;
  const total = needsReview + stats.approved + stats.rejected;

  // Segment percentages
  const approvedPct = total > 0 ? (stats.approved / total) * 100 : 0;
  const stagedPct = total > 0 ? (stats.staged / total) * 100 : 0;
  const flaggedPct = total > 0 ? (stats.flagged / total) * 100 : 0;
  const rejectedPct = total > 0 ? (stats.rejected / total) * 100 : 0;

  return (
    <div className="rounded-lg border bg-white">
      <div className="px-5 py-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Review Queue
              </h2>
              {needsReview > 0 && (
                <span className="inline-flex items-center rounded-full bg-orange-50 border border-orange-200 px-2 py-0.5 text-[10px] font-semibold text-orange-600">
                  {needsReview.toLocaleString()} pending review
                </span>
              )}
            </div>
            <div className="flex items-baseline gap-3 mt-1.5">
              <span className="text-2xl font-bold tabular-nums text-gray-900">
                {stats.approved.toLocaleString()}
              </span>
              <span className="text-sm text-gray-500">
                approved of {total.toLocaleString()} total
              </span>
            </div>
          </div>
          <Link
            href="/admin/review?status=flagged"
            className="rounded-md bg-orange-600 px-4 py-2 text-xs font-semibold text-white hover:bg-orange-700 transition-colors"
          >
            Review flagged
          </Link>
        </div>

        {/* Segmented progress bar */}
        <div className="mt-4">
          <div className="w-full bg-gray-100 rounded-full h-2.5 flex overflow-hidden">
            {approvedPct > 0 && (
              <div
                className="bg-emerald-500 h-full transition-all"
                style={{ width: `${approvedPct}%` }}
                title={`${stats.approved.toLocaleString()} approved`}
              />
            )}
            {stagedPct > 0 && (
              <div
                className="bg-blue-400 h-full transition-all"
                style={{ width: `${stagedPct}%` }}
                title={`${stats.staged.toLocaleString()} staged`}
              />
            )}
            {flaggedPct > 0 && (
              <div
                className="bg-orange-400 h-full transition-all"
                style={{ width: `${flaggedPct}%` }}
                title={`${stats.flagged.toLocaleString()} flagged`}
              />
            )}
            {rejectedPct > 0 && (
              <div
                className="bg-red-400 h-full transition-all"
                style={{ width: `${rejectedPct}%` }}
                title={`${stats.rejected.toLocaleString()} rejected`}
              />
            )}
          </div>
          {/* Legend */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
            <Link
              href="/admin/review?status=approved"
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              {stats.approved.toLocaleString()} Approved
            </Link>
            {stats.staged > 0 && (
              <Link
                href="/admin/review?status=staged"
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700"
              >
                <span className="w-2 h-2 rounded-full bg-blue-400" />
                {stats.staged.toLocaleString()} Staged
              </Link>
            )}
            {stats.flagged > 0 && (
              <Link
                href="/admin/review?status=flagged"
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700"
              >
                <span className="w-2 h-2 rounded-full bg-orange-400" />
                {stats.flagged.toLocaleString()} Flagged
              </Link>
            )}
            <span className="flex items-center gap-1.5 text-xs text-gray-400">
              <span className="w-2 h-2 rounded-full bg-gray-200" />
              {stats.pending.toLocaleString()} Pending
            </span>
          </div>
        </div>

        {/* Secondary CTAs + stuck items */}
        <div className="flex flex-wrap items-center gap-4 mt-3 pt-3 border-t">
          <Link
            href="/admin/review?status=staged"
            className="text-xs text-blue-600 hover:underline font-medium"
          >
            Review staged
          </Link>
          {isAdmin && stats.staged > 0 && (
            <Link
              href="/admin/review?status=staged"
              className="text-xs text-purple-600 hover:underline font-medium"
            >
              Bulk approve staged
            </Link>
          )}

          {(stuck.flagged_over_14d > 0 || stuck.staged_over_30d > 0) && (
            <div className="flex gap-3 ml-auto">
              {stuck.flagged_over_14d > 0 && (
                <Link
                  href="/admin/review?status=flagged"
                  className="flex items-center gap-1 text-[11px] text-orange-600 hover:underline"
                >
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-orange-500" />
                  {stuck.flagged_over_14d} flagged &gt;14d
                </Link>
              )}
              {stuck.staged_over_30d > 0 && (
                <Link
                  href="/admin/review?status=staged"
                  className="flex items-center gap-1 text-[11px] text-blue-600 hover:underline"
                >
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500" />
                  {stuck.staged_over_30d} staged &gt;30d
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
