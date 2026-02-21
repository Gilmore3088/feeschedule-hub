import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import {
  getArticleBySlug,
  getPublishedArticlesByCategory,
  getRecentPublishedSlugs,
  getCategoryIndex,
} from "@/lib/crawler-db";
import { getDisplayName } from "@/lib/fee-taxonomy";
import { DISTRICT_NAMES } from "@/lib/fed-districts";
import { renderMarkdown } from "@/lib/markdown";
import { formatAmount } from "@/lib/format";
import { TableOfContents } from "./table-of-contents";

export const revalidate = 3600;

export async function generateStaticParams() {
  const slugs = getRecentPublishedSlugs(20);
  return slugs.map((slug) => ({ slug }));
}

export const dynamicParams = true;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const article = getArticleBySlug(slug);
  if (!article) return {};

  return {
    title: `${article.title} | Bank Fee Index Research`,
    description: article.summary ?? `Research and analysis from Bank Fee Index.`,
    alternates: { canonical: `/research/${slug}` },
    openGraph: {
      title: article.title,
      description: article.summary ?? undefined,
      type: "article",
      publishedTime: article.published_at ?? undefined,
    },
  };
}

const TYPE_LABELS: Record<string, string> = {
  national_benchmark: "National Benchmark Report",
  district_comparison: "District Comparison",
  charter_comparison: "Charter Comparison",
  top_10: "Top 10 Report",
  quarterly_trend: "Quarterly Trend",
};

