export const dynamic = "force-dynamic";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Filter } from "lucide-react";
import {
  getInstitutionStateDirectorySummaries,
  searchInstitutions,
} from "@/lib/data-store/search";
import { getPublicStats } from "@/lib/data-store/core";
import { InstitutionSearchBar } from "./search-bar";
import { StateDirectoryMap } from "./state-directory-map";
import { FDIC_TIER_LABELS } from "@/lib/fed-districts";
import { STATE_NAMES } from "@/lib/us-states";
import type { FeePublicationStatus } from "@/lib/institution-quality";

export const metadata: Metadata = {
  title: "Find Your Bank - Search 8,000+ Institutions",
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

function publicationStatusClass(status: FeePublicationStatus): string {
  switch (status) {
    case "verified":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "provisional":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "under_review":
      return "border-[#E8DFD1] bg-[#FAF7F2] text-[#7A7062]";
    case "unavailable":
      return "border-[#E8DFD1] bg-white text-[#A69D90]";
  }
}

export default async function InstitutionsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const query = params.q || "";
  const stateCode = (params.state || "").toUpperCase();
  const charterType = params.charter || "";
  const page = parseInt(params.page || "1", 10);

  const hasQuery = query.trim().length >= 2;
  const hasState = Boolean(stateCode);
  const shouldShowResults = hasQuery || hasState;
  const [stats, stateSummaries, results] = await Promise.all([
    getPublicStats(),
    getInstitutionStateDirectorySummaries({
      charter_type: charterType || undefined,
    }),
    shouldShowResults
      ? searchInstitutions({
          query: hasQuery ? query : undefined,
          state_code: stateCode || undefined,
          charter_type: charterType || undefined,
          page,
          pageSize: 25,
        })
      : Promise.resolve({ rows: [], total: 0 }),
  ]);

  const totalPages = Math.ceil(results.total / 25);
  const mappedInstitutionCount = stateSummaries.reduce(
    (sum, summary) => sum + summary.institution_count,
    0,
  );
  const selectedStateName = stateCode ? STATE_NAMES[stateCode] ?? stateCode : "";

  return (
    <main className="min-h-screen bg-[#FAF7F2] text-[#1A1815]">
      <div className="mx-auto max-w-6xl px-4 py-7 sm:px-6 sm:py-9">
        <section className="fi-reveal border-b border-[#D8CBB8] pb-6">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-end">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#A69D90]">
                Institution Directory
              </p>
              <h1
                className="mt-2 max-w-3xl text-4xl font-normal leading-[1.02] tracking-tight text-[#1A1815] sm:text-5xl"
                style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
              >
                Browse institutions by state.
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[#5A5347]">
                Start with the map, then open a state list to check whether fee evidence is
                verified, provisional, under review, or still missing.
              </p>
              <div className="mt-5 max-w-2xl">
                <InstitutionSearchBar autoFocus placeholder="Search institution name, city, or state..." />
              </div>
            </div>

            <div className="grid grid-cols-3 divide-x divide-[#E8DFD1] border-y border-[#E8DFD1] bg-[#FFFDF9]">
              <DirectoryStat label="Tracked" value={stats.total_institutions.toLocaleString()} />
              <DirectoryStat label="Approved rows" value={stats.total_observations.toLocaleString()} />
              <DirectoryStat
                label={shouldShowResults ? "Matches" : "Mapped"}
                value={(shouldShowResults ? results.total : mappedInstitutionCount).toLocaleString()}
              />
            </div>
          </div>
        </section>

      <StateDirectoryMap
        summaries={stateSummaries}
        selectedStateCode={stateCode}
        query={hasQuery ? query : ""}
        charterType={charterType}
      />

      <form className="fi-reveal fi-reveal-delay-2 flex flex-wrap gap-3 border-b border-[#E8DFD1] py-4" action="/institutions" method="get">
        <input type="hidden" name="q" value={query} />
        <select
          name="state"
          defaultValue={stateCode}
          className="rounded-md border border-[#D5CBBF] bg-[#FFFDF9] px-3 py-2 text-sm text-[#1A1815] outline-none focus:border-[#C44B2E]"
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
          className="rounded-md border border-[#D5CBBF] bg-[#FFFDF9] px-3 py-2 text-sm text-[#1A1815] outline-none focus:border-[#C44B2E]"
        >
          <option value="">Banks & Credit Unions</option>
          <option value="bank">Banks Only</option>
          <option value="credit_union">Credit Unions Only</option>
        </select>
        <button type="submit" className="inline-flex items-center gap-2 rounded-md bg-[#C44B2E] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#A83D25]">
          <Filter className="h-4 w-4" />
          Update directory
        </button>
      </form>

      {!shouldShowResults && (
        <section className="fi-reveal fi-reveal-delay-2 py-6">
          <div className="border-y border-[#E8DFD1] py-4">
            <p className="text-sm font-semibold text-[#1A1815]">
              Select a state to view institution profiles.
            </p>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[#7A7062]">
              Search still jumps directly to matching institutions, but browsing now starts with a
              state so the directory stays focused.
            </p>
          </div>
        </section>
      )}

      {shouldShowResults && results.total > 0 && (
        <section className="fi-reveal fi-reveal-delay-2 pt-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#A69D90]">
                {selectedStateName ? `${selectedStateName} directory` : "Search results"}
              </p>
              <p className="mt-1 text-sm text-[#7A7062]">
                {results.total.toLocaleString()} institution{results.total !== 1 ? "s" : ""} found
                {query && <span> for <strong className="text-[#1A1815]">{query}</strong></span>}
              </p>
            </div>
          </div>

          <div className="grid gap-2 sm:hidden">
            {results.rows.map((r) => (
              <InstitutionMobileCard key={r.id} institution={r} />
            ))}
          </div>

          <div className="hidden overflow-hidden border border-[#E8DFD1] bg-[#FFFDF9] sm:block">
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
                    Fee rows
                  </th>
                  <th className="hidden md:table-cell px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#A69D90]">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {results.rows.map((r) => (
                  <tr
                    key={r.id}
                    className="fi-row-interaction border-b border-[#E8DFD1] last:border-0"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/institution/${r.id}`}
                        className="group flex min-w-0 items-center gap-2 break-words font-medium text-[#1A1815] transition-colors hover:text-[#C44B2E]"
                      >
                        <span className="min-w-0 break-words">{r.institution_name}</span>
                        <ArrowRight className="h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                      </Link>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 md:hidden">
                        <span
                          className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${publicationStatusClass(r.fee_publication_status)}`}
                        >
                          {r.fee_publication_label}
                        </span>
                        {[r.city, r.state_code].filter(Boolean).length > 0 && (
                          <span className="text-[11px] text-[#A69D90]">
                            {[r.city, r.state_code].filter(Boolean).join(", ")}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="hidden sm:table-cell px-4 py-3 text-[#7A7062]">
                      {[r.city, r.state_code].filter(Boolean).join(", ")}
                    </td>
                    <td className="hidden md:table-cell px-4 py-3 text-[#7A7062]">
                      {r.charter_type === "bank" ? "Bank" : "Credit Union"}
                      {r.asset_size_tier && (
                        <span className="ml-1 text-[#A69D90] text-xs">
                          ({FDIC_TIER_LABELS[r.asset_size_tier] || r.asset_size_tier})
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {r.published_fee_count > 0 ? (
                        <div>
                          <span className="text-[#C44B2E] font-medium">{r.published_fee_count}</span>
                          {r.provisional_fee_count > 0 && (
                            <span className="ml-1 text-xs text-[#A69D90]">+{r.provisional_fee_count}</span>
                          )}
                        </div>
                      ) : r.provisional_fee_count > 0 ? (
                        <span className="text-[#9A5A00] font-medium">{r.provisional_fee_count}</span>
                      ) : (
                        <span className="text-[#D5CBBF]">--</span>
                      )}
                      <div className="text-[10px] text-[#A69D90]">
                        {r.published_fee_count > 0 ? "verified" : r.provisional_fee_count > 0 ? "provisional" : "none"}
                      </div>
                    </td>
                    <td className="hidden md:table-cell px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-md border px-2 py-1 text-[11px] font-medium ${publicationStatusClass(r.fee_publication_status)}`}
                      >
                        {r.fee_publication_label}
                      </span>
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
                  className="inline-flex items-center gap-1.5 rounded-md border border-[#D5CBBF] px-3 py-1.5 text-xs font-medium text-[#1A1815] transition-colors hover:border-[#1A1815]"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Previous
                </Link>
              )}
              <span className="text-xs text-[#7A7062]">
                Page {page} of {totalPages}
              </span>
              {page < totalPages && (
                <Link
                  href={`/institutions?q=${query}&state=${stateCode}&charter=${charterType}&page=${page + 1}`}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[#D5CBBF] px-3 py-1.5 text-xs font-medium text-[#1A1815] transition-colors hover:border-[#1A1815]"
                >
                  Next
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              )}
            </div>
          )}
        </section>
      )}

      {shouldShowResults && results.total === 0 && (
        <div className="fi-reveal fi-reveal-delay-2 py-8 text-center">
          <p className="text-sm text-[#A69D90]">
            No institutions found. Try adjusting your search or filters.
          </p>
        </div>
      )}
      </div>
    </main>
  );
}

function DirectoryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 px-3 py-3">
      <p className="truncate text-[9px] font-bold uppercase tracking-[0.14em] text-[#A69D90]">
        {label}
      </p>
      <p className="mt-1 truncate text-base font-semibold tabular-nums text-[#1A1815]" title={value}>
        {value}
      </p>
    </div>
  );
}

function InstitutionMobileCard({
  institution,
}: {
  institution: Awaited<ReturnType<typeof searchInstitutions>>["rows"][number];
}) {
  return (
    <Link
      href={`/institution/${institution.id}`}
      className="fi-row-interaction block border border-[#E8DFD1] bg-[#FFFDF9] px-3 py-3"
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words text-sm font-semibold leading-snug text-[#1A1815]">
            {institution.institution_name}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-[#A69D90]">
            <span>{institution.charter_type === "bank" ? "Bank" : "Credit Union"}</span>
            {[institution.city, institution.state_code].filter(Boolean).length > 0 && (
              <span>{[institution.city, institution.state_code].filter(Boolean).join(", ")}</span>
            )}
          </div>
          <span
            className={`mt-2 inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${publicationStatusClass(institution.fee_publication_status)}`}
          >
            {institution.fee_publication_label}
          </span>
        </div>
        <div className="shrink-0 text-right tabular-nums">
          {institution.published_fee_count > 0 ? (
            <>
              <p className="text-sm font-semibold text-[#C44B2E]">
                {institution.published_fee_count}
                {institution.provisional_fee_count > 0 && (
                  <span className="ml-1 text-[10px] text-[#A69D90]">
                    +{institution.provisional_fee_count}
                  </span>
                )}
              </p>
              <p className="text-[9px] uppercase tracking-[0.12em] text-[#A69D90]">
                verified
              </p>
            </>
          ) : institution.provisional_fee_count > 0 ? (
            <>
              <p className="text-sm font-semibold text-[#9A5A00]">
                {institution.provisional_fee_count}
              </p>
              <p className="text-[9px] uppercase tracking-[0.12em] text-[#A69D90]">
                provisional
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-[#D5CBBF]">--</p>
              <p className="text-[9px] uppercase tracking-[0.12em] text-[#A69D90]">
                none
              </p>
            </>
          )}
        </div>
      </div>
    </Link>
  );
}
