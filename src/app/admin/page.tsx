import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { getStats, getInstitutionsWithFees, getFinancialStats } from "@/lib/crawler-db";

function formatAssets(assets: number | null): string {
  if (!assets) return "N/A";
  if (assets > 1_000_000) return `$${(assets / 1_000_000).toFixed(0)}B`;
  if (assets > 1_000) return `$${(assets / 1_000).toFixed(0)}M`;
  return `$${assets}K`;
}

export default async function AdminDashboard() {
  await requireAuth("view");

  const stats = getStats();
  const finStats = getFinancialStats();
  const institutions = getInstitutionsWithFees();

  return (
    <>
      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Total Institutions"
          value={stats.total_institutions.toLocaleString()}
        />
        <StatCard
          label="With Fee URL"
          value={stats.with_fee_url.toLocaleString()}
          sub={`${((stats.with_fee_url / Math.max(stats.with_website, 1)) * 100).toFixed(0)}% of crawled`}
        />
        <StatCard
          label="Fees Extracted"
          value={stats.total_fees.toLocaleString()}
        />
        <StatCard
          label="Crawl Runs"
          value={stats.crawl_runs.toLocaleString()}
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
        <StatCard label="Banks (FDIC)" value={stats.banks.toLocaleString()} />
        <StatCard
          label="Credit Unions (NCUA)"
          value={stats.credit_unions.toLocaleString()}
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
            value="47"
            sub="9 families"
          />
        </div>
      )}

      {/* Institutions with fees */}
      <div className="bg-white rounded-lg border">
        <div className="px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">
            Institutions with Extracted Fees
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Click an institution to view all extracted fees
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-gray-500">
                <th className="px-6 py-3 font-medium">Institution</th>
                <th className="px-6 py-3 font-medium">State</th>
                <th className="px-6 py-3 font-medium">Type</th>
                <th className="px-6 py-3 font-medium text-right">Assets</th>
                <th className="px-6 py-3 font-medium text-center">Doc</th>
                <th className="px-6 py-3 font-medium text-right">Fees</th>
              </tr>
            </thead>
            <tbody>
              {institutions.map((inst) => (
                <tr
                  key={inst.id}
                  className="border-b last:border-0 hover:bg-gray-50"
                >
                  <td className="px-6 py-3">
                    <Link
                      href={`/admin/fees?id=${inst.id}`}
                      className="text-blue-600 hover:underline font-medium"
                    >
                      {inst.institution_name}
                    </Link>
                  </td>
                  <td className="px-6 py-3 text-gray-500">
                    {inst.state_code || "-"}
                  </td>
                  <td className="px-6 py-3">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        inst.charter_type === "bank"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-green-100 text-green-700"
                      }`}
                    >
                      {inst.charter_type === "bank" ? "Bank" : "CU"}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-right text-gray-600">
                    {formatAssets(inst.asset_size)}
                  </td>
                  <td className="px-6 py-3 text-center">
                    <span
                      className={`inline-block rounded px-1.5 py-0.5 text-xs font-mono ${
                        inst.document_type === "pdf"
                          ? "bg-red-100 text-red-700"
                          : "bg-orange-100 text-orange-700"
                      }`}
                    >
                      {inst.document_type?.toUpperCase() || "?"}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-right">
                    {inst.fee_count > 0 ? (
                      <span className="font-semibold text-gray-900">
                        {inst.fee_count}
                      </span>
                    ) : (
                      <span className="text-gray-400">0</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border bg-white px-4 py-3">
      <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-semibold text-gray-900 mt-1">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}
