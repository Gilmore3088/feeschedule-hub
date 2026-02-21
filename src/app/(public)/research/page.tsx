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

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Research & Analysis
        </h1>
        <p className="mt-2 text-[15px] text-slate-500">
          Data-driven research on U.S. banking fees. Benchmark reports, trend
          analysis, and peer comparisons.
        </p>
      </div>

      {/* Search and Filters */}
      <div className="mb-8 space-y-4">
        <Suspense fallback={null}>
          <SearchBar />
        </Suspense>

        {/* Type filter chips */}
        <div className="flex flex-wrap gap-2">
          <Link
            href="/research"
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              !typeFilter
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            All
          </Link>
          {ARTICLE_TYPES.map((t) => {
            const params = new URLSearchParams();
            params.set("type", t.key);
            if (query) params.set("q", query);
            if (categoryFilter) params.set("category", categoryFilter);
            return (
              <Link
                key={t.key}
                href={`/research?${params.toString()}`}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  typeFilter === t.key
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
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
        <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-8 text-center">
          <p className="text-sm text-slate-500">
            {hasFilters
              ? "No articles match your filters. Try adjusting your search or removing filters."
              : "Research articles are coming soon. Check back for national benchmark reports, district comparisons, and fee trend analysis."}
          </p>
          {hasFilters && (
            <Link
              href="/research"
              className="mt-3 inline-block text-sm text-blue-600 hover:text-blue-700"
            >
              Clear all filters
            </Link>
          )}
        </div>
      ) : (
        <>
          {hasFilters && (
            <p className="mb-4 text-sm text-slate-400">
              {articles.length} article{articles.length !== 1 ? "s" : ""} found
            </p>
          )}
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {articles.map((article) => (
              <Link
                key={article.id}
                href={`/research/${article.slug}`}
                className="group rounded-lg border border-slate-200 bg-white p-5 hover:border-blue-300 hover:shadow-sm transition-all"
              >
                <div className="mb-2 flex items-center gap-2">
                  <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                    {TYPE_LABELS[article.article_type] ?? article.article_type}
                  </span>
                  {article.fee_category && (
                    <span className="text-[10px] text-slate-400">
                      {getDisplayName(article.fee_category)}
                    </span>
                  )}
                </div>
                <h2 className="text-sm font-bold text-slate-900 group-hover:text-blue-600 transition-colors line-clamp-2 mb-2">
                  {article.title}
                </h2>
                {article.summary && (
                  <p className="text-[12px] leading-relaxed text-slate-500 line-clamp-3">
                    {article.summary}
                  </p>
                )}
                <div className="mt-3 flex items-center gap-2 text-[11px] text-slate-400">
                  {article.published_at
                    ? new Date(article.published_at).toLocaleDateString(
                        "en-US",
                        { year: "numeric", month: "short", day: "numeric" }
                      )
                    : ""}
                  {article.reading_time_min && (
                    <>
                      <span className="text-slate-300">|</span>
                      <span>{article.reading_time_min} min read</span>
                    </>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
