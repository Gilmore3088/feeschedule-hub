import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { getInstitutionsByFilter } from "@/lib/crawler-db";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { formatAssets } from "@/lib/format";
import { parsePeerFilters, buildFilterDescription, TIER_LABELS } from "@/lib/fed-districts";

export default async function ExplorePeersPage({
  searchParams,
}: {
  searchParams: Promise<{
    type?: string;
    tier?: string;
    district?: string;
  }>;
}) {
  await requireAuth("view");
  const params = await searchParams;

  const peerFilters = parsePeerFilters({
    charter: params.type,
    tier: params.tier,
    district: params.district,
  });

  const institutions = getInstitutionsByFilter({
    charter_type: peerFilters.charter,
    asset_tiers: peerFilters.tiers,
    fed_districts: peerFilters.districts,
  });

  const filterDescription = buildFilterDescription(peerFilters);

  const backParams = new URLSearchParams();
  if (params.tier) backParams.set("tier", params.tier);
  if (params.district) backParams.set("district", params.district);
  if (params.type) backParams.set("type", params.type);
  const backQs = backParams.toString();
  const backHref = backQs ? `/admin/peers?${backQs}` : "/admin/peers";

  return (
    <>
      <div className="mb-6">
        <Breadcrumbs
          items={[
            { label: "Dashboard", href: "/admin" },
            { label: "Peer Index", href: "/admin/peers" },
            { label: "Explore" },
          ]}
        />
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-gray-900">
              Explore Peers
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {filterDescription} &mdash; {institutions.length} institutions
            </p>
          </div>
          <Link
            href={backHref}
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            Back to segmentation
          </Link>
        </div>
      </div>

      <div className="bg-white rounded-lg border">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50/80 text-left">
                <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Institution</th>
                <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">State</th>
                <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Type</th>
                <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-right">Assets</th>
                <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Tier</th>
                <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-center">District</th>
                <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-right">Fees</th>
              </tr>
            </thead>
            <tbody>
              {institutions.map((inst) => (
                <tr
                  key={inst.id}
                  className="border-b last:border-0 hover:bg-gray-50/50 transition-colors"
                >
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/admin/peers/${inst.id}`}
                      className="text-gray-900 hover:text-blue-600 transition-colors font-medium"
                    >
                      {inst.institution_name}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-gray-500">
                    {inst.state_code || "-"}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        inst.charter_type === "bank"
                          ? "bg-blue-50 text-blue-600"
                          : "bg-emerald-50 text-emerald-600"
                      }`}
                    >
                      {inst.charter_type === "bank" ? "Bank" : "CU"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">
                    {formatAssets(inst.asset_size)}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-500">
                    {inst.asset_size_tier
                      ? TIER_LABELS[inst.asset_size_tier] || inst.asset_size_tier
                      : "-"}
                  </td>
                  <td className="px-4 py-2.5 text-center text-gray-500 tabular-nums">
                    {inst.fed_district || "-"}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {inst.fee_count > 0 ? (
                      <span className="font-semibold tabular-nums text-gray-900">
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

        {institutions.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            No institutions match the current filters
          </div>
        )}
      </div>
    </>
  );
}
