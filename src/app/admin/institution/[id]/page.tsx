export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { formatAssets } from "@/lib/format";
import { FeeTable } from "./fee-table";
import {
  getInstitution,
  getInstitutionFees,
  getInstitutionCrawlHistory,
  getInstitutionAgentResults,
} from "@/lib/crawler-db/institution";
import { InstitutionActions } from "./institution-actions";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function InstitutionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAuth("view");
  const { id } = await params;
  const institutionId = Number(id);

  if (isNaN(institutionId)) notFound();

  const [institution, fees, crawlHistory, agentResults] = await Promise.all([
    getInstitution(institutionId),
    getInstitutionFees(institutionId),
    getInstitutionCrawlHistory(institutionId),
    getInstitutionAgentResults(institutionId),
  ]);

  if (!institution) notFound();

  const stateCode = institution.state_code ?? "??";

  return (
    <>
      {/* Header */}
      <div className="mb-5">
        <Breadcrumbs
          items={[
            { label: "Dashboard", href: "/admin" },
            { label: "States", href: "/admin/states" },
            { label: stateCode, href: `/admin/states/${stateCode}` },
            { label: institution.institution_name },
          ]}
        />
        <h1 className="text-xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
          {institution.institution_name}
        </h1>
        <p className="text-[11px] text-gray-400 mt-0.5">
          {[
            institution.city,
            stateCode,
            institution.charter_type,
            institution.asset_size_tier,
            institution.fed_district
              ? `District ${institution.fed_district}`
              : null,
          ]
            .filter(Boolean)
            .join(" / ")}
        </p>
      </div>

      {/* Profile + Actions row */}
      <div className="grid md:grid-cols-2 gap-4 mb-8">
        {/* Profile Card */}
        <div className="admin-card p-4">
          <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.08em] mb-3">
            Profile
          </h3>
          <dl className="space-y-2 text-xs">
            <ProfileRow label="Website">
              {institution.website_url ? (
                <a
                  href={institution.website_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 dark:text-blue-400 hover:underline break-all"
                >
                  {truncateUrl(institution.website_url)}
                </a>
              ) : (
                <span className="text-gray-400">-</span>
              )}
            </ProfileRow>
            <ProfileRow label="Fee Schedule URL">
              {institution.fee_schedule_url ? (
                <a
                  href={institution.fee_schedule_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 dark:text-blue-400 hover:underline break-all"
                >
                  {truncateUrl(institution.fee_schedule_url)}
                </a>
              ) : (
                <span className="text-gray-400">
                  {institution.document_type === "offline" ? "offline" : "none"}
                </span>
              )}
            </ProfileRow>
            <ProfileRow label="Document Type">
              {institution.document_type ? (
                <DocTypeBadge type={institution.document_type} />
              ) : (
                <span className="text-gray-400">-</span>
              )}
            </ProfileRow>
            <ProfileRow label="Cert Number">
              <span className="text-gray-700 dark:text-gray-300 tabular-nums">
                {institution.cert_number ?? "-"}
              </span>
            </ProfileRow>
            <ProfileRow label="Asset Size">
              <span className="text-gray-700 dark:text-gray-300 tabular-nums">
                {institution.asset_size
                  ? formatAssets(institution.asset_size)
                  : "-"}
              </span>
            </ProfileRow>
            <ProfileRow label="Last Crawl">
              <span className="text-gray-700 dark:text-gray-300 tabular-nums">
                {institution.last_crawl_at}
              </span>
            </ProfileRow>
            <ProfileRow label="Consecutive Failures">
              <span
                className={`tabular-nums ${
                  institution.consecutive_failures > 0
                    ? "text-red-600 dark:text-red-400 font-medium"
                    : "text-gray-700 dark:text-gray-300"
                }`}
              >
                {institution.consecutive_failures}
              </span>
            </ProfileRow>
          </dl>
        </div>

        {/* Admin Actions */}
        <InstitutionActions
          institutionId={institution.id}
          feeScheduleUrl={institution.fee_schedule_url}
          documentType={institution.document_type}
        />
      </div>

      {/* Extracted Fees */}
      <div className="admin-card overflow-hidden mb-8">
        <div className="px-4 py-2.5 border-b border-gray-100 dark:border-white/[0.04]">
          <h2 className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.08em]">
            Extracted Fees ({fees.length})
          </h2>
        </div>
        {fees.length > 0 ? (
          <FeeTable fees={fees} institutionId={institution.id} />
        ) : (
          <div className="p-6 text-xs text-gray-400 text-center">
            No fees extracted. Set a fee schedule URL and run the agent.
          </div>
        )}
      </div>

      {/* Agent History */}
      <div className="admin-card overflow-hidden mb-8">
        <div className="px-4 py-2.5 border-b border-gray-100 dark:border-white/[0.04]">
          <h2 className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.08em]">
            Agent History ({agentResults.length})
          </h2>
        </div>
        {agentResults.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="admin-table w-full text-xs">
              <thead>
                <tr className="text-left">
                  <th>Date</th>
                  <th>Stage</th>
                  <th className="text-center">Status</th>
                  <th>Detail</th>
                  <th className="text-center">Run</th>
                </tr>
              </thead>
              <tbody>
                {agentResults.map((r) => (
                  <tr
                    key={r.id}
                    className="hover:bg-gray-50/50 dark:hover:bg-white/[0.04] transition-colors"
                  >
                    <td className="text-gray-700 dark:text-gray-300 tabular-nums">
                      {r.run_started_at}
                    </td>
                    <td className="text-gray-700 dark:text-gray-300 capitalize">
                      {r.stage}
                    </td>
                    <td className="text-center">
                      <StageBadge status={r.status} />
                    </td>
                    <td className="text-gray-500 max-w-[240px] truncate">
                      {summarizeDetail(r.detail)}
                    </td>
                    <td className="text-center">
                      <Link
                        href={`/admin/states/${stateCode}/runs/${r.agent_run_id}`}
                        className="text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        #{r.agent_run_id}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-6 text-xs text-gray-400 text-center">
            No agent results yet
          </div>
        )}
      </div>

      {/* Crawl History */}
      <div className="admin-card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-gray-100 dark:border-white/[0.04]">
          <h2 className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.08em]">
            Crawl History ({crawlHistory.length})
          </h2>
        </div>
        {crawlHistory.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="admin-table w-full text-xs">
              <thead>
                <tr className="text-left">
                  <th>Date</th>
                  <th className="text-center">Status</th>
                  <th>Document URL</th>
                  <th className="text-right">Fees</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {crawlHistory.map((cr) => (
                  <tr
                    key={cr.id}
                    className="hover:bg-gray-50/50 dark:hover:bg-white/[0.04] transition-colors"
                  >
                    <td className="text-gray-700 dark:text-gray-300 tabular-nums">
                      {cr.crawled_at}
                    </td>
                    <td className="text-center">
                      <CrawlStatusBadge status={cr.status} />
                    </td>
                    <td className="text-gray-500 max-w-[200px] truncate">
                      {cr.document_url ? (
                        <a
                          href={cr.document_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 dark:text-blue-400 hover:underline"
                          title={cr.document_url}
                        >
                          {truncateUrl(cr.document_url, 40)}
                        </a>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="text-right tabular-nums text-gray-700 dark:text-gray-300">
                      {cr.fees_extracted}
                    </td>
                    <td className="text-gray-500 max-w-[200px] truncate">
                      {cr.error_message ? (
                        <span
                          className="text-red-600 dark:text-red-400"
                          title={cr.error_message}
                        >
                          {truncate(cr.error_message, 50)}
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-6 text-xs text-gray-400 text-center">
            No crawl history
          </div>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

function truncateUrl(url: string, maxLen = 50): string {
  try {
    const parsed = new URL(url);
    const display = parsed.hostname + parsed.pathname;
    return display.length > maxLen ? display.slice(0, maxLen) + "..." : display;
  } catch {
    return url.length > maxLen ? url.slice(0, maxLen) + "..." : url;
  }
}

function truncate(s: string, max = 60): string {
  return s.length > max ? s.slice(0, max) + "..." : s;
}

function summarizeDetail(
  detail: Record<string, unknown> | null,
): string {
  if (!detail) return "-";
  const parts: string[] = [];
  if (detail.fee_count != null) parts.push(`${detail.fee_count} fees`);
  if (detail.data_quality != null) parts.push(`quality: ${detail.data_quality}`);
  if (detail.reason) parts.push(String(detail.reason));
  if (detail.error) parts.push(String(detail.error));
  if (detail.url) parts.push(truncate(String(detail.url), 30));
  return parts.length > 0 ? parts.join(", ") : "-";
}

// ---------------------------------------------------------------------------
// Helper Components
// ---------------------------------------------------------------------------

function ProfileRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <dt className="text-gray-400 w-36 shrink-0">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

function DocTypeBadge({ type }: { type: string }) {
  const styles: Record<string, string> = {
    pdf: "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    html: "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    js_rendered:
      "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    offline:
      "bg-gray-100 text-gray-500 dark:bg-white/[0.06] dark:text-gray-400",
  };
  const cls =
    styles[type] ??
    "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${cls}`}
    >
      {type}
    </span>
  );
}

function StageBadge({ status }: { status: string }) {
  const isOk =
    status === "ok" || status === "success" || status === "completed";
  if (isOk) {
    return (
      <span className="inline-block rounded px-1.5 py-0.5 text-[10px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
        {status}
      </span>
    );
  }
  if (status === "skipped") {
    return (
      <span className="inline-block rounded px-1.5 py-0.5 text-[10px] font-bold bg-gray-100 text-gray-500 dark:bg-white/[0.06] dark:text-gray-400">
        skipped
      </span>
    );
  }
  return (
    <span className="inline-block rounded px-1.5 py-0.5 text-[10px] font-bold bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400">
      {status}
    </span>
  );
}

function CrawlStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    success:
      "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    ok: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    failed:
      "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    error:
      "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  };
  const cls =
    styles[status] ??
    "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${cls}`}
    >
      {status}
    </span>
  );
}

