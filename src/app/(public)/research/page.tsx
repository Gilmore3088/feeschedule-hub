import Link from "next/link";
import type { Metadata } from "next";
import { getPublishedArticles } from "@/lib/crawler-db";
import { getDisplayName } from "@/lib/fee-taxonomy";
import { DISTRICT_NAMES } from "@/lib/fed-districts";

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

export default function ResearchPage() {
  const articles = getPublishedArticles(50);

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <div className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Research & Analysis
        </h1>
        <p className="mt-2 text-[15px] text-slate-500">
          Data-driven research on U.S. banking fees. Benchmark reports, trend
          analysis, and peer comparisons.
        </p>
      </div>

      {articles.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-8 text-center">
          <p className="text-sm text-slate-500">
            Research articles are coming soon. Check back for national benchmark
            reports, district comparisons, and fee trend analysis.
          </p>
        </div>
      ) : (
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
              <div className="mt-3 text-[11px] text-slate-400">
                {article.published_at
                  ? new Date(article.published_at).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })
                  : ""}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
