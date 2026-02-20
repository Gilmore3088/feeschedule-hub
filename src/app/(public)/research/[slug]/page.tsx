import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import {
  getArticleBySlug,
  getPublishedArticlesByCategory,
  getRecentPublishedSlugs,
} from "@/lib/crawler-db";
import { getDisplayName } from "@/lib/fee-taxonomy";
import { DISTRICT_NAMES } from "@/lib/fed-districts";

export const revalidate = 3600;

export async function generateStaticParams() {
  // Pre-build the most recent 20 published articles
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

export default async function ResearchArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = getArticleBySlug(slug);

  if (!article || article.status !== "published") notFound();

  // Related articles by same category
  const related = article.fee_category
    ? getPublishedArticlesByCategory(article.fee_category, 5).filter(
        (a) => a.id !== article.id
      )
    : [];

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      {/* JSON-LD Article schema */}
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
            publisher: {
              "@type": "Organization",
              name: "Bank Fee Index",
              url: "https://bankfeeindex.com",
            },
            author: {
              "@type": "Organization",
              name: "Bank Fee Index",
            },
          }).replace(/</g, "\\u003c"),
        }}
      />

      {/* Breadcrumb */}
      <div className="mb-6 text-sm text-slate-400">
        <Link href="/research" className="hover:text-slate-600 transition-colors">
          Research
        </Link>
        <span className="mx-2">/</span>
        <span className="text-slate-600">{article.title}</span>
      </div>

      {/* Article header */}
      <header className="mb-8">
        <div className="mb-3 flex items-center gap-2 text-[11px] text-slate-400">
          {article.fee_category && (
            <Link
              href={`/fees/${article.fee_category}`}
              className="rounded-full bg-slate-100 px-2.5 py-0.5 font-semibold text-slate-500 uppercase tracking-wider hover:bg-slate-200 transition-colors"
            >
              {getDisplayName(article.fee_category)}
            </Link>
          )}
          {article.fed_district && (
            <span className="text-slate-400">
              District {article.fed_district} - {DISTRICT_NAMES[article.fed_district]}
            </span>
          )}
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 leading-tight">
          {article.title}
        </h1>
        {article.summary && (
          <p className="mt-3 text-[15px] text-slate-500 leading-relaxed">
            {article.summary}
          </p>
        )}
        <div className="mt-4 text-sm text-slate-400">
          {article.published_at &&
            new Date(article.published_at).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          <span className="mx-2">|</span>
          Bank Fee Index Research
        </div>
        <p className="mt-3 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-400">
          This article was generated with AI assistance and reviewed by the
          Bank Fee Index team. Data and analysis are based on publicly available
          fee schedule documents.
        </p>
      </header>

      {/* Article body */}
      <div className="prose prose-slate max-w-none prose-headings:tracking-tight prose-h2:border-b prose-h2:border-slate-200 prose-h2:pb-2 prose-h2:mt-10 prose-h2:text-xl prose-p:leading-relaxed prose-li:leading-relaxed">
        <ArticleContent content={article.content_md} />
      </div>

      {/* Related data link */}
      {article.fee_category && (
        <div className="mt-10 rounded-lg border border-blue-100 bg-blue-50/50 p-5">
          <h3 className="text-sm font-bold text-slate-800 mb-1">
            Explore the Data
          </h3>
          <p className="text-sm text-slate-500 mb-3">
            See the full national benchmark data behind this article.
          </p>
          <Link
            href={`/fees/${article.fee_category}`}
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            View {getDisplayName(article.fee_category)} Data
            <svg
              className="h-4 w-4"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            >
              <path d="M6 4l4 4-4 4" />
            </svg>
          </Link>
        </div>
      )}

      {/* Related articles */}
      {related.length > 0 && (
        <div className="mt-10 border-t border-slate-200 pt-8">
          <h3 className="text-lg font-bold tracking-tight text-slate-900 mb-4">
            Related Research
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {related.slice(0, 4).map((r) => (
              <Link
                key={r.id}
                href={`/research/${r.slug}`}
                className="group rounded-lg border border-slate-200 bg-white p-4 hover:border-blue-300 hover:shadow-sm transition-all"
              >
                <h4 className="text-sm font-bold text-slate-900 group-hover:text-blue-600 transition-colors line-clamp-2">
                  {r.title}
                </h4>
                {r.summary && (
                  <p className="mt-1 text-xs text-slate-500 line-clamp-2">
                    {r.summary}
                  </p>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ArticleContent({ content }: { content: string }) {
  // Strip the H1 title (already shown in header)
  const lines = content.split("\n");
  const bodyLines = lines[0]?.startsWith("# ") ? lines.slice(1) : lines;
  const body = bodyLines.join("\n").trim();

  const elements: React.ReactNode[] = [];
  const parts = body.split("\n");
  let ulItems: string[] = [];
  let olItems: string[] = [];
  let blockquoteLines: string[] = [];
  let tableRows: string[][] = [];

  function flushUl() {
    if (ulItems.length > 0) {
      elements.push(
        <ul key={`ul-${elements.length}`}>
          {ulItems.map((item, i) => (
            <li key={i}><InlineMd text={item} /></li>
          ))}
        </ul>
      );
      ulItems = [];
    }
  }

  function flushOl() {
    if (olItems.length > 0) {
      elements.push(
        <ol key={`ol-${elements.length}`}>
          {olItems.map((item, i) => (
            <li key={i}><InlineMd text={item} /></li>
          ))}
        </ol>
      );
      olItems = [];
    }
  }

  function flushBlockquote() {
    if (blockquoteLines.length > 0) {
      elements.push(
        <blockquote key={`bq-${elements.length}`}>
          {blockquoteLines.map((line, i) => (
            <p key={i}><InlineMd text={line} /></p>
          ))}
        </blockquote>
      );
      blockquoteLines = [];
    }
  }

  function flushTable() {
    if (tableRows.length < 2) {
      tableRows = [];
      return;
    }
    const header = tableRows[0];
    // Skip separator row (row index 1 with dashes)
    const dataStart = tableRows.length > 1 && tableRows[1].every(c => /^[-:| ]+$/.test(c)) ? 2 : 1;
    const dataRows = tableRows.slice(dataStart);
    elements.push(
      <div key={`tbl-${elements.length}`} className="overflow-x-auto my-4">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200">
              {header.map((cell, i) => (
                <th key={i} className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  <InlineMd text={cell.trim()} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {dataRows.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  <td key={ci} className="px-3 py-2 text-slate-600">
                    <InlineMd text={cell.trim()} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
    tableRows = [];
  }

  function flushAll() {
    flushUl();
    flushOl();
    flushBlockquote();
    flushTable();
  }

  for (let i = 0; i < parts.length; i++) {
    const line = parts[i];

    // Table rows
    if (line.trim().startsWith("|") && line.trim().endsWith("|")) {
      flushUl();
      flushOl();
      flushBlockquote();
      const cells = line.trim().slice(1, -1).split("|");
      tableRows.push(cells);
      continue;
    }
    if (tableRows.length > 0) flushTable();

    // Blockquotes
    if (line.startsWith("> ")) {
      flushUl();
      flushOl();
      blockquoteLines.push(line.slice(2));
      continue;
    }
    if (blockquoteLines.length > 0) flushBlockquote();

    // Unordered list
    if (/^[-*]\s/.test(line)) {
      flushOl();
      ulItems.push(line.replace(/^[-*]\s+/, ""));
      continue;
    }
    if (ulItems.length > 0) flushUl();

    // Ordered list
    if (/^\d+\.\s/.test(line)) {
      flushUl();
      olItems.push(line.replace(/^\d+\.\s+/, ""));
      continue;
    }
    if (olItems.length > 0) flushOl();

    if (line.startsWith("## ")) {
      elements.push(<h2 key={i}><InlineMd text={line.slice(3)} /></h2>);
    } else if (line.startsWith("### ")) {
      elements.push(<h3 key={i}><InlineMd text={line.slice(4)} /></h3>);
    } else if (line.startsWith("#### ")) {
      elements.push(<h4 key={i}><InlineMd text={line.slice(5)} /></h4>);
    } else if (line === "---") {
      elements.push(<hr key={i} />);
    } else if (line.trim() === "") {
      // skip blank lines
    } else {
      elements.push(<p key={i}><InlineMd text={line} /></p>);
    }
  }

  flushAll();
  return <>{elements}</>;
}

function InlineMd({ text }: { text: string }) {
  // Split on: **bold**, *italic*, `code`, [text](url)
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={i}>{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith("*") && part.endsWith("*")) {
          return <em key={i}>{part.slice(1, -1)}</em>;
        }
        if (part.startsWith("`") && part.endsWith("`")) {
          return <code key={i}>{part.slice(1, -1)}</code>;
        }
        // [text](url)
        const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        if (linkMatch) {
          const [, linkText, href] = linkMatch;
          const isExternal = href.startsWith("http");
          return (
            <a
              key={i}
              href={href}
              className="text-blue-600 underline decoration-blue-200 hover:decoration-blue-400 transition-colors"
              {...(isExternal ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            >
              {linkText}
            </a>
          );
        }
        return part;
      })}
    </>
  );
}
