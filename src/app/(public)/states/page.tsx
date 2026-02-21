import Link from "next/link";
import type { Metadata } from "next";
import { getStatesWithData } from "@/lib/crawler-db";
import { STATE_NAMES, STATE_TO_DISTRICT, DISTRICT_NAMES } from "@/lib/fed-districts";
import { US_STATES } from "@/lib/us-map-paths";
import { BreadcrumbJsonLd } from "@/components/breadcrumb-jsonld";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Bank Fees by State: 50-State Comparison | Bank Fee Index",
  description:
    "Compare banking fees across all 50 states. See how overdraft, maintenance, ATM, and other fees vary by state with median comparisons.",
  alternates: { canonical: "/states" },
};

export default function StatesIndexPage() {
  const states = getStatesWithData();
  const stateSet = new Set(states.map((s) => s.state_code));

  const byDistrict = new Map<number, typeof states>();
  for (const s of states) {
    const d = STATE_TO_DISTRICT[s.state_code];
    if (!d) continue;
    if (!byDistrict.has(d)) byDistrict.set(d, []);
    byDistrict.get(d)!.push(s);
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <BreadcrumbJsonLd
        items={[
          { name: "Home", href: "/" },
          { name: "States", href: "/states" },
        ]}
      />

      <h1 className="text-3xl font-bold tracking-tight text-slate-900">
        Banking Fees by State
      </h1>
      <p className="mt-2 text-[15px] text-slate-500">
        Compare bank and credit union fee benchmarks across {states.length}{" "}
        states. Click a state to see detailed fee breakdowns and local
        institution comparisons.
      </p>

      {/* Interactive SVG Map */}
      <div className="mt-8 mb-10">
        <svg
          viewBox="0 0 960 600"
          className="w-full max-w-3xl mx-auto"
          role="img"
          aria-label="Map of US states with fee data coverage"
        >
          {US_STATES.map((s) => {
            const hasData = stateSet.has(s.id);
            return hasData ? (
              <Link key={s.id} href={`/states/${s.id.toLowerCase()}`}>
                <path
                  d={s.d}
                  fill="#334155"
                  stroke="#fff"
                  strokeWidth="1"
                  className="hover:fill-blue-600 transition-colors cursor-pointer"
                >
                  <title>
                    {s.name} - {states.find((st) => st.state_code === s.id)?.institution_count ?? 0}{" "}
                    institutions
                  </title>
                </path>
              </Link>
            ) : (
              <path
                key={s.id}
                d={s.d}
                fill="#e2e8f0"
                stroke="#fff"
                strokeWidth="1"
              >
                <title>{s.name} - No data yet</title>
              </path>
            );
          })}
        </svg>
      </div>

      {/* State grid */}
      <section>
        <h2 className="mb-4 text-lg font-bold tracking-tight text-slate-900">
          All States
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {states.map((s) => {
            const name = STATE_NAMES[s.state_code] ?? s.state_code;
            const district = STATE_TO_DISTRICT[s.state_code];
            return (
              <Link
                key={s.state_code}
                href={`/states/${s.state_code.toLowerCase()}`}
                className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 hover:border-blue-300 hover:bg-blue-50/30 transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900">
                    {name}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    {s.institution_count} institution
                    {s.institution_count !== 1 ? "s" : ""}
                    {district
                      ? ` \u00b7 District ${district}`
                      : ""}
                  </p>
                </div>
                <div className="ml-3 flex-shrink-0 text-right">
                  <p className="text-sm font-semibold tabular-nums text-slate-700">
                    {s.category_count}
                  </p>
                  <p className="text-[10px] text-slate-400">fees</p>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* By district grouping */}
      {byDistrict.size > 0 && (
        <section className="mt-12">
          <h2 className="mb-4 text-lg font-bold tracking-tight text-slate-900">
            By Fed District
          </h2>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from(byDistrict.entries())
              .sort(([a], [b]) => a - b)
              .map(([d, dStates]) => (
                <div
                  key={d}
                  className="rounded-lg border border-slate-200 bg-white p-4"
                >
                  <Link
                    href={`/districts/${d}`}
                    className="text-sm font-bold text-slate-800 hover:text-blue-600 transition-colors"
                  >
                    District {d} - {DISTRICT_NAMES[d]}
                  </Link>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {dStates
                      .sort((a, b) =>
                        (STATE_NAMES[a.state_code] ?? "").localeCompare(
                          STATE_NAMES[b.state_code] ?? ""
                        )
                      )
                      .map((s) => (
                        <Link
                          key={s.state_code}
                          href={`/states/${s.state_code.toLowerCase()}`}
                          className="rounded bg-slate-50 px-2 py-1 text-[12px] text-slate-600 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                        >
                          {s.state_code}
                        </Link>
                      ))}
                  </div>
                </div>
              ))}
          </div>
        </section>
      )}

      {/* Cross-links */}
      <div className="mt-10 flex flex-wrap gap-3">
        <Link
          href="/fees"
          className="rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:border-blue-300 hover:text-blue-600 transition-colors"
        >
          National Fee Index
        </Link>
        <Link
          href="/districts"
          className="rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:border-blue-300 hover:text-blue-600 transition-colors"
        >
          Fed Districts
        </Link>
        <Link
          href="/institutions"
          className="rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:border-blue-300 hover:text-blue-600 transition-colors"
        >
          Find Your Bank
        </Link>
      </div>
    </div>
  );
}
