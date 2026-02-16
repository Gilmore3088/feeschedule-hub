import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import {
  getInstitutionById,
  getPeerAnalysis,
  getFinancialsByInstitution,
  getComplaintsByInstitution,
} from "@/lib/crawler-db";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { formatAssets, formatAmount } from "@/lib/format";

const TIER_LABELS: Record<string, string> = {
  community_small: "Community (<$300M)",
  community_mid: "Community ($300M-$1B)",
  community_large: "Community ($1B-$10B)",
  regional: "Regional ($10B-$50B)",
  large_regional: "Large Regional ($50B-$250B)",
  super_regional: "Super Regional ($250B+)",
};

const DISTRICT_NAMES: Record<number, string> = {
  1: "Boston",
  2: "New York",
  3: "Philadelphia",
  4: "Cleveland",
  5: "Richmond",
  6: "Atlanta",
  7: "Chicago",
  8: "St. Louis",
  9: "Minneapolis",
  10: "Kansas City",
  11: "Dallas",
  12: "San Francisco",
};

interface FeeComparisonRow {
  canonical_name: string;
  display_name: string;
  target_amount: number | null;
  peer_min: number;
  peer_max: number;
  peer_median: number;
  peer_p25: number;
  peer_p75: number;
  peer_count: number;
  percentile_rank: number;
}

interface PeerRow {
  id: number;
  name: string;
  asset_size: number | null;
  tier: string;
  district: number | null;
  state: string | null;
  score: number;
}

interface Highlight {
  fee: string;
  direction: "above" | "below";
  amount: number;
  peer_median: number;
  percentile: number;
}

