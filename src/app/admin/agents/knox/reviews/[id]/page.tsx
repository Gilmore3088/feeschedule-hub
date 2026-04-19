export const dynamic = "force-dynamic";

import Link from "next/link";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { requireAuth } from "@/lib/auth";
import { formatAmount } from "@/lib/format";
import { getKnoxRejectionById } from "@/lib/crawler-db/knox-reviews";
import {
  ConfirmButton,
  OverrideButton,
} from "../review-actions";

const REASON_LABELS: Record<string, string> = {
  outlier: "Outlier",
  duplicate: "Duplicate",
  low_confidence: "Low confidence",
  schema_mismatch: "Schema mismatch",
  canonical_miss: "Canonical miss",
  policy_violation: "Policy violation",
  other: "Other",
};

function confidenceBadge(conf: number | null) {
  if (conf === null || conf === undefined) return <span className="text-gray-400">-</span>;
  const pct = Math.round(Number(conf) * 100);
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

export default async function KnoxRejectionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireAuth("view");
  const { id } = await params;
  const detail = await getKnoxRejectionById(id);

  if (!detail) {
    return (
      <div className="admin-card p-8">
        <p className="text-gray-500">
          Rejection {id} not found or is not a Knox rejection.
        </p>
        <Link
          href="/admin/agents/knox/reviews"
          className="mt-3 inline-block text-sm text-blue-600 hover:underline"
        >
          Back to queue
        </Link>
      </div>
    );
  }

  const canAct =
    (user.role === "analyst" || user.role === "admin") &&
    detail.review_decision === null;

  const reasonCat = detail.reason_category ?? "other";
  const handshakeReady = Boolean(detail.darwin_accept_message_id);

  return (
    <>
      <div className="mb-6">
        <Breadcrumbs
          items={[
            { label: "Dashboard", href: "/admin" },
            { label: "Agents", href: "/admin/agents" },
            { label: "Knox Reviews", href: "/admin/agents/knox/reviews" },
            { label: id.slice(0, 8) },
          ]}
        />
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
            {detail.fee_name ?? "(unknown fee)"}
          </h1>
          <span className="inline-block rounded-full px-2.5 py-0.5 text-xs font-medium bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400">
            Knox rejected
          </span>
          {detail.review_decision && (
            <span
              className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
                detail.review_decision === "override"
                  ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
                  : "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400"
              }`}
            >
              Human {detail.review_decision}
              {detail.reviewer_username ? ` by ${detail.reviewer_username}` : ""}
            </span>
          )}
        </div>
        <p className="text-sm text-gray-500 mt-0.5">
          {detail.institution_name ?? "-"}
          {detail.state_code ? ` · ${detail.state_code}` : ""}
          {" · "}
          <span className="tabular-nums">
            {new Date(detail.created_at).toLocaleString()}
          </span>
        </p>
      </div>

      {/* Side-by-side: Knox's reasoning vs the fee */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* Knox said NO because */}
        <div className="admin-card">
          <div className="px-5 py-3 border-b bg-red-50/60 dark:bg-red-900/10">
            <h2 className="text-sm font-bold text-red-700 dark:text-red-400">
              Knox said NO because
            </h2>
          </div>
          <div className="p-5 space-y-4">
            <div>
              <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                Reason category
              </div>
              <div className="mt-1 inline-block rounded-full px-2 py-0.5 bg-gray-100 dark:bg-white/[0.06] text-gray-700 dark:text-gray-300 text-[11px] font-medium">
                {REASON_LABELS[reasonCat]}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                Rejection reason
              </div>
              <p className="mt-1 text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
                {detail.reason ?? "(no reason recorded)"}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                  Knox confidence
                </div>
                <div className="mt-1">
                  {confidenceBadge(detail.confidence !== null ? Number(detail.confidence) : null)}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                  Round
                </div>
                <div className="mt-1 text-sm tabular-nums text-gray-800 dark:text-gray-200">
                  {detail.round_number}
                </div>
              </div>
            </div>
            <div>
              <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                Raw payload
              </div>
              <pre className="mt-1 rounded bg-gray-50 dark:bg-white/[0.03] border border-gray-100 dark:border-white/[0.06] p-3 text-[11px] text-gray-700 dark:text-gray-300 overflow-x-auto tabular-nums">
{JSON.stringify(detail.payload, null, 2)}
              </pre>
            </div>
          </div>
        </div>

        {/* What the fee looks like */}
        <div className="admin-card">
          <div className="px-5 py-3 border-b bg-gray-50/80 dark:bg-white/[0.03]">
            <h2 className="text-sm font-bold text-gray-800 dark:text-gray-200">
              What the fee looks like
            </h2>
          </div>
          <div className="p-5">
            <dl className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                  Fee name
                </dt>
                <dd className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100">
                  {detail.fee_name ?? "-"}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                  Amount
                </dt>
                <dd className="mt-1 text-sm tabular-nums text-gray-900 dark:text-gray-100">
                  {detail.amount !== null ? formatAmount(Number(detail.amount)) : "-"}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                  Frequency
                </dt>
                <dd className="mt-1 text-sm text-gray-800 dark:text-gray-200">
                  {detail.frequency ?? "-"}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                  Extraction confidence
                </dt>
                <dd className="mt-1">
                  {confidenceBadge(
                    detail.extraction_confidence !== null
                      ? Number(detail.extraction_confidence)
                      : null
                  )}
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                  Canonical fee key
                </dt>
                <dd className="mt-1 text-sm font-mono text-gray-800 dark:text-gray-200">
                  {detail.canonical_fee_key ?? "-"}
                </dd>
              </div>
              {detail.variant_type && (
                <div className="col-span-2">
                  <dt className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                    Variant
                  </dt>
                  <dd className="mt-1 text-sm text-gray-800 dark:text-gray-200">
                    {detail.variant_type}
                  </dd>
                </div>
              )}
              {detail.fee_raw_conditions && (
                <div className="col-span-2">
                  <dt className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                    Raw conditions
                  </dt>
                  <dd className="mt-1 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                    {detail.fee_raw_conditions}
                  </dd>
                </div>
              )}
              {detail.source_url && (
                <div className="col-span-2">
                  <dt className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                    Source
                  </dt>
                  <dd className="mt-1">
                    <a
                      href={detail.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:underline break-all"
                    >
                      {detail.source_url}
                    </a>
                  </dd>
                </div>
              )}
            </dl>

            {!handshakeReady && canAct && (
              <div className="mt-5 rounded border border-amber-200 bg-amber-50/80 dark:border-amber-900/40 dark:bg-amber-900/10 p-3 text-[11px] text-amber-800 dark:text-amber-400">
                Darwin has not yet posted <code className="font-mono">accept</code> for this
                fee. Overriding records your verdict and a human-attested Knox accept;
                promotion to <code className="font-mono">fees_published</code> will complete
                on Darwin&apos;s next pass.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="admin-card">
        <div className="px-5 py-3 border-b bg-gray-50/80 dark:bg-white/[0.03]">
          <h2 className="text-sm font-bold text-gray-800 dark:text-gray-200">
            Reviewer actions
          </h2>
        </div>
        <div className="p-5 flex flex-wrap items-center gap-3">
          {canAct ? (
            <>
              <ConfirmButton
                messageId={detail.message_id}
                feeVerifiedId={detail.fee_verified_id}
              />
              <OverrideButton
                messageId={detail.message_id}
                feeVerifiedId={detail.fee_verified_id}
              />
              <Link
                href="/admin/agents/knox/reviews"
                className="rounded px-2 py-1 text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-white/[0.08] dark:text-gray-400 dark:hover:bg-white/[0.12] transition-colors"
              >
                Skip / Back to queue
              </Link>
            </>
          ) : (
            <p className="text-sm text-gray-500">
              {detail.review_decision
                ? `Reviewed ${detail.review_decision} by ${detail.reviewer_username ?? "unknown"} at ${detail.reviewed_at ? new Date(detail.reviewed_at).toLocaleString() : "?"}.`
                : "You do not have permission to act on this rejection."}
            </p>
          )}
        </div>
      </div>
    </>
  );
}
