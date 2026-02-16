import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { getReviewStats, getFeesByStatus, type ReviewableFee } from "@/lib/crawler-db";
import { ApproveButton, RejectButton, BulkApproveButton } from "./review-actions";
import { FeeSearchForm } from "./fee-search";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { formatAmount } from "@/lib/format";

const STATUS_TABS = ["staged", "flagged", "pending", "approved", "rejected"] as const;

const STATUS_COLORS: Record<string, string> = {
  staged: "bg-blue-100 text-blue-700",
  flagged: "bg-orange-100 text-orange-700",
  pending: "bg-gray-100 text-gray-600",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
};

function confidenceBadge(conf: number) {
  const cls =
    conf >= 0.9
      ? "bg-green-100 text-green-700"
      : conf >= 0.7
        ? "bg-yellow-100 text-yellow-700"
        : "bg-red-100 text-red-700";
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}
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
  if (flags.length === 0) return <span className="text-gray-400">-</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {flags.map((f, i) => {
        const cls =
          f.severity === "error"
            ? "bg-red-100 text-red-700"
            : f.severity === "warning"
              ? "bg-orange-100 text-orange-700"
              : "bg-gray-100 text-gray-600";
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

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const user = await requireAuth("view");

  const params = await searchParams;
  const activeStatus = params.status || "staged";
  const searchQuery = params.q || "";
  const stats = getReviewStats();
  const fees = getFeesByStatus(activeStatus, searchQuery || undefined);

  const canApprove = user.role === "analyst" || user.role === "admin";
  const canBulkApprove = user.role === "admin";

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Breadcrumbs items={[
            { label: "Dashboard", href: "/admin" },
            { label: "Review Fees" },
          ]} />
          <h1 className="text-xl font-semibold text-gray-900">
            Fee Review Queue
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Review and approve extracted fee data
          </p>
        </div>
        {canBulkApprove && activeStatus === "staged" && fees.length > 0 && (
          <BulkApproveButton count={fees.length} />
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
              className={`px-4 py-2.5 text-sm font-medium capitalize transition border-b-2 -mb-px ${
                isActive
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab}
              <span
                className={`ml-1.5 inline-block rounded-full px-1.5 py-0.5 text-xs ${
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
            Showing {fees.length} result{fees.length !== 1 ? "s" : ""} for
            &quot;{searchQuery}&quot;
          </span>
          <Link
            href={`/admin/review?status=${activeStatus}`}
            className="text-blue-600 hover:underline text-xs"
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
        <div className="bg-white rounded-lg border">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left text-gray-500">
                  <th className="px-4 py-3 font-medium">Institution</th>
                  <th className="px-4 py-3 font-medium">Fee Name</th>
                  <th className="px-4 py-3 font-medium text-right">Amount</th>
                  <th className="px-4 py-3 font-medium">Frequency</th>
                  <th className="px-4 py-3 font-medium text-center">
                    Confidence
                  </th>
                  <th className="px-4 py-3 font-medium">Flags</th>
                  {canApprove && (
                    <th className="px-4 py-3 font-medium text-right">
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
    <tr className="border-b last:border-0 hover:bg-gray-50">
      <td className="px-4 py-3">
        <Link
          href={`/admin/peers/${fee.crawl_target_id}`}
          className="font-medium text-blue-600 hover:underline text-xs"
        >
          {fee.institution_name}
        </Link>
        <div className="text-xs text-gray-400">
          {fee.state_code} | {fee.charter_type === "bank" ? "Bank" : "CU"}
        </div>
      </td>
      <td className="px-4 py-3">
        <Link
          href={`/admin/review/${fee.id}`}
          className="text-blue-600 hover:underline font-medium"
        >
          {fee.fee_name}
        </Link>
        {fee.conditions && (
          <div className="text-xs text-gray-400 mt-0.5 max-w-xs truncate">
            {fee.conditions}
          </div>
        )}
      </td>
      <td className="px-4 py-3 text-right font-mono text-gray-900">
        {formatAmount(fee.amount)}
      </td>
      <td className="px-4 py-3 text-gray-600 text-xs">
        {fee.frequency || "-"}
      </td>
      <td className="px-4 py-3 text-center">
        {confidenceBadge(fee.extraction_confidence)}
      </td>
      <td className="px-4 py-3">
        <FlagsBadges flags={flags} />
      </td>
      {canApprove && (
        <td className="px-4 py-3 text-right">
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
