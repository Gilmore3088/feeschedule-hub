import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { getArticleById } from "@/lib/crawler-db";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { getDisplayName } from "@/lib/fee-taxonomy";
import { DISTRICT_NAMES } from "@/lib/fed-districts";
import { ArticleActions } from "./article-actions";
import { CollapsiblePanel } from "./collapsible-panel";

export default async function ArticleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAuth();
  const { id } = await params;
  const articleId = parseInt(id, 10);

  if (isNaN(articleId)) notFound();

  const article = getArticleById(articleId);
  if (!article) notFound();

  const statusColors: Record<string, string> = {
    draft: "bg-gray-100 text-gray-500",
    review: "bg-blue-50 text-blue-600",
    approved: "bg-emerald-50 text-emerald-600",
    published: "bg-purple-50 text-purple-600",
    rejected: "bg-red-50 text-red-600",
  };

  const tierLabels: Record<number, string> = { 1: "Auto-publish", 2: "Light review", 3: "Full compliance review" };

  return (
    <div>
      <Breadcrumbs
        items={[
          { label: "Articles", href: "/admin/articles" },
          { label: article.title },
        ]}
      />

      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
            {article.title}
          </h1>
          <div className="mt-2 flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
            <span
              className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
                statusColors[article.status] ?? statusColors.draft
              }`}
            >
              {article.status}
            </span>
            <span>
              Tier {article.review_tier} ({tierLabels[article.review_tier] ?? "?"})
            </span>
            {article.fee_category && (
              <span>{getDisplayName(article.fee_category)}</span>
            )}
            {article.fed_district && (
              <span>
                District {article.fed_district} -{" "}
                {DISTRICT_NAMES[article.fed_district]}
              </span>
            )}
          </div>
          {article.summary && (
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-300 italic">
              {article.summary}
            </p>
          )}
        </div>

        <ArticleActions articleId={article.id} status={article.status} />
      </div>

      {/* Metadata bar */}
      <div className="mb-6 flex flex-wrap gap-4 rounded-lg bg-gray-50 dark:bg-white/[0.03] border border-gray-200 dark:border-white/[0.06] px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
        <div>
          <span className="font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Model:</span>{" "}
          {article.model_id ?? "unknown"}
        </div>
        <div>
          <span className="font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Hash:</span>{" "}
          <code className="text-xs">{article.prompt_hash ?? "N/A"}</code>
        </div>
        <div>
          <span className="font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Generated:</span>{" "}
          {article.generated_at}
        </div>
        {article.reviewed_by && (
          <div>
            <span className="font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Reviewed by:</span>{" "}
            {article.reviewed_by} at {article.reviewed_at}
          </div>
        )}
        {article.published_at && (
          <div>
            <span className="font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Published:</span>{" "}
            {article.published_at}
          </div>
        )}
      </div>

      {/* Article content (rendered as markdown-like prose) */}
      <div className="mb-6 rounded-lg border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] p-6 lg:p-8">
        <div className="prose prose-sm prose-gray dark:prose-invert max-w-none">
          <ArticleMarkdown content={article.content_md} />
        </div>
      </div>

      {/* Collapsible panels */}
      <div className="space-y-3">
        <CollapsiblePanel title="Data Context (JSON)" defaultOpen={false}>
          <pre className="overflow-x-auto rounded bg-gray-50 dark:bg-white/[0.03] p-4 text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
            {JSON.stringify(JSON.parse(article.data_context), null, 2)}
          </pre>
        </CollapsiblePanel>
      </div>
    </div>
  );
}

function ArticleMarkdown({ content }: { content: string }) {
  // Simple markdown-to-HTML: handles headers, bold, lists, code blocks, horizontal rules
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeLines: string[] = [];
  let listItems: string[] = [];

  function flushList() {
    if (listItems.length > 0) {
      elements.push(
        <ul key={`list-${elements.length}`} className="list-disc pl-5 space-y-1">
          {listItems.map((item, i) => (
            <li key={i}>
              <InlineMarkdown text={item} />
            </li>
          ))}
        </ul>
      );
      listItems = [];
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("```")) {
      if (inCodeBlock) {
        elements.push(
          <pre
            key={`code-${i}`}
            className="overflow-x-auto rounded bg-gray-100 dark:bg-white/[0.05] p-3 text-xs"
          >
            {codeLines.join("\n")}
          </pre>
        );
        codeLines = [];
        inCodeBlock = false;
      } else {
        flushList();
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    // List items
    if (/^[-*]\s/.test(line)) {
      listItems.push(line.replace(/^[-*]\s+/, ""));
      continue;
    }
    if (/^\d+\.\s/.test(line)) {
      listItems.push(line.replace(/^\d+\.\s+/, ""));
      continue;
    }

    flushList();

    if (line.startsWith("# ")) {
      elements.push(
        <h1 key={i} className="text-2xl font-bold tracking-tight mt-6 mb-3">
          <InlineMarkdown text={line.slice(2)} />
        </h1>
      );
    } else if (line.startsWith("## ")) {
      elements.push(
        <h2
          key={i}
          className="text-lg font-bold tracking-tight mt-6 mb-2 border-b border-gray-200 dark:border-white/[0.06] pb-1"
        >
          <InlineMarkdown text={line.slice(3)} />
        </h2>
      );
    } else if (line.startsWith("### ")) {
      elements.push(
        <h3 key={i} className="text-base font-semibold mt-4 mb-1">
          <InlineMarkdown text={line.slice(4)} />
        </h3>
      );
    } else if (line === "---") {
      elements.push(
        <hr key={i} className="my-6 border-gray-200 dark:border-white/[0.06]" />
      );
    } else if (line.trim() === "") {
      // Skip blank lines
    } else {
      elements.push(
        <p key={i} className="mb-2 leading-relaxed">
          <InlineMarkdown text={line} />
        </p>
      );
    }
  }

  flushList();

  return <>{elements}</>;
}

function InlineMarkdown({ text }: { text: string }) {
  // Handle **bold**, *italic*, `code`, and $amounts
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <strong key={i} className="font-semibold">
              {part.slice(2, -2)}
            </strong>
          );
        }
        if (part.startsWith("*") && part.endsWith("*")) {
          return <em key={i}>{part.slice(1, -1)}</em>;
        }
        if (part.startsWith("`") && part.endsWith("`")) {
          return (
            <code
              key={i}
              className="rounded bg-gray-100 dark:bg-white/[0.08] px-1 py-0.5 text-xs"
            >
              {part.slice(1, -1)}
            </code>
          );
        }
        return part;
      })}
    </>
  );
}
