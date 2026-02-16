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
  const progressPct = total > 0 ? (stats.approved / total) * 100 : 0;

  return (
    <div className="rounded-lg border bg-white">
      <div className="px-6 py-5">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide">
              Review Queue
            </h2>
            <p className="text-3xl font-bold text-gray-900 mt-1">
              {needsReview.toLocaleString()}{" "}
              <span className="text-base font-normal text-gray-500">
                fees need review
              </span>
            </p>
          </div>
          <Link
            href="/admin/review?status=flagged"
            className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 transition-colors"
          >
            Review flagged first
          </Link>
        </div>

        {/* Status chips */}
        <div className="flex flex-wrap gap-3 mt-4">
          {stats.flagged > 0 && (
            <Link
              href="/admin/review?status=flagged"
              className="flex items-center gap-1.5 text-sm hover:underline"
            >
              <span className="inline-block rounded-full bg-orange-100 text-orange-700 px-2.5 py-0.5 text-xs font-semibold">
                {stats.flagged.toLocaleString()}
              </span>
              <span className="text-gray-600">Flagged</span>
            </Link>
          )}
          {stats.staged > 0 && (
            <Link
              href="/admin/review?status=staged"
              className="flex items-center gap-1.5 text-sm hover:underline"
            >
              <span className="inline-block rounded-full bg-blue-100 text-blue-700 px-2.5 py-0.5 text-xs font-semibold">
                {stats.staged.toLocaleString()}
              </span>
              <span className="text-gray-600">Staged</span>
            </Link>
          )}
          {stats.pending > 0 && (
            <Link
              href="/admin/review?status=pending"
              className="flex items-center gap-1.5 text-sm hover:underline"
            >
              <span className="inline-block rounded-full bg-gray-100 text-gray-600 px-2.5 py-0.5 text-xs font-semibold">
                {stats.pending.toLocaleString()}
              </span>
              <span className="text-gray-600">Pending</span>
            </Link>
          )}
          <Link
            href="/admin/review?status=approved"
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:underline"
          >
            <span className="inline-block rounded-full bg-green-100 text-green-700 px-2.5 py-0.5 text-xs font-semibold">
              {stats.approved.toLocaleString()}
            </span>
            <span>Approved</span>
          </Link>
        </div>

        {/* Progress bar */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
            <span>Review progress</span>
            <span>{progressPct.toFixed(0)}% complete</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2">
            <div
              className="bg-green-500 h-2 rounded-full transition-all"
              style={{ width: `${Math.min(progressPct, 100)}%` }}
            />
          </div>
        </div>

        {/* Stuck items + secondary CTAs */}
        <div className="flex flex-wrap items-center gap-4 mt-4 pt-4 border-t">
          <Link
            href="/admin/review?status=staged"
            className="text-sm text-blue-600 hover:underline"
          >
            Review staged
          </Link>
          {isAdmin && stats.staged > 0 && (
            <Link
              href="/admin/review?status=staged"
              className="text-sm text-purple-600 hover:underline"
            >
              Bulk approve staged
            </Link>
          )}

          {(stuck.flagged_over_14d > 0 || stuck.staged_over_30d > 0) && (
            <div className="flex gap-3 ml-auto">
              {stuck.flagged_over_14d > 0 && (
                <Link
                  href="/admin/review?status=flagged"
                  className="flex items-center gap-1 text-xs text-orange-600 hover:underline"
                >
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-orange-500" />
                  {stuck.flagged_over_14d} flagged &gt;14d
                </Link>
              )}
              {stuck.staged_over_30d > 0 && (
                <Link
                  href="/admin/review?status=staged"
                  className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
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