function extractHeadings(md: string): { id: string; text: string }[] {
  const headings: { id: string; text: string }[] = [];
  for (const line of md.split("\n")) {
    const match = line.match(/^## (.+)/);
    if (match) {
      const text = match[1].replace(/\*\*/g, "");
      const id = text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      headings.push({ id, text });
    }
  }
  return headings;
}

export default async function ResearchArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = getArticleBySlug(slug);

  if (!article || article.status !== "published") notFound();

  const related = article.fee_category
    ? getPublishedArticlesByCategory(article.fee_category, 5).filter(
        (a) => a.id !== article.id
      )
    : [];

  // Get live index data for the key stats sidebar
  const indexEntry = article.fee_category
    ? getCategoryIndex(article.fee_category)
    : null;

  const lines = article.content_md.split("\n");
  const bodyLines = lines[0]?.startsWith("# ") ? lines.slice(1) : lines;
  const bodyMd = bodyLines.join("\n").trim();
  const headings = extractHeadings(bodyMd);

  return (
    <div className="bg-white">
      {/* JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: article.title,
            description: article.summary,
            datePublished: article.published_at,
            dateModified: article.updated_at,
            publisher: { "@type": "Organization", name: "Bank Fee Index", url: "https://bankfeeindex.com" },
            author: { "@type": "Organization", name: "Bank Fee Index" },
            ...(article.fee_category && article.data_snapshot_date
              ? { about: { "@type": "Dataset", name: `U.S. Banking Fee Data - ${getDisplayName(article.fee_category)}`, temporalCoverage: article.data_snapshot_date } }
              : {}),
            articleSection: article.article_type.replace(/_/g, " "),
          }).replace(/</g, "\\u003c"),
        }}
      />

      {/* ─── Header band ─── */}
      <div className="border-b border-slate-200 bg-gradient-to-b from-slate-50/80 to-white">
        <div className="mx-auto max-w-6xl px-6 pt-10 pb-8">
          {/* Breadcrumb */}
          <nav aria-label="Breadcrumb" className="mb-6 flex items-center gap-2 text-[13px] text-slate-400">
            <Link href="/research" className="hover:text-slate-600 transition-colors">
              Research
            </Link>
            <svg className="h-3 w-3 text-slate-300" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 4l4 4-4 4" /></svg>
            <span className="text-slate-500">
              {TYPE_LABELS[article.article_type] ?? article.article_type}
            </span>
          </nav>

          <div className="flex flex-wrap items-center gap-2 mb-4">
            <span className="inline-flex items-center rounded bg-slate-900 px-2.5 py-1 text-[10px] font-bold text-white uppercase tracking-widest">
              {(TYPE_LABELS[article.article_type] ?? article.article_type).split(" ")[0]}
            </span>
            {article.fee_category && (
              <Link
                href={`/fees/${article.fee_category}`}
                className="inline-flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-100 transition-colors"
              >
                {getDisplayName(article.fee_category)}
              </Link>
            )}
            {article.fed_district && (
              <span className="inline-flex items-center rounded-md bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-500">
                District {article.fed_district} — {DISTRICT_NAMES[article.fed_district]}
              </span>
            )}
          </div>

          <h1 className="text-2xl sm:text-[28px] font-bold tracking-tight text-slate-900 leading-[1.2] max-w-4xl">
            {article.title}
          </h1>

          {article.summary && (
            <p className="mt-4 text-[16px] leading-relaxed text-slate-500 max-w-3xl">
              {article.summary}
            </p>
          )}

          {/* Meta bar */}
          <div className="mt-6 flex flex-wrap items-center gap-x-1 text-[12px] text-slate-400">
            <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5">
              {article.published_at
                ? new Date(article.published_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
                : "Draft"}
            </span>
            {article.data_snapshot_date && (
              <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5">
                Data: {new Date(article.data_snapshot_date + "T00:00:00").toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
              </span>
            )}
            {article.reading_time_min && (
              <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5">
                {article.reading_time_min} min read
              </span>
            )}
            {indexEntry && (
              <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5">
                {indexEntry.institution_count.toLocaleString()} institutions
              </span>
            )}
          </div>

          {/* Staleness banner */}
          {article.data_snapshot_date &&
            (Date.now() - new Date(article.data_snapshot_date + "T00:00:00").getTime()) / 86400000 > 30 && (
              <div className="mt-5 flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-700">
                <svg className="h-4 w-4 mt-0.5 shrink-0 text-amber-500" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M8 2v6M8 11v1" /><circle cx="8" cy="8" r="7" /></svg>
                <span>
                  This report uses data from{" "}
                  {new Date(article.data_snapshot_date + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                  . Newer data may be available.
                  {article.fee_category && (
                    <> <Link href={`/fees/${article.fee_category}`} className="font-semibold text-amber-800 underline underline-offset-2 hover:text-amber-900">View latest</Link></>
                  )}
                </span>
              </div>
            )}
        </div>
      </div>

      {/* ─── Key stats bar (for benchmark articles) ─── */}
      {indexEntry && (
        <div className="border-b border-slate-100 bg-white">
          <div className="mx-auto max-w-6xl px-6 py-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <StatCard label="National Median" value={formatAmount(indexEntry.median_amount)} />
              <StatCard label="25th Percentile" value={formatAmount(indexEntry.p25_amount)} />
              <StatCard label="75th Percentile" value={formatAmount(indexEntry.p75_amount)} />
              <StatCard label="Institutions" value={indexEntry.institution_count.toLocaleString()} />
            </div>
          </div>
        </div>
      )}

      {/* ─── Two-column body ─── */}
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="lg:grid lg:grid-cols-[1fr_240px] lg:gap-12">

          {/* Main content */}
          <div className="min-w-0">
            <ArticleBody content={bodyMd} />

            {/* Explore data CTA */}
            {article.fee_category && (
              <div className="mt-12 rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-6">
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-900">
                    <svg className="h-5 w-5 text-white" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                      <path d="M2 2v12h12M5 10V7M8 10V5M11 10V3" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-[15px] font-bold text-slate-900">
                      Explore the Underlying Data
                    </h3>
                    <p className="mt-1 text-[13px] text-slate-500 leading-relaxed">
                      Interactive charts, peer comparisons, and full distribution data for {getDisplayName(article.fee_category).toLowerCase()} fees.
                    </p>
                    <Link
                      href={`/fees/${article.fee_category}`}
                      className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 transition-colors"
                    >
                      View {getDisplayName(article.fee_category)} Data
                      <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 4l4 4-4 4" /></svg>
                    </Link>
                  </div>
                </div>
              </div>
            )}

            {/* Provenance */}
            <div className="mt-8 rounded-lg border border-slate-100 bg-slate-50/50 px-4 py-3 text-[12px] text-slate-400 leading-relaxed">
              This report was generated with AI assistance and reviewed by the Bank Fee Index team.
              Data and analysis are based on publicly available fee schedule documents.
            </div>
          </div>

          {/* Sidebar */}
          <aside className="hidden lg:block">
            <div className="sticky top-20 space-y-6">
              {/* Table of contents */}
              {headings.length > 2 && (
                <div>
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">
                    In This Report
                  </h4>
                  <TableOfContents headings={headings} />
                </div>
              )}

              {/* Quick links */}
              {article.fee_category && (
                <div className="border-t border-slate-100 pt-5">
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">
                    Related Data
                  </h4>
                  <div className="space-y-1.5">
                    <SidebarLink href={`/fees/${article.fee_category}`} label={`${getDisplayName(article.fee_category)} Index`} />
                    <SidebarLink href={`/fees/${article.fee_category}/cheapest`} label="Lowest Fee Institutions" />
                    <SidebarLink href="/fees" label="All Fee Categories" />
                  </div>
                </div>
              )}

              {/* Share / actions */}
              <div className="border-t border-slate-100 pt-5">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">
                  Share
                </h4>
                <div className="flex gap-2">
                  <CopyLinkButton />
                </div>
              </div>
            </div>
          </aside>
        </div>

        {/* Related articles */}
        {related.length > 0 && (
          <div className="mt-14 border-t border-slate-200 pt-10">
            <h3 className="text-lg font-bold tracking-tight text-slate-900 mb-5">
              Related Research
            </h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {related.slice(0, 3).map((r) => (
                <Link
                  key={r.id}
                  href={`/research/${r.slug}`}
                  className="group rounded-lg border border-slate-200 bg-white p-5 hover:border-slate-300 hover:shadow-sm transition-all"
                >
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    {TYPE_LABELS[r.article_type]?.split(" ")[0] ?? r.article_type}
                  </span>
                  <h4 className="mt-2 text-sm font-bold text-slate-900 group-hover:text-blue-600 transition-colors line-clamp-2">
                    {r.title}
                  </h4>
                  {r.summary && (
                    <p className="mt-2 text-[12px] text-slate-500 line-clamp-2 leading-relaxed">
                      {r.summary}
                    </p>
                  )}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/50 px-4 py-3">
      <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{label}</div>
      <div className="mt-1 text-xl font-bold text-slate-900 tabular-nums">{value}</div>
    </div>
  );
}

function SidebarLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
    >
      <svg className="h-3 w-3 text-slate-300 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 4l4 4-4 4" /></svg>
      {label}
    </Link>
  );
}

function CopyLinkButton() {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-medium text-slate-600 hover:bg-slate-50 transition-colors"
      data-copy-link
    >
      <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <rect x="5" y="5" width="8" height="8" rx="1" />
        <path d="M3 11V3h8" />
      </svg>
      Copy Link
    </button>
  );
}

async function ArticleBody({ content }: { content: string }) {
  const html = await renderMarkdown(content);

  return (
    <article
      className="
        prose prose-slate max-w-none

        prose-headings:tracking-tight prose-headings:font-bold prose-headings:text-slate-900
        prose-h2:text-[20px] prose-h2:mt-12 prose-h2:mb-4 prose-h2:pb-3
        prose-h2:border-b prose-h2:border-slate-200
        prose-h3:text-[16px] prose-h3:mt-8 prose-h3:mb-3 prose-h3:text-slate-800

        prose-p:text-[15px] prose-p:leading-[1.8] prose-p:text-slate-600
        prose-li:text-[15px] prose-li:leading-[1.8] prose-li:text-slate-600
        prose-li:marker:text-slate-300

        prose-strong:text-slate-900 prose-strong:font-semibold
        prose-a:text-blue-600 prose-a:no-underline prose-a:font-medium
        prose-a:border-b prose-a:border-blue-200
        hover:prose-a:border-blue-500 hover:prose-a:text-blue-700

        prose-table:my-6 prose-table:text-sm prose-table:border-collapse prose-table:w-full
        prose-table:rounded-lg prose-table:overflow-hidden prose-table:border prose-table:border-slate-200
        prose-thead:bg-slate-50
        prose-th:text-[11px] prose-th:font-bold prose-th:text-slate-500
        prose-th:uppercase prose-th:tracking-wider
        prose-th:px-4 prose-th:py-3 prose-th:text-left
        prose-th:border-b prose-th:border-slate-200
        prose-td:px-4 prose-td:py-3
        prose-td:border-b prose-td:border-slate-100
        prose-td:text-slate-600 prose-td:align-top

        prose-blockquote:border-l-[3px] prose-blockquote:border-slate-900
        prose-blockquote:bg-slate-50 prose-blockquote:rounded-r-lg
        prose-blockquote:py-3 prose-blockquote:px-5
        prose-blockquote:not-italic prose-blockquote:text-slate-700

        prose-code:text-[13px] prose-code:bg-slate-100
        prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded
        prose-code:before:content-none prose-code:after:content-none

        prose-hr:my-10 prose-hr:border-slate-200

        prose-ul:my-4 prose-ol:my-4
      "
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
