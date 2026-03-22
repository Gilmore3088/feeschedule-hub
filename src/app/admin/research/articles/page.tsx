import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { getArticles } from "@/lib/crawler-db/articles";
import { ensureResearchTables } from "@/lib/research/history";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { timeAgo } from "@/lib/format";
import { ArticleActions } from "./article-actions";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-500 dark:bg-white/[0.08] dark:text-gray-400",
  published: "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400",
  archived: "bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400",
};

const CATEGORY_LABELS: Record<string, string> = {
  guide: "Guide",
  analysis: "Analysis",
  report: "Report",
  brief: "Brief",
};

export default async function ArticlesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; category?: string }>;
}) {
  await requireAuth("view");
  await ensureResearchTables();

  const params = await searchParams;
  const { articles, total } = await getArticles({
    status: params.status || undefined,
    category: params.category || undefined,
  });

  return (
    <div className="admin-content space-y-6">
      <div>
        <Breadcrumbs
          items={[
            { label: "Dashboard", href: "/admin" },
            { label: "Research", href: "/admin/research" },
            { label: "Articles" },
          ]}
        />
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-gray-900">
              Articles
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {total} articles &middot; Manage published research content
            </p>
          </div>
          <Link
            href="/admin/research/content-writer"
            className="inline-flex items-center gap-1.5 rounded-md bg-gray-900 px-3.5 py-2 text-[12px] font-semibold text-white hover:bg-gray-800 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            New Article
          </Link>
        </div>
      </div>

      {/* Status filters */}
      <div className="flex gap-1">
        {[
          { value: "", label: "All" },
          { value: "draft", label: "Drafts" },
          { value: "published", label: "Published" },
          { value: "archived", label: "Archived" },
        ].map((f) => (
          <Link
            key={f.value}
            href={`/admin/research/articles${f.value ? `?status=${f.value}` : ""}`}
            className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
              (params.status || "") === f.value
                ? "bg-gray-900 text-white dark:bg-white/10 dark:text-gray-100"
                : "text-gray-500 hover:text-gray-700 border border-gray-200 dark:border-white/10 dark:text-gray-400"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {/* Articles table */}
      <div className="admin-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50/80 dark:bg-white/[0.03] text-left">
              <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Title</th>
              <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Category</th>
              <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Status</th>
              <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-right">Views</th>
              <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Updated</th>
              <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {articles.map((article) => (
              <tr key={article.id} className="border-b last:border-0 hover:bg-gray-50/50 dark:hover:bg-white/[0.02] transition-colors">
                <td className="px-4 py-2.5">
                  <div>
                    <span className="font-medium text-gray-900 dark:text-gray-100 text-xs">
                      {article.title}
                    </span>
                    {article.subtitle && (
                      <p className="text-[11px] text-gray-400 mt-0.5 truncate max-w-xs">{article.subtitle}</p>
                    )}
                    <p className="text-[10px] text-gray-300 dark:text-gray-600 mt-0.5">/{article.slug}</p>
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  <span className="text-xs text-gray-500">{CATEGORY_LABELS[article.category] || article.category}</span>
                </td>
                <td className="px-4 py-2.5">
                  <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_COLORS[article.status] || STATUS_COLORS.draft}`}>
                    {article.status}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-xs text-gray-500">
                  {article.view_count}
                </td>
                <td className="px-4 py-2.5 text-xs text-gray-500">
                  {timeAgo(article.updated_at)}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <ArticleActions article={article} />
                </td>
              </tr>
            ))}
            {articles.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-gray-500">
                  No articles yet. Use the Content Writer agent to generate your first article.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
