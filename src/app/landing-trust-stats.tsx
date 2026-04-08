import { timeAgo } from "@/lib/format";
import type { PublicStats, DataFreshness } from "@/lib/crawler-db/core";

interface LandingTrustStatsProps {
  stats: PublicStats;
  freshness: DataFreshness;
}

export function LandingTrustStats({ stats, freshness }: LandingTrustStatsProps) {
  const freshnessLabel = freshness.last_crawl_at
    ? `Updated ${timeAgo(freshness.last_crawl_at)}`
    : "Recently";

  return (
    <section className="border-t border-[#E8DFD1] bg-[#F5EFE6]/60">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <dl className="grid grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
          <div>
            <dd className="text-[28px] font-bold text-[#1A1815] tabular-nums">
              {stats.total_institutions.toLocaleString()}+
            </dd>
            <dt className="text-[12px] font-normal text-[#7A7062] uppercase tracking-wide mt-1">
              Banks &amp; Credit Unions
            </dt>
          </div>

          <div>
            <dd className="text-[28px] font-bold text-[#1A1815] tabular-nums">
              {stats.total_observations.toLocaleString()}+
            </dd>
            <dt className="text-[12px] font-normal text-[#7A7062] uppercase tracking-wide mt-1">
              Fee Observations
            </dt>
          </div>

          <div>
            <dd className="text-[20px] font-bold text-[#1A1815]">
              {freshnessLabel}
            </dd>
            <dt className="text-[12px] font-normal text-[#7A7062] uppercase tracking-wide mt-1">
              Data Freshness
            </dt>
          </div>

          <div>
            <dd className="text-[28px] font-bold text-[#1A1815] tabular-nums">
              FDIC &amp; NCUA
            </dd>
            <dt className="text-[12px] font-normal text-[#7A7062] uppercase tracking-wide mt-1">
              Verified Sources
            </dt>
          </div>
        </dl>
      </div>
    </section>
  );
}
