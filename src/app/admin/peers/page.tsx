import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import {
  getInstitutionsByFilter,
  getTierCounts,
  getDistrictCounts,
} from "@/lib/crawler-db";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { formatAssets } from "@/lib/format";
import { TIER_LABELS, DISTRICT_NAMES } from "@/lib/fed-districts";

export default async function PeersPage({
  searchParams,
}: {
  searchParams: Promise<{
    type?: string;
    tier?: string;
    district?: string;
    state?: string;
  }>;
}) {
  await requireAuth("view");

  const params = await searchParams;
  const tierCounts = getTierCounts();
  const districtCounts = getDistrictCounts();

  const filters: {
    charter_type?: string;
    asset_tier?: string;
    fed_district?: number;
    state_code?: string;
  } = {};
  if (params.type) filters.charter_type = params.type;
  if (params.tier) filters.asset_tier = params.tier;
  if (params.district) filters.fed_district = parseInt(params.district, 10);
  if (params.state) filters.state_code = params.state;

  const hasFilters = Object.keys(filters).length > 0;
  const institutions = hasFilters ? getInstitutionsByFilter(filters) : [];

  return (
    <>
      <div className="mb-6">
        <Breadcrumbs items={[
          { label: "Dashboard", href: "/admin" },
          { label: "Peer Groups" },
        ]} />
        <h1 className="text-xl font-semibold text-gray-900">
          Peer Group Browser
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Filter institutions by type, size, and region
        </p>
      </div>

      {/* Tier summary */}
      <div className="bg-white rounded-lg border mb-6">
        <div className="px-6 py-3 border-b bg-gray-50">
          <h2 className="font-semibold text-gray-900">Asset Size Tiers</h2>
        </div>
        <div className="p-4 flex flex-wrap gap-2">
          {tierCounts.map((tc) => (
            <Link
              key={tc.tier}
              href={`/admin/peers?tier=${tc.tier}${params.type ? `&type=${params.type}` : ""}${params.district ? `&district=${params.district}` : ""}`}
              className={`rounded-lg border px-4 py-2 text-sm transition hover:border-blue-300 hover:bg-blue-50 ${
                params.tier === tc.tier
                  ? "border-blue-500 bg-blue-50 font-medium"
                  : "bg-white"
              }`}
            >
              <div className="font-medium text-gray-900">
                {TIER_LABELS[tc.tier] || tc.tier}
              </div>
              <div className="text-xs text-gray-500">
                {tc.count.toLocaleString()} institutions
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* District summary */}
      <div className="bg-white rounded-lg border mb-6">
        <div className="px-6 py-3 border-b bg-gray-50">
          <h2 className="font-semibold text-gray-900">
            Federal Reserve Districts
          </h2>
        </div>
        <div className="p-4 flex flex-wrap gap-2">
          {districtCounts.map((dc) => (
            <Link
              key={dc.district}
              href={`/admin/peers?district=${dc.district}${params.type ? `&type=${params.type}` : ""}${params.tier ? `&tier=${params.tier}` : ""}`}
              className={`rounded-lg border px-3 py-2 text-sm transition hover:border-blue-300 hover:bg-blue-50 ${
                params.district === String(dc.district)
                  ? "border-blue-500 bg-blue-50 font-medium"
                  : "bg-white"
              }`}
            >
              <div className="font-medium text-gray-900">
                {dc.district} - {DISTRICT_NAMES[dc.district] || "?"}
              </div>
              <div className="text-xs text-gray-500">
                {dc.count.toLocaleString()}
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Charter type filter */}
      <div className="flex gap-2 mb-6">
        <Link
          href={`/admin/peers?${params.tier ? `tier=${params.tier}&` : ""}${params.district ? `district=${params.district}` : ""}`}
          className={`rounded-full border px-4 py-1.5 text-sm ${
            !params.type ? "border-blue-500 bg-blue-50 font-medium" : "bg-white"
          }`}
        >
          All Types
        </Link>
        <Link
          href={`/admin/peers?type=bank${params.tier ? `&tier=${params.tier}` : ""}${params.district ? `&district=${params.district}` : ""}`}
          className={`rounded-full border px-4 py-1.5 text-sm ${
            params.type === "bank"
              ? "border-blue-500 bg-blue-50 font-medium"
              : "bg-white"
          }`}
        >
          Banks
        </Link>
        <Link
          href={`/admin/peers?type=credit_union${params.tier ? `&tier=${params.tier}` : ""}${params.district ? `&district=${params.district}` : ""}`}
          className={`rounded-full border px-4 py-1.5 text-sm ${
            params.type === "credit_union"
              ? "border-blue-500 bg-blue-50 font-medium"
              : "bg-white"
          }`}
        >
          Credit Unions
        </Link>
      </div>

      {/* Results table */}
      {hasFilters && (
        <div className="bg-white rounded-lg border">
          <div className="px-6 py-3 border-b bg-gray-50">
            <h2 className="font-semibold text-gray-900">
              {institutions.length} Institutions
            </h2>
            <p className="text-xs text-gray-500">
              {params.tier && TIER_LABELS[params.tier]}
              {params.tier && params.district && " | "}
              {params.district &&
                `District ${params.district} - ${DISTRICT_NAMES[parseInt(params.district)] || "?"}`}
              {(params.tier || params.district) && params.type && " | "}
              {params.type === "bank" && "Banks"}
              {params.type === "credit_union" && "Credit Unions"}
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
                  <th className="px-6 py-3 font-medium">Tier</th>
                  <th className="px-6 py-3 font-medium text-center">
                    District
                  </th>
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
                        href={`/admin/peers/${inst.id}`}
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
                    <td className="px-6 py-3 text-xs text-gray-500">
                      {inst.asset_size_tier
                        ? TIER_LABELS[inst.asset_size_tier] || inst.asset_size_tier
                        : "-"}
                    </td>
                    <td className="px-6 py-3 text-center text-gray-500">
                      {inst.fed_district || "-"}
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
      )}

      {!hasFilters && (
        <div className="text-center py-12 text-gray-500">
          Select a tier, district, or type above to browse institutions
        </div>
      )}
    </>
  );
}
