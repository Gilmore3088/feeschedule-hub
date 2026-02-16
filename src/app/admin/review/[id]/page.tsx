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
  staged: "bg-blue-100 text-blue-700",
  flagged: "bg-orange-100 text-orange-700",
  pending: "bg-gray-100 text-gray-600",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
};

const SEVERITY_COLORS: Record<string, string> = {
  error: "bg-red-100 text-red-700 border-red-200",
  warning: "bg-orange-100 text-orange-700 border-orange-200",
  info: "bg-blue-100 text-blue-700 border-blue-200",
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
          <h1 className="text-xl font-semibold text-gray-900">
            {fee.fee_name}
          </h1>
          <span
            className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
              STATUS_COLORS[fee.review_status] || "bg-gray-100 text-gray-600"
            }`}
          >
            {fee.review_status}
          </span>
        </div>
        <p className="text-sm text-gray-500 mt-0.5">
          {fee.institution_name} | {fee.state_code} |{" "}
          {fee.charter_type === "bank" ? "Bank" : "Credit Union"}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        {/* Fee details */}
        <div className="md:col-span-2 bg-white rounded-lg border">
          <div className="px-6 py-3 border-b bg-gray-50">
            <h2 className="font-semibold text-gray-900">Fee Details</h2>
          </div>
          <div className="p-6">
            <dl className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-xs text-gray-500 uppercase tracking-wide">
                  Fee Name
                </dt>
                <dd className="mt-1 text-sm font-medium text-gray-900">
                  {fee.fee_name}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500 uppercase tracking-wide">
                  Amount
                </dt>
                <dd className="mt-1 text-sm font-mono font-semibold text-gray-900">
                  {formatAmount(fee.amount)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500 uppercase tracking-wide">
                  Frequency
                </dt>
                <dd className="mt-1 text-sm text-gray-700">
                  {fee.frequency || "-"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500 uppercase tracking-wide">
                  Confidence
                </dt>
                <dd className="mt-1">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                      fee.extraction_confidence >= 0.9
                        ? "bg-green-100 text-green-700"
                        : fee.extraction_confidence >= 0.7
                          ? "bg-yellow-100 text-yellow-700"
                          : "bg-red-100 text-red-700"
                    }`}
                  >
                    {(fee.extraction_confidence * 100).toFixed(0)}%
                  </span>
                </dd>
              </div>
              {fee.conditions && (
                <div className="col-span-2">
                  <dt className="text-xs text-gray-500 uppercase tracking-wide">
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
        <div className="bg-white rounded-lg border">
          <div className="px-6 py-3 border-b bg-gray-50">
            <h2 className="font-semibold text-gray-900">Validation Flags</h2>
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
                      "bg-gray-100 text-gray-600 border-gray-200"
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
      <div className="bg-white rounded-lg border">
        <div className="px-6 py-3 border-b bg-gray-50">
          <h2 className="font-semibold text-gray-900">Audit Trail</h2>
        </div>
        {auditTrail.length === 0 ? (
          <div className="p-6 text-sm text-gray-500">
            No review actions yet
          </div>
        ) : (
          <div className="divide-y">
            {auditTrail.map((review) => (
              <div key={review.id} className="px-6 py-3">
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
                  <div className="text-xs text-gray-400">
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
