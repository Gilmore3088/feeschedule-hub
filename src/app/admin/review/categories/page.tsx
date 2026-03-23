export const dynamic = "force-dynamic";
import Link from "next/link";
import { getCategoryReviewStats } from "@/lib/crawler-db/fees";
import { getFeeCategorySummaries } from "@/lib/crawler-db";
import {
  getDisplayName,
  getFeeFamily,
  getFeeTier,
  FEE_FAMILIES,
} from "@/lib/fee-taxonomy";
import { formatAmount } from "@/lib/format";

const FAMILY_COLORS: Record<string, string> = {
  "Account Maintenance": "#3B82F6",
  "Overdraft & NSF": "#EF4444",
  "ATM & Card": "#F59E0B",
  "Wire Transfers": "#8B5CF6",
  "Check Services": "#64748B",
  "Digital & Electronic": "#06B6D4",
  "Cash & Deposit": "#10B981",
  "Account Services": "#6366F1",
  "Lending Fees": "#F97316",
};

export default async function CategoryReviewPage() {
  const reviewStats = await getCategoryReviewStats();
  const summaries = await getFeeCategorySummaries();

  const statsMap = new Map(reviewStats.map((r) => [r.fee_category, r]));
  const summaryMap = new Map(summaries.map((s) => [s.fee_category, s]));

  const totalReviewable = reviewStats.reduce(
    (acc, r) => acc + r.staged + r.flagged + r.pending,
    0
  );
  const totalReady = reviewStats.reduce((acc, r) => acc + r.ready_count, 0);
  const totalApproved = reviewStats.reduce((acc, r) => acc + r.approved, 0);

  const familyNames = Object.keys(FEE_FAMILIES);

  return (
    <div className="admin-content px-6 py-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-2 mb-1">
        <h1 className="text-xl font-bold tracking-tight text-gray-900">
          Category Review
        </h1>
      </div>
      <p className="text-[13px] text-gray-500 mb-6">
        Review fees by category. Approve batches of high-confidence fees, then
        fix the outliers.
      </p>

      {/* Summary strip */}
      <div className="grid grid-cols-4 gap-3 mb-8">
        <div className="admin-card px-4 py-3 text-center">
          <p className="text-[22px] font-bold tabular-nums text-gray-900">
            {totalReviewable.toLocaleString()}
          </p>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
            Awaiting review
          </p>
        </div>
        <div className="admin-card px-4 py-3 text-center">
          <p className="text-[22px] font-bold tabular-nums text-emerald-600">
            {totalReady.toLocaleString()}
          </p>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
            Ready to approve
          </p>
        </div>
        <div className="admin-card px-4 py-3 text-center">
          <p className="text-[22px] font-bold tabular-nums text-blue-600">
            {totalApproved.toLocaleString()}
          </p>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
            Approved
          </p>
        </div>
        <div className="admin-card px-4 py-3 text-center">
          <p className="text-[22px] font-bold tabular-nums text-gray-900">
            {totalReady > 0
              ? `${Math.round((totalReady / totalReviewable) * 100)}%`
              : "0%"}
          </p>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
            Auto-approvable
          </p>
        </div>
      </div>

      {/* Categories by family */}
      <div className="space-y-8">
        {familyNames.map((family) => {
          const categories = FEE_FAMILIES[family];
          const familyColor = FAMILY_COLORS[family] ?? "#9CA3AF";
          const categoriesWithData = categories.filter(
            (cat) => statsMap.has(cat) || summaryMap.has(cat)
          );
          if (categoriesWithData.length === 0) return null;

          return (
            <div key={family}>
              <div className="flex items-center gap-2 mb-3">
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: familyColor }}
                />
                <h2 className="text-sm font-bold text-gray-800">{family}</h2>
                <span className="text-[11px] text-gray-400">
                  {categoriesWithData.length} categories
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {categoriesWithData.map((cat) => {
                  const stats = statsMap.get(cat);
                  const summary = summaryMap.get(cat);
                  const reviewable =
                    (stats?.staged ?? 0) +
                    (stats?.flagged ?? 0) +
                    (stats?.pending ?? 0);
                  const ready = stats?.ready_count ?? 0;
                  const readyPct =
                    reviewable > 0
                      ? Math.round((ready / reviewable) * 100)
                      : 0;
                  const tier = getFeeTier(cat);

                  return (
                    <Link
                      key={cat}
                      href={`/admin/review/categories/${cat}`}
                      className="admin-card group px-4 py-3 hover:shadow-sm transition-all no-underline block"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="text-[13px] font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                            {getDisplayName(cat)}
                          </p>
                          <p className="text-[10px] text-gray-400 uppercase tracking-wider">
                            {tier}
                          </p>
                        </div>
                        {ready > 0 && (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-600">
                            {ready} ready
                          </span>
                        )}
                      </div>

                      {/* Stats row */}
                      <div className="grid grid-cols-4 gap-2 text-center">
                        <div>
                          <p className="text-[13px] font-semibold tabular-nums text-gray-900">
                            {reviewable}
                          </p>
                          <p className="text-[9px] text-gray-400">to review</p>
                        </div>
                        <div>
                          <p className="text-[13px] font-semibold tabular-nums text-emerald-600">
                            {stats?.approved ?? 0}
                          </p>
                          <p className="text-[9px] text-gray-400">approved</p>
                        </div>
                        <div>
                          <p className="text-[13px] font-semibold tabular-nums text-gray-500">
                            {summary?.median_amount != null
                              ? formatAmount(summary.median_amount)
                              : "--"}
                          </p>
                          <p className="text-[9px] text-gray-400">median</p>
                        </div>
                        <div>
                          <p className="text-[13px] font-semibold tabular-nums text-gray-500">
                            {readyPct}%
                          </p>
                          <p className="text-[9px] text-gray-400">auto</p>
                        </div>
                      </div>

                      {/* Progress bar */}
                      {(stats?.total ?? 0) > 0 && (
                        <div className="mt-2 h-1.5 rounded-full bg-gray-100 overflow-hidden flex">
                          <div
                            className="h-full bg-emerald-500 rounded-l-full"
                            style={{
                              width: `${((stats?.approved ?? 0) / stats!.total) * 100}%`,
                            }}
                          />
                          <div
                            className="h-full bg-amber-400"
                            style={{
                              width: `${((stats?.staged ?? 0) / stats!.total) * 100}%`,
                            }}
                          />
                          <div
                            className="h-full bg-red-400"
                            style={{
                              width: `${((stats?.flagged ?? 0) / stats!.total) * 100}%`,
                            }}
                          />
                        </div>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
