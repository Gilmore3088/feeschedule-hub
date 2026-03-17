import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCitiesInState } from "@/lib/crawler-db";
import { STATE_NAMES, STATE_CODES } from "@/lib/us-states";
import { BreadcrumbJsonLd } from "@/components/breadcrumb-jsonld";
import { SITE_URL } from "@/lib/constants";

interface PageProps {
  params: Promise<{ state: string }>;
}

export async function generateStaticParams() {
  const { hasData } = await import("@/lib/crawler-db/connection");
  if (!hasData()) return [];
  return STATE_CODES.map((code) => ({ state: code.toLowerCase() }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { state } = await params;
  const stateName = STATE_NAMES[state.toUpperCase()];
  if (!stateName) return { title: "Not Found" };

  return {
    title: `Bank Fees by City in ${stateName} - Local Fee Comparison`,
    description: `Compare bank fees by city in ${stateName}. Find the cheapest banks and credit unions in your area. Overdraft fees, monthly charges, and more.`,
    keywords: [
      `${stateName} bank fees by city`,
      `${stateName} cheapest banks`,
      `${stateName} bank fee comparison`,
      `${stateName} credit union fees`,
    ],
  };
}

export default async function StateCityDirectory({ params }: PageProps) {
  const { state } = await params;
  const stateCode = state.toUpperCase();
  const stateName = STATE_NAMES[stateCode];

  if (!stateName) notFound();

  const cities = getCitiesInState(stateCode);

  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: "Home", href: SITE_URL },
          { name: "Fees", href: `${SITE_URL}/fees` },
          { name: stateName, href: `${SITE_URL}/fees/city/${stateCode.toLowerCase()}` },
        ]}
      />

      <div className="max-w-4xl mx-auto">
        <nav className="text-sm text-gray-500 mb-4 flex items-center gap-1.5">
          <Link href="/fees" className="hover:text-gray-700 transition-colors">Fees</Link>
          <span>/</span>
          <span className="text-gray-900">{stateName}</span>
        </nav>

        <h1 className="text-2xl font-bold tracking-tight text-gray-900 mb-1">
          Bank Fees by City in {stateName}
        </h1>
        <p className="text-gray-500 mb-6">
          {cities.length} cities with fee data from {cities.reduce((s, c) => s + c.with_fees, 0)} institutions
        </p>

        {cities.length === 0 ? (
          <p className="text-gray-500 py-12 text-center">
            No fee data available for {stateName} yet. Check back soon.
          </p>
        ) : (
          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">City</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Institutions</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">With Fee Data</th>
                </tr>
              </thead>
              <tbody>
                {cities.map((c) => (
                  <tr key={`${c.city}-${c.state_code}`} className="border-b last:border-0 hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/fees/city/${stateCode.toLowerCase()}/${encodeURIComponent(c.city.toLowerCase())}`}
                        className="font-medium text-gray-900 hover:text-blue-600 transition-colors"
                      >
                        {c.city}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">
                      {c.institution_count}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-900 font-medium">
                      {c.with_fees}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-6 flex gap-4 text-sm">
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
