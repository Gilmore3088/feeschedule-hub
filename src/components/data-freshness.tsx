import { getDataFreshness } from "@/lib/crawler-db";

export async function DataFreshness() {
  const freshness = await getDataFreshness();

  const lastUpdated = freshness.last_crawl_at ?? freshness.last_fee_extracted_at;

  if (!lastUpdated) return null;

  const dateStr = new Date(lastUpdated).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <p className="text-[11px] text-[#A09788]">
      Data as of {dateStr} &middot;{" "}
      {freshness.total_observations.toLocaleString()} observations
    </p>
  );
}
