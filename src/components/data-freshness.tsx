import { getDataFreshness } from "@/lib/crawler-db";
import { timeAgo } from "@/lib/format";

export function DataFreshness() {
  const freshness = getDataFreshness();

  const lastUpdated = freshness.last_crawl_at ?? freshness.last_fee_extracted_at;

  if (!lastUpdated) return null;

  return (
    <p className="text-[11px] text-slate-400">
      Data updated {timeAgo(lastUpdated)} &middot;{" "}
      {freshness.total_observations.toLocaleString()} observations
    </p>
  );
}
