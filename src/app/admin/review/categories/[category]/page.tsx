export const dynamic = "force-dynamic";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFeesByCategory } from "@/lib/crawler-db/fees";
import { getFeeCategorySummaries } from "@/lib/crawler-db";
import { getDisplayName, getFeeFamily } from "@/lib/fee-taxonomy";
import { formatAmount } from "@/lib/format";
import { isEmptyJsonb } from "@/lib/pg-helpers";
import { CategoryReviewClient } from "./category-review-client";

interface PageProps {
  params: Promise<{ category: string }>;
}

export default async function CategoryReviewDetailPage({ params }: PageProps) {
  const { category } = await params;
  const displayName = getDisplayName(category);
  if (displayName === category && !category.includes("_")) notFound();

  const family = getFeeFamily(category);
  const summaries = await getFeeCategorySummaries();
  const summary = summaries.find((s) => s.fee_category === category);

  // Get all non-rejected fees for this category
  const allFees = await getFeesByCategory(category);
  const nonRejected = allFees.filter((f) => f.review_status !== "rejected");

  // Split into "ready" and "needs review"
  const ready = nonRejected.filter(
    (f) =>
      (f.review_status === "staged" || f.review_status === "pending") &&
      (f.extraction_confidence ?? 0) >= 0.9 &&
      isEmptyJsonb(f.validation_flags)
  );

  const needsReview = nonRejected.filter(
    (f) =>
      f.review_status !== "approved" &&
      !ready.includes(f)
  );

  const approved = nonRejected.filter((f) => f.review_status === "approved");

  return (
    <div className="admin-content px-6 py-6 max-w-7xl mx-auto">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-[12px] text-gray-400 mb-4">
        <Link
          href="/admin/review"
          className="hover:text-gray-700 transition-colors"
        >
          Review
        </Link>
        <span>/</span>
        <Link
          href="/admin/review/categories"
          className="hover:text-gray-700 transition-colors"
        >
          Categories
        </Link>
        <span>/</span>
        <span className="text-gray-600">{displayName}</span>
      </nav>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-gray-900">
            {displayName}
          </h1>
          <p className="text-[13px] text-gray-500">
            {family} &middot;{" "}
            {summary
              ? `Median ${formatAmount(summary.median_amount)} (${summary.institution_count} institutions)`
              : "No summary data"}
          </p>
        </div>
        {summary && (
          <div className="flex gap-3 text-center">
            <div className="admin-card px-3 py-2">
              <p className="text-[11px] text-gray-400">P25</p>
              <p className="text-[14px] font-semibold tabular-nums">
                {formatAmount(summary.p25_amount)}
              </p>
            </div>
            <div className="admin-card px-3 py-2">
              <p className="text-[11px] text-gray-400">Median</p>
              <p className="text-[14px] font-semibold tabular-nums">
                {formatAmount(summary.median_amount)}
              </p>
            </div>
            <div className="admin-card px-3 py-2">
              <p className="text-[11px] text-gray-400">P75</p>
              <p className="text-[14px] font-semibold tabular-nums">
                {formatAmount(summary.p75_amount)}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Status summary */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <div className="admin-card px-4 py-3 text-center">
          <p className="text-[20px] font-bold tabular-nums text-emerald-600">
            {ready.length}
          </p>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
            Ready to approve
          </p>
        </div>
        <div className="admin-card px-4 py-3 text-center">
          <p className="text-[20px] font-bold tabular-nums text-amber-600">
            {needsReview.length}
          </p>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
            Needs review
          </p>
        </div>
        <div className="admin-card px-4 py-3 text-center">
          <p className="text-[20px] font-bold tabular-nums text-blue-600">
            {approved.length}
          </p>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
            Approved
          </p>
        </div>
        <div className="admin-card px-4 py-3 text-center">
          <p className="text-[20px] font-bold tabular-nums text-gray-900">
            {nonRejected.length}
          </p>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
            Total
          </p>
        </div>
      </div>

      <CategoryReviewClient
        category={category}
        readyFees={ready}
        needsReviewFees={needsReview}
        approvedFees={approved}
        medianAmount={summary?.median_amount ?? null}
      />
    </div>
  );
}
