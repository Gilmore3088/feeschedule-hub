import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { getArticles, countArticlesByStatus } from "@/lib/crawler-db";
import type { ArticleStatus } from "@/lib/crawler-db";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { timeAgo } from "@/lib/format";
import { getDisplayName } from "@/lib/fee-taxonomy";

const STATUS_TABS = ["review", "draft", "approved", "published", "rejected"] as const;

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-500 dark:bg-white/[0.08] dark:text-gray-400",
  review: "bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
  approved: "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400",
  published: "bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400",
  rejected: "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400",
};

const TYPE_LABELS: Record<string, string> = {
  national_benchmark: "National Benchmark",
  district_comparison: "District Comparison",
  charter_comparison: "Charter Comparison",
  top_10: "Top 10",
  quarterly_trend: "Quarterly Trend",
};

const TIER_LABELS: Record<number, string> = {
  1: "Auto",
  2: "Light",
  3: "Full",
};

export default async function ArticlesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireAuth();
  const params = await searchParams;

  const activeStatus = (params.status as ArticleStatus) || undefined;
  const articles = getArticles(activeStatus, 100);
  const counts = countArticlesByStatus();
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div>
      <Breadcrumbs items={[{ label: "Articles" }]} />

      <div className="mb-6">
        <h1 className="text-xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
          Research Articles
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {total} articles generated. Review and publish research content.
        </p>
      </div>

      {/* Status tabs */}
      <div className="mb-4 flex items-center gap-1 border-b border-gray-200 dark:border-white/[0.06]">
        <Link
          href="/admin/articles"
          className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
            !activeStatus
              ? "border-gray-900 text-gray-900 dark:border-gray-100 dark:text-gray-100"
              : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
          }`}
        >
          All ({total})
        </Link>
        {STATUS_TABS.map((s) => (
          <Link
            key={s}
            href={`/admin/articles?status=${s}`}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeStatus === s
                ? "border-gray-900 text-gray-900 dark:border-gray-100 dark:text-gray-100"
                : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            }`}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)} ({counts[s] ?? 0})
          </Link>
        ))}
      </div>

      {/* Articles table */}
      {articles.length === 0 ? (
        <div className="rounded-lg border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] p-8 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No articles found.{" "}
            {total === 0
              ? "Run `python -m fee_crawler generate-articles` to create articles."
              : "Try a different status filter."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-white/[0.06]">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50/80 dark:bg-white/[0.03]">
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                  Title
                </th>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                  Category
                </th>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                  Review
                </th>
                <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                  Generated
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-white/[0.04]">
              {articles.map((article) => (
                <tr
                  key={article.id}
                  className="hover:bg-gray-50/50 dark:hover:bg-white/[0.02] transition-colors"
                >
                  <td className="px-4 py-2.5 max-w-[400px]">
                    <Link
                      href={`/admin/articles/${article.id}`}
                      className="font-medium text-gray-900 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400 transition-colors line-clamp-1"
                    >
                      {article.title}
                    </Link>
                    {article.summary && (
                      <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500 line-clamp-1">
                        {article.summary}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    {TYPE_LABELS[article.article_type] ?? article.article_type}
                  </td>
                  <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    {article.fee_category
                      ? getDisplayName(article.fee_category)
                      : "-"}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        STATUS_COLORS[article.status] ?? STATUS_COLORS.draft
                      }`}
                    >
                      {article.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    <span className="text-xs">
                      Tier {article.review_tier} (
                      {TIER_LABELS[article.review_tier] ?? "?"})
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-400 dark:text-gray-500 tabular-nums whitespace-nowrap">
                    {timeAgo(article.generated_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
