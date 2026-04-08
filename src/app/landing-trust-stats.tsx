import type { PublicStats, DataFreshness } from "@/lib/crawler-db/core";

interface LandingTrustStatsProps {
  stats: PublicStats;
  freshness: DataFreshness;
}

export function LandingTrustStats({ stats }: LandingTrustStatsProps) {
  return (
    <section className="border-t border-[#E8DFD1] bg-[#F5EFE6]/60">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <dl className="grid grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
          <div>
            <dd className="text-[28px] font-bold text-[#1A1815] tabular-nums">
              {stats.total_institutions.toLocaleString()}+
            </dd>
            <dt className="text-[12px] font-normal text-[#7A7062] uppercase tracking-wide mt-1">
              Institutions &amp; Growing
            </dt>
          </div>

          <div>
            <dd className="text-[28px] font-bold text-[#1A1815] tabular-nums">
              49
            </dd>
            <dt className="text-[12px] font-normal text-[#7A7062] uppercase tracking-wide mt-1">
              Fee Categories
            </dt>
          </div>

          <div>
            <dd className="text-[28px] font-bold text-[#1A1815] tabular-nums">
              50
            </dd>
            <dt className="text-[12px] font-normal text-[#7A7062] uppercase tracking-wide mt-1">
              States Covered
            </dt>
          </div>

          <div>
            <dd className="text-[28px] font-bold text-[#1A1815] tabular-nums">
              5
            </dd>
            <dt className="text-[12px] font-normal text-[#7A7062] uppercase tracking-wide mt-1">
              Federal Data Sources
            </dt>
          </div>
        </dl>
      </div>
    </section>
  );
}
