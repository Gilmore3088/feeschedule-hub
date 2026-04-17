import Link from "next/link";
import type { PublicStats, DataFreshness } from "@/lib/crawler-db/core";

interface LandingTrustStatsProps {
  stats: PublicStats;
  freshness: DataFreshness;
}

function formatRelativeRefresh(iso: string | null): string {
  if (!iso) return "recently";
  const then = new Date(iso).getTime();
  const now = Date.now();
  const hours = Math.max(0, Math.floor((now - then) / 3_600_000));
  if (hours < 1) return "in the last hour";
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks} week${weeks === 1 ? "" : "s"} ago`;
}

export function LandingTrustStats({ stats, freshness }: LandingTrustStatsProps) {
  const refreshedRelative = formatRelativeRefresh(freshness.last_crawl_at);
  // Palette: text-slate-* / border-slate-* / text-amber-* are remapped by
  // the .consumer-brand wrapper in globals.css to the warm consumer palette.
  // Don't reach for raw hex here — keep the design system the source of truth.
  return (
    <section className="border-t border-slate-200 bg-slate-50/60">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <dl className="grid grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
          <div>
            <dd className="text-[28px] font-bold text-slate-900 tabular-nums">
              {stats.total_institutions.toLocaleString()}
            </dd>
            <dt className="text-[12px] font-normal text-slate-500 uppercase tracking-wide mt-1">
              Institutions tracked
            </dt>
          </div>

          <div>
            <dd className="text-[28px] font-bold text-slate-900 tabular-nums">
              49
            </dd>
            <dt className="text-[12px] font-normal text-slate-500 uppercase tracking-wide mt-1">
              Fee categories
            </dt>
          </div>

          <div>
            <dd className="text-[28px] font-bold text-slate-900 tabular-nums">
              50
            </dd>
            <dt className="text-[12px] font-normal text-slate-500 uppercase tracking-wide mt-1">
              U.S. states covered
            </dt>
          </div>

          <div>
            <dd className="text-[28px] font-bold text-slate-900 tabular-nums">
              {stats.total_observations.toLocaleString()}
            </dd>
            <dt className="text-[12px] font-normal text-slate-500 uppercase tracking-wide mt-1">
              Verified fee observations
            </dt>
          </div>
        </dl>

        {/* Provenance row — concrete sources + freshness + methodology link.
            Bankers buy on provenance, not on testimonials. */}
        <div className="mt-6 pt-6 border-t border-slate-200 flex flex-col lg:flex-row lg:items-baseline gap-3 lg:gap-6 text-[12px] text-slate-500">
          <span className="font-semibold uppercase tracking-wide text-[10px] text-slate-400 shrink-0">
            Sources
          </span>
          <span className="leading-relaxed">
            FDIC Call Reports · NCUA 5300 · Federal Reserve FRED · Beige Book ·
            Published deposit account agreements
          </span>
          <span className="lg:ml-auto shrink-0 text-slate-600">
            Last refresh: <span className="text-slate-900 font-medium">{refreshedRelative}</span>
            {" · "}
            <Link
              href="/methodology"
              className="text-amber-400 hover:underline underline-offset-2"
            >
              Methodology
            </Link>
          </span>
        </div>
      </div>
    </section>
  );
}
