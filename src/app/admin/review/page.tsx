export const dynamic = "force-dynamic";
import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { getReviewFees, getReviewQueueCounts } from "@/lib/admin-queries";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { Pagination } from "@/components/pagination";
import { formatAmount } from "@/lib/format";
import { DISPLAY_NAMES } from "@/lib/fee-taxonomy";

const STATUS_TABS = ["staged", "flagged", "pending", "approved", "rejected"] as const;

const STATUS_COLORS: Record<string, string> = {
  staged: "bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
  flagged: "bg-orange-50 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400",
  pending: "bg-gray-100 text-gray-500 dark:bg-white/[0.08] dark:text-gray-400",
  approved: "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400",
  rejected: "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400",
};

const PAGE_SIZE = 20;

function confidenceBadge(conf: number) {
  const pct = Math.round(conf * 100);
  const cls =
    conf >= 0.9
      ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
      : conf >= 0.7
        ? "bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400"
        : "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400";
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${cls}`}>
      {pct}%
    </span>
  );
}

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string }>;
}) {
  await requireAuth("view");

  const params = await searchParams;
  const activeStatus = params.status || "staged";
  const searchQuery = params.q || "";
  const currentPage = Math.max(1, parseInt(params.page || "1", 10) || 1);

  let fees: Awaited<ReturnType<typeof getReviewFees>>["fees"] = [];
  let total = 0;
  let counts: Awaited<ReturnType<typeof getReviewQueueCounts>> = {
    staged: 0, flagged: 0, pending: 0, approved: 0, rejected: 0,
  };

  try {
    [{ fees, total }, counts] = await Promise.all([
      getReviewFees(activeStatus, currentPage, PAGE_SIZE, searchQuery || undefined),
      getReviewQueueCounts(),
    ]);
  } catch (e) {
    console.error("ReviewPage load failed:", e);
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <>
      <div className="mb-6">
        <Breadcrumbs items={[
          { label: "Dashboard", href: "/admin" },
          { label: "Review" },
        ]} />
        <h1 className="text-xl font-bold tracking-tight text-gray-900">
          Fee Review Queue
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Review and approve extracted fee data
        </p>
      </div>

      {/* Status tabs */}
      <div className="flex gap-1 mb-4 border-b overflow-x-auto">
        {STATUS_TABS.map((tab) => {
          const count = counts[tab];
          const isActive = activeStatus === tab;
          return (
            <Link
              key={tab}
              href={`/admin/review?status=${tab}${searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : ""}`}
              className={`px-4 py-2.5 text-sm font-medium capitalize transition-colors border-b-2 -mb-px whitespace-nowrap ${
                isActive
                  ? "border-gray-900 text-gray-900 dark:border-gray-100 dark:text-gray-100"
                  : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400"
              }`}
            >
              {tab}
              {count > 0 && (
                <span
                  className={`ml-1.5 inline-block rounded-full px-1.5 py-0.5 text-xs tabular-nums ${
                    isActive
                      ? STATUS_COLORS[tab]
                      : "bg-gray-100 text-gray-500 dark:bg-white/[0.08] dark:text-gray-400"
                  }`}
                >
                  {count}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      {/* Search */}
      <div className="mb-4">
        <form action="/admin/review" method="GET" className="flex gap-2">
          <input type="hidden" name="status" value={activeStatus} />
          <input
            type="text"
            name="q"
            defaultValue={searchQuery}
            placeholder="Search fees or institutions..."
            className="rounded-md border px-3 py-1.5 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-gray-300
                       dark:bg-[oklch(0.18_0_0)] dark:border-white/[0.12] dark:text-gray-100 dark:placeholder:text-gray-500"
          />
          <button
            type="submit"
            className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 transition-colors
                       dark:bg-white/[0.15] dark:hover:bg-white/[0.2]"
          >
            Search
          </button>
          {searchQuery && (
            <Link
              href={`/admin/review?status=${activeStatus}`}
              className="rounded-md border px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors
                         dark:border-white/[0.12] dark:text-gray-400 dark:hover:bg-white/[0.06]"
            >
              Clear
            </Link>
          )}
        </form>
      </div>

      {searchQuery && (
        <p className="mb-4 text-sm text-gray-600">
          {total} result{total !== 1 ? "s" : ""} for &quot;{searchQuery}&quot;
        </p>
      )}

      {/* Table */}
      {fees.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          {searchQuery
            ? `No fees matching "${searchQuery}" with status "${activeStatus}"`
            : `No fees with status "${activeStatus}"`}
        </div>
      ) : (
        <div className="admin-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50/80 text-left">
                  <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                    Fee Name
                  </th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-right">
                    Amount
                  </th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                    Category
                  </th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                    Institution
                  </th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-center">
                    Confidence
                  </th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                    Date
                  </th>
                </tr>
              </thead>
              <tbody>
                {fees.map((fee) => (
                  <tr
                    key={fee.id}
                    className="border-b last:border-0 hover:bg-gray-50/50 transition-colors"
                  >
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/admin/review/${fee.id}`}
                        className="font-medium text-gray-900 hover:text-blue-600 transition-colors"
                      >
                        {fee.fee_name}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-900">
                      {formatAmount(fee.amount)}
                    </td>
                    <td className="px-4 py-2.5 text-gray-600 text-xs">
                      {fee.fee_category
                        ? DISPLAY_NAMES[fee.fee_category] || fee.fee_category.replace(/_/g, " ")
                        : "-"}
                    </td>
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/admin/peers/${fee.crawl_target_id}`}
                        className="text-gray-900 hover:text-blue-600 transition-colors text-xs"
                      >
                        {fee.institution_name}
                      </Link>
                      {fee.state_code && (
                        <span className="ml-1 text-[10px] text-gray-400">{fee.state_code}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {confidenceBadge(fee.confidence)}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-500 tabular-nums">
                      {fee.created_at}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 pb-3">
            <Pagination
              basePath="/admin/review"
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={total}
              pageSize={PAGE_SIZE}
              params={{
                status: activeStatus,
                ...(searchQuery ? { q: searchQuery } : {}),
              }}
            />
          </div>
        </div>
      )}
    </>
  );
}
