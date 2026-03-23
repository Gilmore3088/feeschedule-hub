import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { canAccessPremium } from "@/lib/access";
import { searchInstitutions } from "@/lib/crawler-db/search";
import { getPublicStats, getDataFreshness } from "@/lib/crawler-db";
import { getStatesWithFeeData } from "@/lib/crawler-db";
import { TIER_LABELS, DISTRICT_NAMES } from "@/lib/fed-districts";
import { STATE_NAMES } from "@/lib/us-states";
import { formatAssets } from "@/lib/format";
import { TAXONOMY_COUNT } from "@/lib/fee-taxonomy";

export const metadata: Metadata = {
  title: "Data Explorer | Bank Fee Index",
};

interface PageProps {
  searchParams: Promise<{
    q?: string;
    state?: string;
    charter?: string;
    tier?: string;
    page?: string;
  }>;
}

export default async function ProDataPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?from=/pro/data");
  if (!canAccessPremium(user)) redirect("/subscribe");

  const params = await searchParams;
  const query = params.q || "";
  const stateCode = params.state || "";
  const charterType = params.charter || "";
  const page = parseInt(params.page || "1", 10);
  const pageSize = 50;

  const stats = await getPublicStats();
  const freshness = await getDataFreshness();
  const statesData = await getStatesWithFeeData();

  const results = await searchInstitutions({
    query: query || undefined,
    state_code: stateCode || undefined,
    charter_type: charterType || undefined,
    page,
    pageSize,
  });

  const totalPages = Math.ceil(results.total / pageSize);
  const lastUpdated = freshness.last_crawl_at
    ? new Date(freshness.last_crawl_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "---";

  function buildUrl(overrides: Record<string, string>) {
    const p = new URLSearchParams();
    if (overrides.q ?? query) p.set("q", overrides.q ?? query);
    if (overrides.state ?? stateCode) p.set("state", overrides.state ?? stateCode);
    if (overrides.charter ?? charterType) p.set("charter", overrides.charter ?? charterType);
    if (overrides.page) p.set("page", overrides.page);
    return `/pro/data?${p.toString()}`;
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-14">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <span className="h-px w-8 bg-[#C44B2E]/40" />
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#C44B2E]/60">
          Data Explorer
        </span>
      </div>

      <h1
        className="text-[1.75rem] sm:text-[2.25rem] leading-[1.12] tracking-[-0.02em] text-[#1A1815]"
        style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
      >
        Institution Database
      </h1>
      <p className="mt-2 text-[14px] text-[#7A7062]">
        Browse the complete Bank Fee Index dataset. {stats.total_institutions.toLocaleString()} institutions
        with {stats.total_observations.toLocaleString()} fee observations across {TAXONOMY_COUNT} categories.
        <span className="ml-2 text-[#A09788]">Updated {lastUpdated}</span>
      </p>

      {/* Stat cards */}
      <div className="mt-6 grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: "Institutions", value: stats.total_institutions.toLocaleString() },
          { label: "Observations", value: stats.total_observations.toLocaleString() },
          { label: "States", value: String(statesData.length) },
          { label: "Fee Categories", value: String(stats.total_categories) },
          { label: "Showing", value: `${results.total.toLocaleString()} results` },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-xl border border-[#E8DFD1]/80 bg-white/70 backdrop-blur-sm px-4 py-3"
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#A09788]">
              {card.label}
            </p>
            <p
              className="mt-1 text-[18px] font-light tabular-nums text-[#1A1815]"
              style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
            >
              {card.value}
            </p>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <form className="mt-6 flex flex-wrap items-center gap-3" action="/pro/data" method="get">
        <div className="relative flex-1 min-w-[200px]">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#A09788]"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="text"
            name="q"
            defaultValue={query}
            placeholder="Search by name..."
            className="w-full rounded-xl border border-[#E8DFD1] bg-white pl-10 pr-4 py-2.5 text-[13px] text-[#1A1815] placeholder:text-[#A09788] focus:outline-none focus:ring-2 focus:ring-[#C44B2E]/30 focus:border-transparent"
          />
        </div>

        <select
          name="state"
          defaultValue={stateCode}
          className="rounded-xl border border-[#E8DFD1] bg-white px-3 py-2.5 text-[13px] text-[#1A1815] focus:outline-none focus:ring-2 focus:ring-[#C44B2E]/30"
        >
          <option value="">All States</option>
          {Object.entries(STATE_NAMES)
            .sort(([, a], [, b]) => a.localeCompare(b))
            .map(([code, name]) => (
              <option key={code} value={code}>{name}</option>
            ))}
        </select>

        <select
          name="charter"
          defaultValue={charterType}
          className="rounded-xl border border-[#E8DFD1] bg-white px-3 py-2.5 text-[13px] text-[#1A1815] focus:outline-none focus:ring-2 focus:ring-[#C44B2E]/30"
        >
          <option value="">All Charters</option>
          <option value="bank">Banks</option>
          <option value="credit_union">Credit Unions</option>
        </select>

        <button
          type="submit"
          className="rounded-xl bg-[#C44B2E] px-5 py-2.5 text-[13px] font-semibold text-white hover:bg-[#A83D25] transition-colors"
        >
          Filter
        </button>

        {(query || stateCode || charterType) && (
          <Link
            href="/pro/data"
            className="text-[12px] text-[#A09788] hover:text-[#C44B2E] transition-colors"
          >
            Clear
          </Link>
        )}
      </form>

      {/* Results table */}
      <div className="mt-6 rounded-xl border border-[#E8DFD1]/80 bg-white/70 backdrop-blur-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[#E8DFD1]/60 bg-[#FAF7F2]/60">
                <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[#A09788]">
                  Institution
                </th>
                <th className="hidden sm:table-cell px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[#A09788]">
                  State
                </th>
                <th className="hidden md:table-cell px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[#A09788]">
                  Charter
                </th>
                <th className="hidden lg:table-cell px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[#A09788]">
                  Asset Tier
                </th>
                <th className="px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-[0.1em] text-[#A09788]">
                  Published Fees
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8DFD1]/40">
              {results.rows.map((r) => (
                <tr key={r.id} className="hover:bg-[#FAF7F2]/60 transition-colors">
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/institution/${r.id}`}
                      className="font-medium text-[#1A1815] hover:text-[#C44B2E] transition-colors"
                    >
                      {r.institution_name}
                    </Link>
                    <span className="sm:hidden ml-2 text-[11px] text-[#A09788]">
                      {r.state_code}
                    </span>
                  </td>
                  <td className="hidden sm:table-cell px-4 py-2.5 text-[#7A7062]">
                    {r.state_code ? (
                      <Link
                        href={`/research/state/${r.state_code}`}
                        className="hover:text-[#C44B2E] transition-colors"
                      >
                        {STATE_NAMES[r.state_code] ?? r.state_code}
                      </Link>
                    ) : (
                      <span className="text-[#D4C9BA]">--</span>
                    )}
                  </td>
                  <td className="hidden md:table-cell px-4 py-2.5 text-[#7A7062]">
                    {r.charter_type === "bank" ? "Bank" : "Credit Union"}
                  </td>
                  <td className="hidden lg:table-cell px-4 py-2.5 text-[#7A7062]">
                    {r.asset_size_tier ? (
                      <span className="text-[11px]">
                        {TIER_LABELS[r.asset_size_tier] ?? r.asset_size_tier}
                      </span>
                    ) : (
                      <span className="text-[#D4C9BA]">--</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {r.fee_count > 0 ? (
                      <span className="font-medium text-[#1A1815]">{r.fee_count}</span>
                    ) : (
                      <span className="text-[#D4C9BA]">--</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-6">
          {page > 1 && (
            <Link
              href={buildUrl({ page: String(page - 1) })}
              className="rounded-full border border-[#E8DFD1] px-4 py-1.5 text-[12px] font-medium text-[#5A5347] hover:border-[#C44B2E]/30 hover:text-[#C44B2E] transition-colors no-underline"
            >
              Previous
            </Link>
          )}
          <span className="text-[12px] text-[#A09788] tabular-nums">
            Page {page} of {totalPages}
          </span>
          {page < totalPages && (
            <Link
              href={buildUrl({ page: String(page + 1) })}
              className="rounded-full border border-[#E8DFD1] px-4 py-1.5 text-[12px] font-medium text-[#5A5347] hover:border-[#C44B2E]/30 hover:text-[#C44B2E] transition-colors no-underline"
            >
              Next
            </Link>
          )}
        </div>
      )}

      {/* Quick nav */}
      <div className="mt-14">
        <div className="flex items-center gap-3 mb-5">
          <h2
            className="text-[16px] font-medium text-[#1A1815]"
            style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
          >
            Explore the Dataset
          </h2>
          <span className="h-px flex-1 bg-[#E8DFD1]" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Fee Index", desc: `All ${TAXONOMY_COUNT} categories`, href: "/fees" },
            { label: "National Benchmarks", desc: "Medians & percentiles", href: "/research/national-fee-index" },
            { label: "AI Research", desc: "Analyst hub", href: "/pro/research" },
            { label: "State Reports", desc: `${statesData.length} states`, href: "/research" },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="group rounded-xl border border-[#E8DFD1]/80 bg-white/70 px-5 py-4 transition-all duration-300 hover:border-[#C44B2E]/20 hover:shadow-md hover:shadow-[#C44B2E]/5 no-underline"
            >
              <span className="text-[13px] font-medium text-[#1A1815] group-hover:text-[#C44B2E] transition-colors">
                {item.label}
              </span>
              <span className="block mt-0.5 text-[11px] text-[#A09788]">{item.desc}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
