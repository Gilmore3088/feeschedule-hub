import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getCityInstitutions,
  getCityFeeAverages,
  getNationalIndex,
} from "@/lib/crawler-db";
import { getDisplayName, isFeaturedFee } from "@/lib/fee-taxonomy";
import { formatAmount, formatAssets } from "@/lib/format";
import { STATE_NAMES } from "@/lib/us-states";
import { BreadcrumbJsonLd } from "@/components/breadcrumb-jsonld";
import { SITE_URL } from "@/lib/constants";

interface PageProps {
  params: Promise<{ state: string; city: string }>;
}

function titleCase(s: string): string {
  return decodeURIComponent(s)
    .split(/[-\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { state, city } = await params;
  const stateName = STATE_NAMES[state.toUpperCase()];
  const cityName = titleCase(city);
  if (!stateName) return { title: "Not Found" };

  return {
    title: `Bank Fees in ${cityName}, ${state.toUpperCase()} - Compare Local Fees`,
    description: `Compare bank and credit union fees in ${cityName}, ${stateName}. See overdraft fees, monthly maintenance charges, NSF fees, and more from local institutions.`,
    keywords: [
      `${cityName} bank fees`,
      `${cityName} ${stateName} overdraft fees`,
      `banks in ${cityName}`,
      `credit unions in ${cityName}`,
      `${cityName} checking account fees`,
    ],
  };
}

export default async function CityFeePage({ params }: PageProps) {
  const { state, city } = await params;
  const stateCode = state.toUpperCase();
  const stateName = STATE_NAMES[stateCode];
  const cityName = titleCase(city);

  if (!stateName) notFound();

  const institutions = getCityInstitutions(cityName, stateCode);
  if (institutions.length === 0) notFound();

  const cityAverages = getCityFeeAverages(cityName, stateCode);
  const nationalIndex = getNationalIndex();

  // Build national median lookup
  const nationalMedians: Record<string, number> = {};
  for (const entry of nationalIndex) {
    nationalMedians[entry.fee_category] = entry.median_amount ?? 0;
  }

  // Featured city averages for the summary cards
  const spotlightCategories = ["overdraft", "monthly_maintenance", "nsf", "atm_non_network"];
  const spotlightAverages = spotlightCategories.map((cat) => {
    const cityAvg = cityAverages.find((a) => a.fee_category === cat);
    const natMedian = nationalMedians[cat];
    return {
      category: cat,
      displayName: getDisplayName(cat),
      cityAvg: cityAvg?.median ?? null,
      nationalMedian: natMedian ?? null,
      institutionCount: cityAvg?.institution_count ?? 0,
      delta: cityAvg && natMedian ? ((cityAvg.median - natMedian) / natMedian) * 100 : null,
    };
  });

  const bankCount = institutions.filter((i) => i.charter_type === "bank").length;
  const cuCount = institutions.filter((i) => i.charter_type === "credit_union").length;

  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: "Home", href: SITE_URL },
          { name: "Fees", href: `${SITE_URL}/fees` },
          { name: stateName, href: `${SITE_URL}/fees/city/${stateCode.toLowerCase()}` },
          { name: cityName, href: `${SITE_URL}/fees/city/${stateCode.toLowerCase()}/${encodeURIComponent(cityName.toLowerCase())}` },
        ]}
      />

      <div className="max-w-5xl mx-auto">
        {/* Breadcrumb */}
        <nav className="text-sm text-gray-500 mb-4 flex items-center gap-1.5">
          <Link href="/fees" className="hover:text-gray-700 transition-colors">Fees</Link>
          <span>/</span>
          <Link href={`/fees/city/${stateCode.toLowerCase()}`} className="hover:text-gray-700 transition-colors">{stateName}</Link>
          <span>/</span>
          <span className="text-gray-900">{cityName}</span>
        </nav>

        {/* Header */}
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 mb-1">
          Bank Fees in {cityName}, {stateCode}
        </h1>
        <p className="text-gray-500 mb-6">
          {institutions.length} institution{institutions.length !== 1 ? "s" : ""} with fee data
          ({bankCount} bank{bankCount !== 1 ? "s" : ""}, {cuCount} credit union{cuCount !== 1 ? "s" : ""})
        </p>

        {/* Spotlight fee comparison cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          {spotlightAverages.map((s) => (
            <div key={s.category} className="rounded-lg border border-gray-200 p-4">
              <p className="text-xs font-medium text-gray-500 mb-1">{s.displayName}</p>
              <p className="text-xl font-bold tabular-nums text-gray-900">
                {s.cityAvg !== null ? formatAmount(s.cityAvg) : "N/A"}
              </p>
              {s.delta !== null && (
                <p className={`text-xs tabular-nums mt-0.5 ${s.delta > 0 ? "text-red-500" : "text-emerald-600"}`}>
                  {s.delta > 0 ? "+" : ""}{s.delta.toFixed(1)}% vs national
                </p>
              )}
              <p className="text-[10px] text-gray-400 mt-0.5">
                {s.institutionCount} institution{s.institutionCount !== 1 ? "s" : ""} reporting
              </p>
            </div>
          ))}
        </div>

        {/* Institution table */}
        <div className="rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
            <h2 className="text-sm font-semibold text-gray-700">
              Institutions in {cityName}
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50/50">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Institution</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Assets</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Overdraft</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Monthly Fee</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">NSF</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">ATM</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Fees</th>
                </tr>
              </thead>
              <tbody>
                {institutions.map((inst) => (
                  <tr key={inst.id} className="border-b last:border-0 hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/institution/${inst.id}`}
                        className="font-medium text-gray-900 hover:text-blue-600 transition-colors"
                      >
                        {inst.institution_name}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-gray-500">
                      {inst.charter_type === "bank" ? "Bank" : "CU"}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">
                      {inst.asset_size ? formatAssets(inst.asset_size) : "-"}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-900">
                      {formatAmount(inst.overdraft)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-900">
                      {formatAmount(inst.monthly_maintenance)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-900">
                      {formatAmount(inst.nsf)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-900">
                      {formatAmount(inst.atm_non_network)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">
                      {inst.fee_count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* All city fee averages */}
        {cityAverages.length > 0 && (
          <div className="mt-8 rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
              <h2 className="text-sm font-semibold text-gray-700">
                Average Fees in {cityName} vs National
              </h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50/50">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Fee Category</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">{cityName} Avg</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">National</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Difference</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Reporting</th>
                </tr>
              </thead>
              <tbody>
                {cityAverages.filter((a) => isFeaturedFee(a.fee_category)).map((avg) => {
                  const natMedian = nationalMedians[avg.fee_category];
                  const delta = natMedian ? ((avg.median - natMedian) / natMedian) * 100 : null;
                  return (
                    <tr key={avg.fee_category} className="border-b last:border-0 hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-2.5">
                        <Link
                          href={`/fees/${avg.fee_category}`}
                          className="text-gray-900 hover:text-blue-600 transition-colors font-medium"
                        >
                          {getDisplayName(avg.fee_category)}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-gray-900">
                        {formatAmount(avg.median)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">
                        {natMedian !== undefined ? formatAmount(natMedian) : "-"}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {delta !== null ? (
                          <span className={delta > 0 ? "text-red-500" : "text-emerald-600"}>
                            {delta > 0 ? "+" : ""}{delta.toFixed(1)}%
                          </span>
                        ) : "-"}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">
                        {avg.institution_count}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Links */}
        <div className="mt-6 flex gap-4 text-sm">
          <Link href={`/fees/city/${stateCode.toLowerCase()}`} className="text-blue-600 hover:underline">
            More cities in {stateName}
          </Link>
          <Link href={`/research/state/${stateCode.toLowerCase()}`} className="text-blue-600 hover:underline">
            {stateName} Fee Report
          </Link>
          <Link href="/fees" className="text-blue-600 hover:underline">
            National Fee Index
          </Link>
        </div>
      </div>
    </>
  );
}
