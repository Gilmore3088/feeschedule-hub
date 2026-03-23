import Link from "next/link";
import { sql } from "@/lib/crawler-db/connection";
import { getDisplayName } from "@/lib/fee-taxonomy";
import { formatAmount, timeAgo } from "@/lib/format";

interface PriceChange {
  institution_name: string;
  fee_category: string;
  previous_amount: number | null;
  new_amount: number | null;
  change_type: string;
  detected_at: string;
  crawl_target_id: number;
}

async function getRecentPriceChanges(): Promise<PriceChange[]> {
  try {
    const rows = await sql`
      SELECT fce.crawl_target_id, ct.institution_name, fce.fee_category,
              fce.previous_amount, fce.new_amount, fce.change_type, fce.detected_at
       FROM fee_change_events fce
       JOIN crawl_targets ct ON fce.crawl_target_id = ct.id
       ORDER BY fce.detected_at DESC
       LIMIT 20
    `;
    return rows as unknown as unknown as PriceChange[];
  } catch {
    return [];
  }
}

function changeIcon(type: string): { icon: string; cls: string } {
  switch (type) {
    case "increased":
      return { icon: "\u2191", cls: "text-red-500" };
    case "decreased":
      return { icon: "\u2193", cls: "text-emerald-500" };
    case "removed":
      return { icon: "\u2715", cls: "text-gray-400" };
    default:
      return { icon: "\u2022", cls: "text-gray-400" };
  }
}

export async function RecentPriceChanges() {
  const changes = await getRecentPriceChanges();

  if (changes.length === 0) {
    return null; // Don't show section if no changes yet
  }

  return (
    <div className="admin-card overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-200 dark:border-white/[0.06]">
        <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
          Recent Price Changes
        </h3>
        <p className="text-[10px] text-gray-400 mt-0.5">
          Fee amounts that changed on re-crawl
        </p>
      </div>
      <div className="divide-y divide-gray-100 dark:divide-white/[0.04] max-h-[300px] overflow-y-auto">
        {changes.map((c, i) => {
          const { icon, cls } = changeIcon(c.change_type);
          return (
            <div key={i} className="px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50/50 dark:hover:bg-white/[0.02] transition-colors">
              <span className={`text-sm font-bold ${cls} w-4 text-center`}>{icon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Link
                    href={`/admin/peers/${c.crawl_target_id}`}
                    className="text-[12px] font-medium text-gray-800 dark:text-gray-200 hover:text-blue-600 dark:hover:text-blue-400 transition-colors truncate"
                  >
                    {c.institution_name}
                  </Link>
                  <span className="text-[10px] text-gray-400 shrink-0">
                    {timeAgo(c.detected_at)}
                  </span>
                </div>
                <div className="text-[11px] text-gray-500 dark:text-gray-400">
                  {getDisplayName(c.fee_category) || c.fee_category}:
                  {c.change_type === "removed" ? (
                    <span className="ml-1">{formatAmount(c.previous_amount)} (removed)</span>
                  ) : (
                    <span className="ml-1">
                      {formatAmount(c.previous_amount)}
                      <span className="mx-1 text-gray-300">{"\u2192"}</span>
                      <span className={c.change_type === "increased" ? "text-red-500" : "text-emerald-500"}>
                        {formatAmount(c.new_amount)}
                      </span>
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
