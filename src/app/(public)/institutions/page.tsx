import type { Metadata } from "next";
import Link from "next/link";
import { searchInstitutions } from "@/lib/crawler-db/search";
import { getPublicStats } from "@/lib/crawler-db/core";
import { InstitutionSearchBar } from "./search-bar";
import { TIER_LABELS } from "@/lib/fed-districts";
import { STATE_NAMES } from "@/lib/us-states";

export const metadata: Metadata = {
  title: "Find Your Bank - Search 9,000+ Institutions",
  description:
    "Search banks and credit unions to compare fees against national benchmarks. Free institution lookup for all US financial institutions.",
};

interface PageProps {
  searchParams: Promise<{
    q?: string;
    state?: string;
    charter?: string;
    page?: string;
  }>;
}

export default async function InstitutionsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const query = params.q || "";
  const stateCode = params.state || "";
  const charterType = params.charter || "";
  const page = parseInt(params.page || "1", 10);

  const hasSearch = query.length >= 2 || stateCode || charterType;
  const stats = getPublicStats();

  const results = hasSearch
    ? searchInstitutions({
        query: query || undefined,
        state_code: stateCode || undefined,
        charter_type: charterType || undefined,
        page,
        pageSize: 25,
      })
    : null;

  const totalPages = results ? Math.ceil(results.total / 25) : 0;

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      {/* Hero */}
      <div className="text-center mb-8">
        <h1
          className="text-3xl font-normal tracking-tight text-[#1A1815] mb-3"
          style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
        >
          Find your bank or credit union
        </h1>
        <p className="text-[#7A7062] text-base max-w-lg mx-auto">
          Search {stats.total_institutions.toLocaleString()}+ institutions to
          see their fees compared to national benchmarks.
        </p>
      </div>

      {/* Search bar */}
      <div className="flex justify-center mb-6">
        <InstitutionSearchBar autoFocus />
      </div>

      {/* Filters */}
      <form className="flex flex-wrap gap-3 justify-center mb-8">
        <input type="hidden" name="q" value={query} />
        <select
          name="state"
          defaultValue={stateCode}
          onChange={(e) => {
            const form = e.target.form;
            if (form) form.submit();
          }}
          className="rounded-lg border border-[#E8DFD1] bg-[#FFFDF9] px-3 py-2 text-sm text-[#1A1815]"
        >
          <option value="">All States</option>
          {Object.entries(STATE_NAMES).map(([code, name]) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </select>
        <select
          name="charter"
          defaultValue={charterType}
          onChange={(e) => {
            const form = e.target.form;
            if (form) form.submit();
          }}
          className="rounded-lg border border-[#E8DFD1] bg-[#FFFDF9] px-3 py-2 text-sm text-[#1A1815]"
        >
          <option value="">Banks & Credit Unions</option>
          <option value="bank">Banks Only</option>
          <option value="credit_union">Credit Unions Only</option>
        </select>
        <noscript>
          <button type="submit" className="rounded-lg bg-[#C44B2E] px-4 py-2 text-sm text-white">
            Search
          </button>
        </noscript>
      </form>

      {/* Results */}
      {results && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-[#7A7062]">
              {results.total.toLocaleString()} institution{results.total !== 1 ? "s" : ""} found
              {query && <span> for "<strong className="text-[#1A1815]">{query}</strong>"</span>}
            </p>
          </div>

          <div className="bg-[#FFFDF9] rounded-xl border border-[#E8DFD1] overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#E8DFD1] bg-[#FAF7F2]">
                  <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#A69D90]">
                    Institution
                  </th>
                  <th className="hidden sm:table-cell px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#A69D90]">
                    Location
                  </th>
                  <th className="hidden md:table-cell px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#A69D90]">
                    Type
                  </th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[#A69D90]">
                    Fees
                  </th>
                </tr>
              </thead>
              <tbody>
                {results.rows.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-[#E8DFD1] last:border-0 hover:bg-[#FAF7F2] transition-colors"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/institution/${r.id}`}
                        className="text-[#1A1815] font-medium hover:text-[#C44B2E] transition-colors"
                      >
                        {r.institution_name}
                      </Link>
                    </td>
                    <td className="hidden sm:table-cell px-4 py-3 text-[#7A7062]">
                      {[r.city, r.state_code].filter(Boolean).join(", ")}
                    </td>
                    <td className="hidden md:table-cell px-4 py-3 text-[#7A7062]">
                      {r.charter_type === "bank" ? "Bank" : "Credit Union"}
                      {r.asset_size_tier && (
                        <span className="ml-1 text-[#A69D90] text-xs">
                          ({TIER_LABELS[r.asset_size_tier] || r.asset_size_tier})
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {r.fee_count > 0 ? (
                        <span className="text-[#C44B2E] font-medium">{r.fee_count}</span>
                      ) : (
                        <span className="text-[#D5CBBF]">--</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-6">
              {page > 1 && (
                <Link
                  href={`/institutions?q=${query}&state=${stateCode}&charter=${charterType}&page=${page - 1}`}
                  className="rounded-md border border-[#D5CBBF] px-3 py-1.5 text-xs font-medium text-[#1A1815] hover:border-[#1A1815] transition-colors"
                >
                  Previous
                </Link>
              )}
              <span className="text-xs text-[#7A7062]">
                Page {page} of {totalPages}
              </span>
              {page < totalPages && (
                <Link
                  href={`/institutions?q=${query}&state=${stateCode}&charter=${charterType}&page=${page + 1}`}
                  className="rounded-md border border-[#D5CBBF] px-3 py-1.5 text-xs font-medium text-[#1A1815] hover:border-[#1A1815] transition-colors"
                >
                  Next
                </Link>
              )}
            </div>
          )}
        </div>
      )}

      {/* Empty state -- no search yet */}
      {!results && (
        <div className="text-center py-8">
          <p className="text-sm text-[#A69D90]">
            Start typing to search, or use the filters above to browse.
          </p>
        </div>
      )}
    </div>
  );
}
