import { listIntelligence, type ExternalIntelligence } from "@/lib/crawler-db/intelligence";
import { IntelligenceAddForm } from "./intelligence-add-form";
import { IntelligenceDeleteButton } from "./intelligence-delete-button";

const CATEGORY_LABELS: Record<string, string> = {
  research: "Research",
  survey: "Survey",
  regulation: "Regulation",
  news: "News",
  analysis: "Analysis",
};

const CATEGORY_COLORS: Record<string, string> = {
  research: "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  survey: "bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  regulation: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  news: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
  analysis: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
};

function CategoryBadge({ category }: { category: string }) {
  const label = CATEGORY_LABELS[category] ?? category;
  const color = CATEGORY_COLORS[category] ?? "bg-gray-100 text-gray-600";
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${color}`}>
      {label}
    </span>
  );
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function IntelligenceRow({ item }: { item: ExternalIntelligence }) {
  return (
    <tr className="hover:bg-gray-50/50 dark:hover:bg-white/[0.02] transition-colors border-b border-gray-100 dark:border-white/[0.04] last:border-0">
      <td className="px-4 py-3 align-top">
        <div className="font-medium text-sm text-gray-900 dark:text-gray-100 leading-snug">
          {item.source_url ? (
            <a
              href={item.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            >
              {item.source_name}
            </a>
          ) : (
            item.source_name
          )}
        </div>
        <div className="text-[11px] text-gray-400 mt-0.5">{formatDate(item.source_date)}</div>
      </td>
      <td className="px-4 py-3 align-top">
        <CategoryBadge category={item.category} />
      </td>
      <td className="px-4 py-3 align-top">
        <p className="text-[12px] text-gray-600 dark:text-gray-400 leading-relaxed line-clamp-3 max-w-xl">
          {item.content_text}
        </p>
        {item.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {item.tags.map((tag) => (
              <span
                key={tag}
                className="inline-block rounded px-1.5 py-0.5 text-[10px] bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </td>
      <td className="px-4 py-3 align-top text-right">
        <IntelligenceDeleteButton id={item.id} />
      </td>
    </tr>
  );
}

export async function IntelligencePanel() {
  let data: { items: ExternalIntelligence[]; total: number };

  try {
    data = await listIntelligence(50, 0);
  } catch {
    return (
      <div className="admin-card p-8 text-center text-gray-400 text-sm">
        Failed to load intelligence records. Check database connection.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <IntelligenceAddForm />

      <div className="admin-card overflow-hidden">
        <div className="px-4 py-3 bg-gray-50/80 dark:bg-white/[0.02] border-b border-gray-200 dark:border-white/[0.06] flex items-center justify-between">
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
            External Intelligence
          </span>
          <span className="text-[11px] text-gray-400">
            {data.total.toLocaleString()} {data.total === 1 ? "record" : "records"}
          </span>
        </div>

        {data.items.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">
            No intelligence records yet. Add one above to get started.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-white/[0.06]">
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                    Source
                  </th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                    Category
                  </th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                    Content
                  </th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <IntelligenceRow key={item.id} item={item} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
