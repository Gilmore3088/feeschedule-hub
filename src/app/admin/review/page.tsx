import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { getReviewStats, getFeesByStatus, type ReviewableFee } from "@/lib/crawler-db";
import { ApproveButton, RejectButton, BulkApproveButton } from "./review-actions";
import { CategorySelect } from "./category-select";
import { FeeSearchForm } from "./fee-search";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { Pagination } from "@/components/pagination";
import { SortableHeader } from "@/components/sortable-header";
import { ReviewKeyboardNav } from "./keyboard-nav";
import { formatAmount } from "@/lib/format";

const STATUS_TABS = ["staged", "flagged", "pending", "approved", "rejected"] as const;

const STATUS_COLORS: Record<string, string> = {
  staged: "bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
  flagged: "bg-orange-50 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400",
  pending: "bg-gray-100 text-gray-500 dark:bg-white/[0.08] dark:text-gray-400",
  approved: "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400",
  rejected: "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400",
};

function confidenceBadge(conf: number) {
  const cls =
    conf >= 0.9
      ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
      : conf >= 0.7
        ? "bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400"
        : "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400";
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${cls}`}
    >
      {(conf * 100).toFixed(0)}%
    </span>
  );
}

interface ValidationFlag {
  rule: string;
  severity: string;
  message: string;
}

function parseFlags(flags: string | null): ValidationFlag[] {
  if (!flags) return [];
  try {
    return JSON.parse(flags);
  } catch {
    return [];
  }
}

function FlagsBadges({ flags }: { flags: ValidationFlag[] }) {
  if (flags.length === 0) return <span className="text-gray-400 dark:text-gray-600">-</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {flags.map((f, i) => {
        const cls =
          f.severity === "error"
            ? "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400"
            : f.severity === "warning"
              ? "bg-orange-50 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400"
              : "bg-gray-100 text-gray-500 dark:bg-white/[0.08] dark:text-gray-400";
        return (
          <span
            key={i}
            className={`inline-block rounded px-1.5 py-0.5 text-xs ${cls}`}
            title={f.message}
          >
            {f.rule.replace(/_/g, " ")}
          </span>
        );
      })}
    </div>
  );
}

const PAGE_SIZE = 100;

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string; sort?: string; dir?: string }>;
}) {
  const user = await requireAuth("view");

  const params = await searchParams;
  const activeStatus = params.status || "staged";
  const searchQuery = params.q || "";
  const currentPage = Math.max(1, parseInt(params.page || "1", 10) || 1);
  const sortColumn = params.sort || undefined;
  const sortDir = params.dir || undefined;
  const stats = getReviewStats();
  const { fees, total } = getFeesByStatus(
    activeStatus,
    searchQuery || undefined,
    PAGE_SIZE,
    (currentPage - 1) * PAGE_SIZE,
    sortColumn,
    sortDir,
  );
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const canApprove = user.role === "analyst" || user.role === "admin";
  const canBulkApprove = user.role === "admin";

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <div>
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
        {canBulkApprove && activeStatus === "staged" && total > 0 && (
          <BulkApproveButton count={total} />
        )}
      </div>

      {/* Status tabs */}
      <div className="flex gap-1 mb-4 border-b">
        {STATUS_TABS.map((tab) => {
          const count = stats[tab];
          const isActive = activeStatus === tab;
          return (
            <Link
              key={tab}
              href={`/admin/review?status=${tab}${searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : ""}`}
              className={`px-4 py-2.5 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
                isActive
                  ? "border-gray-900 text-gray-900"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab}
              <span
                className={`ml-1.5 inline-block rounded-full px-1.5 py-0.5 text-xs tabular-nums ${
                  isActive
                    ? STATUS_COLORS[tab]
                    : "bg-gray-100 text-gray-500"
                }`}
              >
                {count}
              </span>
            </Link>
          );
        })}
      </div>

      {/* Search */}
      <div className="mb-4">
        <FeeSearchForm
          currentStatus={activeStatus}
          currentQuery={searchQuery}
        />
      </div>

      {searchQuery && (
        <div className="mb-4 flex items-center gap-2 text-sm text-gray-600">
          <span>
            {total} result{total !== 1 ? "s" : ""} for
            &quot;{searchQuery}&quot;
          </span>
          <Link
            href={`/admin/review?status=${activeStatus}`}
            className="text-gray-500 hover:text-gray-700 transition-colors text-xs"
          >
            Clear search
          </Link>
        </div>
      )}

      {/* Fee table */}
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
                  <SortableHeader column="institution" label="Institution" />
                  <SortableHeader column="fee_name" label="Fee Name" />
                  <SortableHeader column="amount" label="Amount" className="text-right" />
                  <SortableHeader column="frequency" label="Frequency" />
                  <SortableHeader column="confidence" label="Confidence" className="text-center" />
                  <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Category</th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Flags</th>
                  {canApprove && (
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-right">
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {fees.map((fee) => (
                  <FeeRow
                    key={fee.id}
                    fee={fee}
                    canApprove={canApprove}
                    activeStatus={activeStatus}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <ReviewKeyboardNav rowCount={fees.length} />
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
                ...(sortColumn ? { sort: sortColumn } : {}),
                ...(sortDir ? { dir: sortDir } : {}),
              }}
            />
          </div>
        </div>
      )}
    </>
  );
}

function FeeRow({
  fee,
  canApprove,
  activeStatus,
}: {
  fee: ReviewableFee;
  canApprove: boolean;
  activeStatus: string;
}) {
  const flags = parseFlags(fee.validation_flags);
  const showActions =
    canApprove &&
    (activeStatus === "staged" ||
      activeStatus === "flagged" ||
      activeStatus === "pending");

  return (
    <tr data-fee-row className="border-b last:border-0 hover:bg-gray-50/50 transition-colors">
      <td className="px-4 py-2.5">
        <Link
          href={`/admin/peers/${fee.crawl_target_id}`}
          className="font-medium text-gray-900 hover:text-blue-600 transition-colors text-xs"
        >
          {fee.institution_name}
        </Link>
        <div className="text-[11px] text-gray-400">
          {fee.state_code} | {fee.charter_type === "bank" ? "Bank" : "CU"}
        </div>
      </td>
      <td className="px-4 py-2.5">
        <Link
          data-detail-link
          href={`/admin/review/${fee.id}`}
          className="text-gray-900 hover:text-blue-600 transition-colors font-medium"
        >
          {fee.fee_name}
        </Link>
        {fee.conditions && (
          <div className="text-[11px] text-gray-400 mt-0.5 max-w-xs truncate">
            {fee.conditions}
          </div>
        )}
      </td>
      <td className="px-4 py-2.5 text-right tabular-nums text-gray-900">
        {formatAmount(fee.amount)}
      </td>
      <td className="px-4 py-2.5 text-gray-600 text-xs">
        {fee.frequency || "-"}
      </td>
      <td className="px-4 py-2.5 text-center">
        {confidenceBadge(fee.extraction_confidence)}
      </td>
      <td className="px-4 py-2.5">
        <CategorySelect feeId={fee.id} currentCategory={fee.fee_category} />
      </td>
      <td className="px-4 py-2.5">
        <FlagsBadges flags={flags} />
      </td>
      {canApprove && (
        <td className="px-4 py-2.5 text-right">
          {showActions ? (
            <div className="flex gap-1 justify-end">
              <ApproveButton feeId={fee.id} />
              <RejectButton feeId={fee.id} />
            </div>
          ) : (
            <span className="text-xs text-gray-400">{fee.review_status}</span>
          )}
        </td>
      )}
    </tr>
  );
}
