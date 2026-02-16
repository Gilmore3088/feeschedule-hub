import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { getStats, getInstitutionsWithFees, getFinancialStats, getFeeCategorySummaries, getReviewStats } from "@/lib/crawler-db";
import { getDisplayName, getFeeFamily, getFamilyColor } from "@/lib/fee-taxonomy";
import { formatAssets } from "@/lib/format";
import { InstitutionTable } from "./institution-table";

export default async function AdminDashboard() {
  await requireAuth("view");

  const stats = getStats();
  const finStats = getFinancialStats();
  const institutions = getInstitutionsWithFees();
  const allFees = getFeeCategorySummaries();
  const topFees = allFees.slice(0, 8);
  const reviewStats = getReviewStats();

  const needsAttention = reviewStats.staged + reviewStats.flagged;

  return (
    <>
      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Total Institutions"
          value={stats.total_institutions.toLocaleString()}
          href="/admin/peers"
        />
        <StatCard
          label="With Fee URL"
          value={stats.with_fee_url.toLocaleString()}
          sub={`${((stats.with_fee_url / Math.max(stats.with_website, 1)) * 100).toFixed(0)}% of crawled`}
          href="/admin/fees"
        />
        <StatCard
          label="Fees Extracted"
          value={stats.total_fees.toLocaleString()}
          href="/admin/fees"
        />
        <StatCard
          label="Crawl Runs"
          value={stats.crawl_runs.toLocaleString()}
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
        <StatCard
          label="Banks (FDIC)"
          value={stats.banks.toLocaleString()}
          href="/admin/peers?type=bank"
        />
        <StatCard
          label="Credit Unions (NCUA)"
          value={stats.credit_unions.toLocaleString()}
          href="/admin/peers?type=credit_union"
        />
        <StatCard
          label="With Website"
          value={stats.with_website.toLocaleString()}
        />
      </div>

      {/* Financial data stats */}
      {(finStats.fdic_records > 0 || finStats.ncua_records > 0) && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          <StatCard
            label="Financial Records"
            value={(finStats.fdic_records + finStats.ncua_records).toLocaleString()}
            sub={`${finStats.institutions_with_financials.toLocaleString()} institutions`}
          />
          <StatCard
            label="FDIC Financials"
            value={finStats.fdic_records.toLocaleString()}
            sub="Bank call reports"
          />
          <StatCard
            label="NCUA Financials"
            value={finStats.ncua_records.toLocaleString()}
            sub="CU 5300 reports"
          />
          <StatCard
            label="CFPB Complaints"
            value={finStats.complaint_records.toLocaleString()}
            sub={`${finStats.institutions_with_complaints} institutions`}
          />
          <StatCard
            label="Fee Categories"
            value={allFees.length.toString()}
            sub={`${new Set(allFees.map((f) => getFeeFamily(f.fee_category)).filter(Boolean)).size} families`}
            href="/admin/fees/catalog"
          />
        </div>
      )}

      {/* Review queue summary */}
      {needsAttention > 0 && (
        <div className="bg-white rounded-lg border mb-8 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">
                Review Queue
              </h2>
              <p className="text-sm text-gray-500 mt-0.5">
                {needsAttention} fee{needsAttention !== 1 ? "s" : ""} need review
              </p>
            </div>
            <Link
              href="/admin/review?status=staged"
              className="text-sm text-blue-600 hover:underline font-medium"
            >
              Review now &rarr;
            </Link>
          </div>
          <div className="flex gap-4 mt-3">
            {reviewStats.staged > 0 && (
              <Link href="/admin/review?status=staged" className="text-sm hover:underline">
                <span className="inline-block rounded-full bg-blue-100 text-blue-700 px-2 py-0.5 text-xs font-medium mr-1">
                  {reviewStats.staged}
                </span>
                Staged
              </Link>
            )}
            {reviewStats.flagged > 0 && (
              <Link href="/admin/review?status=flagged" className="text-sm hover:underline">
                <span className="inline-block rounded-full bg-orange-100 text-orange-700 px-2 py-0.5 text-xs font-medium mr-1">
                  {reviewStats.flagged}
                </span>
                Flagged
              </Link>
            )}
            {reviewStats.pending > 0 && (
              <Link href="/admin/review?status=pending" className="text-sm hover:underline">
                <span className="inline-block rounded-full bg-gray-100 text-gray-600 px-2 py-0.5 text-xs font-medium mr-1">
                  {reviewStats.pending}
                </span>
                Pending
              </Link>
            )}
            <Link href="/admin/review?status=approved" className="text-sm text-gray-400 hover:underline">
              <span className="inline-block rounded-full bg-green-100 text-green-700 px-2 py-0.5 text-xs font-medium mr-1">
                {reviewStats.approved}
              </span>
              Approved
            </Link>
          </div>
        </div>
      )}

      {/* Top fee categories */}
      {topFees.length > 0 && (
        <div className="bg-white rounded-lg border mb-8">
          <div className="px-6 py-4 border-b flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Top Fee Categories
              </h2>
              <p className="text-sm text-gray-500 mt-0.5">
                Most common fee types across all institutions
              </p>
            </div>
            <Link
              href="/admin/fees/catalog"
              className="text-sm text-blue-600 hover:underline font-medium"
            >
              View all &rarr;
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left text-gray-500">
                  <th className="px-6 py-3 font-medium">Fee Type</th>
                  <th className="px-6 py-3 font-medium">Family</th>
                  <th className="px-6 py-3 font-medium text-right">Institutions</th>
                  <th className="px-6 py-3 font-medium text-right">Median</th>
                  <th className="px-6 py-3 font-medium text-right">Min</th>
                  <th className="px-6 py-3 font-medium text-right">Max</th>
                </tr>
              </thead>
              <tbody>
                {topFees.map((fee) => {
                  const family = getFeeFamily(fee.fee_category);
                  const colors = family ? getFamilyColor(family) : null;
                  return (
                    <tr
                      key={fee.fee_category}
                      className="border-b last:border-0 hover:bg-gray-50"
                    >
                      <td className="px-6 py-3">
                        <Link
                          href={`/admin/fees/catalog/${fee.fee_category}`}
                          className="text-blue-600 hover:underline font-medium"
                        >
                          {getDisplayName(fee.fee_category)}
                        </Link>
                      </td>
                      <td className="px-6 py-3">
                        {family && colors ? (
                          <span
                            className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${colors.bg} ${colors.text}`}
                          >
                            {family}
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-right font-semibold text-gray-900">
                        {fee.institution_count}
                      </td>
                      <td className="px-6 py-3 text-right font-mono text-gray-900">
                        {fee.median_amount !== null ? `$${fee.median_amount.toFixed(2)}` : "-"}
                      </td>
                      <td className="px-6 py-3 text-right font-mono text-gray-600">
                        {fee.min_amount !== null ? `$${fee.min_amount.toFixed(2)}` : "-"}
                      </td>
                      <td className="px-6 py-3 text-right font-mono text-gray-600">
                        {fee.max_amount !== null ? `$${fee.max_amount.toFixed(2)}` : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Institutions with fees */}
      <InstitutionTable institutions={institutions} />
    </>
  );
}

function StatCard({
  label,
  value,
  sub,
  href,
}: {
  label: string;
  value: string;
  sub?: string;
  href?: string;
}) {
  const content = (
    <div className={`rounded-lg border bg-white px-4 py-3 ${href ? "hover:shadow-sm hover:border-gray-300 transition-all cursor-pointer" : ""}`}>
      <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-semibold text-gray-900 mt-1">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }
  return content;
}
