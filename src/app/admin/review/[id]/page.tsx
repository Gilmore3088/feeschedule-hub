import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { getFeeById, getAuditTrail } from "@/lib/crawler-db";
import { ApproveButton, RejectButton } from "../review-actions";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { formatAmount } from "@/lib/format";

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

const STATUS_COLORS: Record<string, string> = {
  staged: "bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
  flagged: "bg-orange-50 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400",
  pending: "bg-gray-100 text-gray-500 dark:bg-white/[0.08] dark:text-gray-400",
  approved: "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400",
  rejected: "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400",
};

const SEVERITY_COLORS: Record<string, string> = {
  error: "bg-red-50 text-red-600 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800/40",
  warning: "bg-orange-50 text-orange-600 border-orange-200 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-800/40",
  info: "bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800/40",
};

const ACTION_LABELS: Record<string, string> = {
  approve: "Approved",
  reject: "Rejected",
  edit: "Edited",
  bulk_approve: "Bulk Approved",
  stage: "Staged",
  flag: "Flagged",
  reset: "Reset (re-crawl)",
};

export default async function FeeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireAuth("view");

  const { id } = await params;
  const feeId = parseInt(id, 10);
  const fee = getFeeById(feeId);

  if (!fee) {
    return <p className="text-gray-500">Fee not found</p>;
  }

  const auditTrail = getAuditTrail(feeId);
  const flags = parseFlags(fee.validation_flags);
  const canApprove = user.role === "analyst" || user.role === "admin";
  const isActionable =
    fee.review_status === "staged" ||
    fee.review_status === "flagged" ||
    fee.review_status === "pending";

  return (
    <>
      <div className="mb-6">
        <Breadcrumbs items={[
          { label: "Dashboard", href: "/admin" },
          { label: "Review", href: "/admin/review" },
          { label: `Fee #${feeId}` },
        ]} />
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold tracking-tight text-gray-900">
            {fee.fee_name}
          </h1>
          <span
            className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
              STATUS_COLORS[fee.review_status] || "bg-gray-100 text-gray-500"
            }`}
          >
            {fee.review_status}
          </span>
        </div>
        <p className="text-sm text-gray-500 mt-0.5">
          {fee.institution_name} | {fee.state_code} |{" "}
          {fee.charter_type === "bank" ? "Bank" : "Credit Union"}
          {fee.document_url && (
            <>
              {" | "}
              <a
                href={fee.document_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:text-blue-700 transition-colors"
              >
                View Source
              </a>
            </>
          )}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        {/* Fee details */}
        <div className="md:col-span-2 admin-card">
          <div className="px-5 py-3 border-b bg-gray-50/80">
            <h2 className="text-sm font-bold text-gray-800">Fee Details</h2>
          </div>
          <div className="p-6">
            <dl className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                  Fee Name
                </dt>
                <dd className="mt-1 text-sm font-medium text-gray-900">
                  {fee.fee_name}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                  Amount
                </dt>
                <dd className="mt-1 text-sm tabular-nums font-semibold text-gray-900">
                  {formatAmount(fee.amount)}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                  Frequency
                </dt>
                <dd className="mt-1 text-sm text-gray-700">
                  {fee.frequency || "-"}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                  Confidence
                </dt>
                <dd className="mt-1">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${
                      fee.extraction_confidence >= 0.9
                        ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
                        : fee.extraction_confidence >= 0.7
                          ? "bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400"
                          : "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                    }`}
                  >
                    {(fee.extraction_confidence * 100).toFixed(0)}%
                  </span>
                </dd>
              </div>
              {fee.conditions && (
                <div className="col-span-2">
                  <dt className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                    Conditions
                  </dt>
                  <dd className="mt-1 text-sm text-gray-700">
                    {fee.conditions}
                  </dd>
                </div>
              )}
            </dl>

            {canApprove && isActionable && (
              <div className="mt-6 pt-4 border-t flex gap-2">
                <ApproveButton feeId={fee.id} />
                <RejectButton feeId={fee.id} />
              </div>
            )}
          </div>
        </div>

        {/* Validation flags */}
        <div className="admin-card">
          <div className="px-5 py-3 border-b bg-gray-50/80">
            <h2 className="text-sm font-bold text-gray-800">Validation Flags</h2>
          </div>
          <div className="p-4">
            {flags.length === 0 ? (
              <p className="text-sm text-gray-500">
                No validation issues detected
              </p>
            ) : (
              <div className="space-y-2">
                {flags.map((f, i) => (
                  <div
                    key={i}
                    className={`rounded border p-2.5 text-xs ${
                      SEVERITY_COLORS[f.severity] ||
                      "bg-gray-100 text-gray-500 border-gray-200"
                    }`}
                  >
                    <div className="font-medium capitalize">
                      {f.severity}: {f.rule.replace(/_/g, " ")}
                    </div>
                    <div className="mt-0.5 opacity-80">{f.message}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Audit trail */}
      <div className="admin-card">
        <div className="px-5 py-3 border-b bg-gray-50/80">
          <h2 className="text-sm font-bold text-gray-800">Audit Trail</h2>
        </div>
        {auditTrail.length === 0 ? (
          <div className="p-6 text-sm text-gray-500">
            No review actions yet
          </div>
        ) : (
          <div className="divide-y">
            {auditTrail.map((review) => (
              <div key={review.id} className="px-5 py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">
                      {ACTION_LABELS[review.action] || review.action}
                    </span>
                    {review.previous_status && review.new_status && (
                      <span className="text-xs text-gray-500">
                        {review.previous_status} &rarr; {review.new_status}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-gray-400">
                    {review.username || "system"} |{" "}
                    {new Date(review.created_at).toLocaleString()}
                  </div>
                </div>
                {review.notes && (
                  <p className="mt-1 text-xs text-gray-500">{review.notes}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
