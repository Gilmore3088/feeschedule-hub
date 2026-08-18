export const dynamic = "force-dynamic";
import type { Metadata } from "next";
import {
  getInstitutionStateDirectorySummaries,
  searchInstitutions,
  type InstitutionSearchResult,
} from "@/lib/data-store/search";
import { getPublicStatsSummary } from "@/lib/public-stats";
import { STATE_NAMES } from "@/lib/us-states";
import { PRODUCT_NAME } from "@/lib/constants";
import { InstitutionSearchBar } from "./search-bar";
import { StateDirectoryMap } from "./state-directory-map";
import { DirectoryFilters } from "./directory-filters";
import {
  DirectoryPagination,
  InstitutionMobileCards,
  InstitutionResultsTable,
} from "./institution-results";
import {
  DIRECTORY_PAGE_SIZE,
  DIRECTORY_SORT_WINDOW,
  paginate,
  sortVerifiedFirst,
} from "./directory-sort";

export const metadata: Metadata = {
  title: `Find Your Bank — Search the ${PRODUCT_NAME}`,
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

interface DirectoryResults {
  rows: InstitutionSearchResult[];
  total: number;
}

/**
 * Verified-first ordering across the whole result set when it fits in one
 * window; otherwise the current page is sorted on its own.
 */
async function loadResults(params: {
  query?: string;
  state_code?: string;
  charter_type?: string;
  page: number;
}): Promise<DirectoryResults> {
  const firstPass = await searchInstitutions({
    ...params,
    page: 1,
    pageSize: DIRECTORY_SORT_WINDOW,
  });
  if (firstPass.total <= DIRECTORY_SORT_WINDOW) {
    return {
      rows: paginate(sortVerifiedFirst(firstPass.rows), params.page, DIRECTORY_PAGE_SIZE),
      total: firstPass.total,
    };
  }
  const paged = await searchInstitutions({ ...params, pageSize: DIRECTORY_PAGE_SIZE });
  return { rows: sortVerifiedFirst(paged.rows), total: paged.total };
}

export default async function InstitutionsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const query = params.q || "";
  const stateCode = (params.state || "").toUpperCase();
  const charterType = params.charter || "";
  const page = Math.max(1, parseInt(params.page || "1", 10) || 1);

  const hasQuery = query.trim().length >= 2;
  const hasState = Boolean(stateCode);
  const shouldShowResults = hasQuery || hasState;
  const [stats, stateSummaries, results] = await Promise.all([
    getPublicStatsSummary(),
    getInstitutionStateDirectorySummaries({ charter_type: charterType || undefined }),
    shouldShowResults
      ? loadResults({
          query: hasQuery ? query : undefined,
          state_code: stateCode || undefined,
          charter_type: charterType || undefined,
          page,
        })
      : Promise.resolve<DirectoryResults>({ rows: [], total: 0 }),
  ]);

  const totalPages = Math.ceil(results.total / DIRECTORY_PAGE_SIZE);
  const selectedStateName = stateCode ? STATE_NAMES[stateCode] ?? stateCode : "";
  const buildPageHref = (nextPage: number) => {
    const search = new URLSearchParams();
    if (query) search.set("q", query);
    if (stateCode) search.set("state", stateCode);
    if (charterType) search.set("charter", charterType);
    search.set("page", String(nextPage));
    return `/institutions?${search.toString()}`;
  };

  return (
    <main className="min-h-screen bg-[#FAF7F2] text-[#1A1815]">
      <div className="mx-auto max-w-6xl px-4 py-7 sm:px-6 sm:py-9">
        <section className="fi-reveal relative z-20 border-b border-[#D8CBB8] pb-6">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-end">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#6B6255]">
                Institution Directory
              </p>
              <h1
                className="mt-2 max-w-3xl text-4xl font-normal leading-[1.02] tracking-tight text-[#1A1815] sm:text-5xl"
                style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
              >
                Find your bank or credit union.
              </h1>
              <p className="mt-3 max-w-2xl text-base leading-relaxed text-[#5A5347]">
                Pick your state, then your bank or credit union, to see its published fees and how
                they compare.
              </p>
              <p className="mt-1 text-sm text-[#6B6255]">
                Verified fee schedules for {stats.institutionsLabel} institutions and growing.
              </p>
              <div className="mt-5 max-w-2xl">
                <InstitutionSearchBar
                  autoFocus
                  ariaLabel="Search institution name, city, or state"
                  placeholder="Search institution name, city, or state..."
                  initialQuery={query}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 divide-x divide-[#E0D7C9] border-y border-[#E0D7C9] bg-[#FDFBF8]">
              <DirectoryStat label="Institutions with verified fees" value={stats.institutionsLabel} />
              <DirectoryStat label="Verified fees" value={stats.observationsLabel} />
              <DirectoryStat label="Institutions monitored" value={stats.monitoredLabel} />
            </div>
          </div>
        </section>

        <StateDirectoryMap
          summaries={stateSummaries}
          selectedStateCode={stateCode}
          query={hasQuery ? query : ""}
          charterType={charterType}
        />

        <DirectoryFilters query={query} stateCode={stateCode} charterType={charterType} />

        {!shouldShowResults && (
          <section className="fi-reveal fi-reveal-delay-2 py-6">
            <div className="border-y border-[#E0D7C9] py-4">
              <p className="text-sm font-semibold text-[#1A1815]">
                Select a state to view institution profiles.
              </p>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[#6B6255]">
                Or search by name above to jump straight to an institution.
              </p>
            </div>
          </section>
        )}

        {shouldShowResults && results.total > 0 && (
          <section className="fi-reveal fi-reveal-delay-2 pt-5">
            <div className="mb-4">
              <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#6B6255]">
                {hasQuery
                  ? `Results for “${query}”`
                  : selectedStateName
                    ? `${selectedStateName} directory`
                    : "Search results"}
              </h2>
              <p className="mt-1 text-sm text-[#6B6255]">
                {results.total.toLocaleString("en-US")} institution{results.total !== 1 ? "s" : ""} found
                {query && (
                  <span>
                    {" "}for <strong className="text-[#1A1815]">{query}</strong>
                  </span>
                )}
                . Institutions with verified fees are listed first.
              </p>
            </div>

            <InstitutionMobileCards rows={results.rows} />
            <InstitutionResultsTable rows={results.rows} />
            <DirectoryPagination page={page} totalPages={totalPages} buildHref={buildPageHref} />
          </section>
        )}

        {shouldShowResults && results.total === 0 && (
          <div className="fi-reveal fi-reveal-delay-2 py-8 text-center">
            <p className="text-sm text-[#6B6255]">
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
      <p className="text-[11px] font-bold uppercase leading-tight tracking-[0.1em] text-[#6B6255]">
        {label}
      </p>
      <p className="mt-1 truncate text-base font-semibold tabular-nums text-[#1A1815]" title={value}>
        {value}
      </p>
    </div>
  );
}