export default async function PeerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAuth("view");

  const { id } = await params;
  const targetId = parseInt(id, 10);
  const institution = getInstitutionById(targetId);

  if (!institution) {
    return <p className="text-gray-500">Institution not found</p>;
  }

  const financials = getFinancialsByInstitution(targetId);
  const complaints = getComplaintsByInstitution(targetId);

  const analysis = getPeerAnalysis(targetId) as {
    peer_count: number;
    peers: PeerRow[];
    fee_comparisons: FeeComparisonRow[];
    highlights: Highlight[];
  } | null;

  return (
    <>
      <div className="mb-6">
        <Breadcrumbs items={[
          { label: "Dashboard", href: "/admin" },
          { label: "Peer Groups", href: "/admin/peers" },
          { label: institution.institution_name },
        ]} />
        <h1 className="text-xl font-semibold text-gray-900">
          {institution.institution_name}
        </h1>
        <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
          <span
            className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
              institution.charter_type === "bank"
                ? "bg-blue-100 text-blue-700"
                : "bg-green-100 text-green-700"
            }`}
          >
            {institution.charter_type === "bank" ? "Bank" : "Credit Union"}
          </span>
          <span>{formatAssets(institution.asset_size)}</span>
          {institution.asset_size_tier && (
            <span>
              {TIER_LABELS[institution.asset_size_tier] ||
                institution.asset_size_tier}
            </span>
          )}
          {institution.fed_district && (
            <span>
              District {institution.fed_district} -{" "}
              {DISTRICT_NAMES[institution.fed_district]}
            </span>
          )}
          <span>
            {institution.city}, {institution.state_code}
          </span>
          <Link
            href={`/admin/fees?id=${targetId}`}
            className="text-blue-600 hover:text-blue-800"
          >
            View fees
          </Link>
        </div>
      </div>

      {/* Financial data */}
      {financials.length > 0 && (
        <div className="bg-white rounded-lg border mb-6">
          <div className="px-6 py-3 border-b bg-gray-50">
            <h2 className="font-semibold text-gray-900">Financial Data</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Source: {financials[0].source === "fdic" ? "FDIC Call Reports" : "NCUA 5300 Reports"}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left text-gray-500">
                  <th className="px-6 py-3 font-medium">Period</th>
                  <th className="px-6 py-3 font-medium text-right">Total Assets</th>
                  <th className="px-6 py-3 font-medium text-right">Deposits</th>
                  <th className="px-6 py-3 font-medium text-right">Loans</th>
                  <th className="px-6 py-3 font-medium text-right">
                    {financials[0].source === "ncua" ? "Fee Income" : "Non-Int Income"}
                  </th>
                  <th className="px-6 py-3 font-medium text-right">ROA</th>
                  <th className="px-6 py-3 font-medium text-right">
                    {financials[0].source === "fdic" ? "Efficiency" : "Net Worth"}
                  </th>
                  <th className="px-6 py-3 font-medium text-right">Branches</th>
                  <th className="px-6 py-3 font-medium text-right">
                    {financials[0].source === "ncua" ? "Members" : "Employees"}
                  </th>
                </tr>
              </thead>
              <tbody>
                {financials.map((f) => (
                  <tr key={f.report_date} className="border-b last:border-0">
                    <td className="px-6 py-3 font-medium text-gray-900">
                      {f.report_date}
                    </td>
                    <td className="px-6 py-3 text-right font-mono text-gray-700">
                      {formatAssets(f.total_assets)}
                    </td>
                    <td className="px-6 py-3 text-right font-mono text-gray-500">
                      {formatAssets(f.total_deposits)}
                    </td>
                    <td className="px-6 py-3 text-right font-mono text-gray-500">
                      {formatAssets(f.total_loans)}
                    </td>
                    <td className="px-6 py-3 text-right font-mono text-gray-500">
                      {f.source === "ncua"
                        ? formatAssets(f.service_charge_income)
                        : formatAssets(f.other_noninterest_income)}
                    </td>
                    <td className="px-6 py-3 text-right font-mono text-gray-500">
                      {f.roa != null ? `${f.roa.toFixed(2)}%` : "-"}
                    </td>
                    <td className="px-6 py-3 text-right font-mono text-gray-500">
                      {f.source === "fdic"
                        ? f.efficiency_ratio != null
                          ? `${f.efficiency_ratio.toFixed(1)}%`
                          : "-"
                        : f.tier1_capital_ratio != null
                          ? `${f.tier1_capital_ratio.toFixed(2)}%`
                          : "-"}
                    </td>
                    <td className="px-6 py-3 text-right text-gray-500">
                      {f.branch_count?.toLocaleString() ?? "-"}
                    </td>
                    <td className="px-6 py-3 text-right text-gray-500">
                      {f.source === "ncua"
                        ? f.member_count?.toLocaleString() ?? "-"
                        : f.employee_count?.toLocaleString() ?? "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CFPB Complaints */}
      {complaints.length > 0 && (
        <div className="bg-white rounded-lg border mb-6">
          <div className="px-6 py-3 border-b bg-gray-50">
            <h2 className="font-semibold text-gray-900">
              CFPB Complaints (2024)
            </h2>
          </div>
          <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
            {complaints.map((c) => (
              <div key={c.product} className="rounded-lg border p-3">
                <div className="text-sm text-gray-500">{c.product}</div>
                <div className="text-2xl font-semibold text-gray-900 mt-1">
                  {c.complaint_count.toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!analysis ? (
        <div className="bg-white rounded-lg border p-8 text-center text-gray-500">
          <p className="text-lg font-medium">No analysis available</p>
          <p className="mt-2 text-sm">
            Run{" "}
            <code className="bg-gray-100 px-2 py-0.5 rounded text-xs">
              python -m fee_crawler analyze --target-id {targetId}
            </code>{" "}
            to generate peer comparison data.
          </p>
        </div>
      ) : (
        <>
          {/* Highlights */}
          {analysis.highlights && analysis.highlights.length > 0 && (
            <div className="bg-white rounded-lg border mb-6">
              <div className="px-6 py-3 border-b bg-gray-50">
                <h2 className="font-semibold text-gray-900">
                  Notable Findings
                </h2>
              </div>
              <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                {analysis.highlights.map((h, i) => (
                  <div
                    key={i}
                    className={`rounded-lg border p-3 ${
                      h.direction === "above"
                        ? "border-red-200 bg-red-50"
                        : "border-green-200 bg-green-50"
                    }`}
                  >
                    <div className="font-medium text-gray-900">{h.fee}</div>
                    <div className="text-sm mt-1">
                      <span className="font-mono">
                        {formatAmount(h.amount)}
                      </span>
                      <span className="text-gray-500 mx-1">vs median</span>
                      <span className="font-mono">
                        {formatAmount(h.peer_median)}
                      </span>
                    </div>
                    <div
                      className={`text-xs mt-0.5 ${
                        h.direction === "above"
                          ? "text-red-600"
                          : "text-green-600"
                      }`}
                    >
                      {h.direction === "above" ? "Above" : "Below"}{" "}
                      {h.percentile}th percentile
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Fee comparison table */}
          {analysis.fee_comparisons &&
            analysis.fee_comparisons.length > 0 && (
              <div className="bg-white rounded-lg border mb-6">
                <div className="px-6 py-3 border-b bg-gray-50">
                  <h2 className="font-semibold text-gray-900">
                    Fee Comparison
                  </h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Compared against {analysis.peer_count} peers
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50 text-left text-gray-500">
                        <th className="px-6 py-3 font-medium">Fee</th>
                        <th className="px-6 py-3 font-medium text-right">
                          This Institution
                        </th>
                        <th className="px-6 py-3 font-medium text-right">
                          Peer Min
                        </th>
                        <th className="px-6 py-3 font-medium text-right">
                          P25
                        </th>
                        <th className="px-6 py-3 font-medium text-right">
                          Median
                        </th>
                        <th className="px-6 py-3 font-medium text-right">
                          P75
                        </th>
                        <th className="px-6 py-3 font-medium text-right">
                          Peer Max
                        </th>
                        <th className="px-6 py-3 font-medium text-center">
                          Rank
                        </th>
                        <th className="px-6 py-3 font-medium text-center">
                          Peers
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {analysis.fee_comparisons.map((fc) => {
                        const isAbove =
                          fc.target_amount !== null &&
                          fc.percentile_rank >= 75;
                        const isBelow =
                          fc.target_amount !== null &&
                          fc.percentile_rank <= 25 &&
                          fc.percentile_rank >= 0;
                        return (
                          <tr
                            key={fc.canonical_name}
                            className={`border-b last:border-0 ${
                              isAbove
                                ? "bg-red-50"
                                : isBelow
                                  ? "bg-green-50"
                                  : ""
                            }`}
                          >
                            <td className="px-6 py-3 font-medium">
                              <Link
                                href={`/admin/fees/catalog/${fc.canonical_name}`}
                                className="text-blue-600 hover:underline"
                              >
                                {fc.display_name}
                              </Link>
                            </td>
                            <td className="px-6 py-3 text-right font-mono font-semibold text-gray-900">
                              {formatAmount(fc.target_amount)}
                            </td>
                            <td className="px-6 py-3 text-right font-mono text-gray-500">
                              {formatAmount(fc.peer_min)}
                            </td>
                            <td className="px-6 py-3 text-right font-mono text-gray-500">
                              {formatAmount(fc.peer_p25)}
                            </td>
                            <td className="px-6 py-3 text-right font-mono font-medium text-gray-700">
                              {formatAmount(fc.peer_median)}
                            </td>
                            <td className="px-6 py-3 text-right font-mono text-gray-500">
                              {formatAmount(fc.peer_p75)}
                            </td>
                            <td className="px-6 py-3 text-right font-mono text-gray-500">
                              {formatAmount(fc.peer_max)}
                            </td>
                            <td className="px-6 py-3 text-center">
                              {fc.percentile_rank >= 0 ? (
                                <span
                                  className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                                    fc.percentile_rank >= 75
                                      ? "bg-red-100 text-red-700"
                                      : fc.percentile_rank <= 25
                                        ? "bg-green-100 text-green-700"
                                        : "bg-gray-100 text-gray-600"
                                  }`}
                                >
                                  P{fc.percentile_rank}
                                </span>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                            <td className="px-6 py-3 text-center text-gray-500">
                              {fc.peer_count}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

          {/* Matched peers */}
          {analysis.peers && analysis.peers.length > 0 && (
            <div className="bg-white rounded-lg border">
              <div className="px-6 py-3 border-b bg-gray-50">
                <h2 className="font-semibold text-gray-900">
                  Matched Peers ({analysis.peers.length})
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50 text-left text-gray-500">
                      <th className="px-6 py-3 font-medium">Institution</th>
                      <th className="px-6 py-3 font-medium">State</th>
                      <th className="px-6 py-3 font-medium text-right">
                        Assets
                      </th>
                      <th className="px-6 py-3 font-medium">Tier</th>
                      <th className="px-6 py-3 font-medium text-center">
                        District
                      </th>
                      <th className="px-6 py-3 font-medium text-center">
                        Match Score
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.peers.map((peer) => (
                      <tr
                        key={peer.id}
                        className="border-b last:border-0 hover:bg-gray-50"
                      >
                        <td className="px-6 py-3">
                          <Link
                            href={`/admin/peers/${peer.id}`}
                            className="text-blue-600 hover:underline font-medium"
                          >
                            {peer.name}
                          </Link>
                        </td>
                        <td className="px-6 py-3 text-gray-500">
                          {peer.state || "-"}
                        </td>
                        <td className="px-6 py-3 text-right text-gray-600">
                          {formatAssets(peer.asset_size)}
                        </td>
                        <td className="px-6 py-3 text-xs text-gray-500">
                          {peer.tier
                            ? TIER_LABELS[peer.tier] || peer.tier
                            : "-"}
                        </td>
                        <td className="px-6 py-3 text-center text-gray-500">
                          {peer.district || "-"}
                        </td>
                        <td className="px-6 py-3 text-center">
                          <span
                            className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                              peer.score >= 5
                                ? "bg-green-100 text-green-700"
                                : peer.score >= 3
                                  ? "bg-yellow-100 text-yellow-700"
                                  : "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {peer.score}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
