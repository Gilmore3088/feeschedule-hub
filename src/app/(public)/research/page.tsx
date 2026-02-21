import Link from "next/link";
import type { Metadata } from "next";
import { Suspense } from "react";
import { getFilteredPublishedArticles } from "@/lib/crawler-db";
import { getDisplayName } from "@/lib/fee-taxonomy";
import { SearchBar } from "./search-bar";

export const metadata: Metadata = {
  title: "Research & Analysis | Bank Fee Index",
  description:
    "Data-driven research and analysis on U.S. banking fees. Benchmark reports, trend analysis, and peer comparisons.",
};

export const revalidate = 3600;

const TYPE_LABELS: Record<string, string> = {
  national_benchmark: "National Benchmark",
  district_comparison: "District Comparison",
  charter_comparison: "Charter Comparison",
  top_10: "Top 10",
  quarterly_trend: "Quarterly Trend",
};

const TYPE_ICONS: Record<string, string> = {
  national_benchmark: "N",
  district_comparison: "D",
  charter_comparison: "C",
  top_10: "#",
  quarterly_trend: "Q",
};

const ARTICLE_TYPES = [
  { key: "national_benchmark", label: "Benchmark" },
  { key: "district_comparison", label: "District" },
  { key: "charter_comparison", label: "Charter" },
  { key: "top_10", label: "Top 10" },
];

export default async function ResearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; category?: string }>;
}) {
  const params = await searchParams;
  const query = params.q ?? "";
  const typeFilter = params.type ?? "";
  const categoryFilter = params.category ?? "";

  const articles = getFilteredPublishedArticles({
    query: query || undefined,
    articleType: typeFilter || undefined,
    feeCategory: categoryFilter || undefined,
    limit: 50,
  });

  const hasFilters = !!(query || typeFilter || categoryFilter);

  // Split featured (first article) from the rest if unfiltered
  const featured = !hasFilters && articles.length > 0 ? articles[0] : null;
  const grid = featured ? articles.slice(1) : articles;

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      {/* Header */}
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900">
            <svg className="h-4 w-4 text-white" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M2 2v12h12M5 10V8M8 10V6M11 10V4" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Research & Analysis
          </h1>
        </div>
        <p className="text-[15px] text-slate-500 max-w-2xl">
          Data-driven research on U.S. banking fees. National benchmarks, district
          comparisons, charter analysis, and fee trend reports.
        </p>
      </div>

      {/* Search and Filters */}
      <div className="mb-8 space-y-3">
        <Suspense fallback={null}>
          <SearchBar />
        </Suspense>

        {/* Type filter chips */}
        <div className="flex flex-wrap gap-2">
          <Link
            href="/research"
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
              !typeFilter
                ? "bg-slate-900 text-white shadow-sm"
                : "bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200"
            }`}
          >
            All Reports
          </Link>
          {ARTICLE_TYPES.map((t) => {
            const p = new URLSearchParams();
            p.set("type", t.key);
            if (query) p.set("q", query);
            if (categoryFilter) p.set("category", categoryFilter);
            return (
              <Link
                key={t.key}
                href={`/research?${p.toString()}`}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                  typeFilter === t.key
                    ? "bg-slate-900 text-white shadow-sm"
                    : "bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Results */}
      {articles.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-12 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
            <svg className="h-6 w-6 text-slate-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M2 2v12h12M5 10V8M8 10V6M11 10V4" />
            </svg>
          </div>
          <p className="text-sm font-medium text-slate-700 mb-1">
            {hasFilters ? "No matching reports" : "Reports coming soon"}
          </p>
          <p className="text-sm text-slate-500 max-w-sm mx-auto">
            {hasFilters
              ? "Try adjusting your search or removing filters."
              : "Check back for national benchmark reports, district comparisons, and fee trend analysis."}
          </p>
          {hasFilters && (
            <Link
              href="/research"
              className="mt-4 inline-block rounded-md bg-slate-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-slate-800 transition-colors"
            >
              Clear all filters
            </Link>
          )}
        </div>
      ) : (
        <>
          {hasFilters && (
            <p className="mb-4 text-sm text-slate-400">
              {articles.length} report{articles.length !== 1 ? "s" : ""} found
            </p>
          )}

          {/* Featured article (hero card) */}
          {featured && (
            <Link
              href={`/research/${featured.slug}`}
              className="group mb-8 block rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-6 sm:p-8 hover:border-slate-300 hover:shadow-md transition-all"
            >
              <div className="flex items-center gap-3 mb-4">
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-900 text-[11px] font-bold text-white">
                  {TYPE_ICONS[featured.article_type] ?? "R"}
                </span>
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  {TYPE_LABELS[featured.article_type] ?? featured.article_type}
                </span>
                {featured.fee_category && (
                  <>
                    <span className="text-slate-300">/</span>
                    <span className="text-[11px] font-medium text-slate-400">
                      {getDisplayName(featured.fee_category)}
                    </span>
                  </>
                )}
              </div>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 group-hover:text-blue-600 transition-colors mb-3">
                {featured.title}
              </h2>
              {featured.summary && (
                <p className="text-[15px] leading-relaxed text-slate-500 line-clamp-3 max-w-3xl">
                  {featured.summary}
                </p>
              )}
              <div className="mt-5 flex items-center gap-4 text-[12px] text-slate-400">
                {featured.published_at && (
                  <span>
                    {new Date(featured.published_at).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </span>
                )}
                {featured.reading_time_min && (
                  <span className="flex items-center gap-1">
                    <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <circle cx="8" cy="8" r="6" />
                      <path d="M8 5v3l2 1.5" strokeLinecap="round" />
                    </svg>
                    {featured.reading_time_min} min read
                  </span>
                )}
                <span className="ml-auto text-[12px] font-medium text-blue-600 group-hover:text-blue-700 transition-colors">
                  Read report →
                </span>
              </div>
            </Link>
          )}

          {/* Article grid */}
          {grid.length > 0 && (
            <div className="grid gap-px sm:grid-cols-2 lg:grid-cols-3 rounded-xl border border-slate-200 overflow-hidden bg-slate-200">
              {grid.map((article) => (
                <Link
                  key={article.id}
                  href={`/research/${article.slug}`}
                  className="group flex flex-col bg-white p-5 hover:bg-slate-50/80 transition-colors"
                >
                  <div className="mb-3 flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded bg-slate-100 text-[9px] font-bold text-slate-500">
                      {TYPE_ICONS[article.article_type] ?? "R"}
                    </span>
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                      {TYPE_LABELS[article.article_type] ?? article.article_type}
                    </span>
                  </div>
                  <h2 className="text-sm font-bold text-slate-900 group-hover:text-blue-600 transition-colors line-clamp-2 mb-2">
                    {article.title}
                  </h2>
                  {article.summary && (
                    <p className="text-[12px] leading-relaxed text-slate-500 line-clamp-2 mb-auto">
                      {article.summary}
                    </p>
                  )}
                  <div className="mt-3 pt-3 border-t border-slate-100 flex items-center text-[11px] text-slate-400">
                    {article.published_at
                      ? new Date(article.published_at).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })
                      : ""}
                    {article.fee_category && (
                      <>
                        <span className="mx-2 text-slate-200">|</span>
                        <span>{getDisplayName(article.fee_category)}</span>
                      </>
                    )}
                    {article.reading_time_min && (
                      <>
                        <span className="mx-2 text-slate-200">|</span>
                        <span>{article.reading_time_min} min</span>
                      </>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
