import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getInstitutionProfile,
  getInstitutionScorecard,
} from "@/lib/crawler-db/institutions";
import { getDisplayName, getFeeTier } from "@/lib/fee-taxonomy";
import { STATE_NAMES, DISTRICT_NAMES } from "@/lib/fed-districts";
import { formatAmount, timeAgo } from "@/lib/format";
import { BreadcrumbJsonLd } from "@/components/breadcrumb-jsonld";

export async function generateStaticParams() {
  return [];
}
export const dynamicParams = true;
export const revalidate = 86400;

function isSafeUrl(url: string | null): url is string {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const numId = Number(id);
  if (!Number.isInteger(numId) || numId <= 0) {
    return { title: "Institution Not Found" };
  }

  const profile = getInstitutionProfile(numId);
  if (!profile) return { title: "Institution Not Found" };

  const state =
    STATE_NAMES[profile.state_code ?? ""] ?? profile.state_code ?? "";
  return {
    title: `${profile.institution_name} Fees: Compare to Local Banks | Bank Fee Index`,
    description: `See ${profile.institution_name} banking fees compared to ${state} competitors. Overdraft, maintenance, ATM, and more.`,
    alternates: { canonical: `/institutions/${id}` },
    ...(profile.fees.length === 0 ? { robots: { index: false } } : {}),
  };
}

export default async function InstitutionProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const numId = Number(id);
  if (!Number.isInteger(numId) || numId <= 0) notFound();

  const profile = getInstitutionProfile(numId);
  if (!profile) notFound();

  const stateName = STATE_NAMES[profile.state_code ?? ""] ?? profile.state_code;
  const district = profile.fed_district;

  const scorecard =
    profile.fees.length > 0
      ? getInstitutionScorecard(profile.id, profile.fees)
      : [];

  const belowCount = scorecard.filter(
    (e) => e.national_delta_pct != null && e.national_delta_pct < 0
  ).length;

  // Sort: spotlight first, then core, then rest, then alphabetical
  const sortedScorecard = [...scorecard].sort((a, b) => {
    const tierOrder = { spotlight: 0, core: 1, extended: 2, comprehensive: 3 };
    const aTier = tierOrder[getFeeTier(a.fee_category)] ?? 4;
    const bTier = tierOrder[getFeeTier(b.fee_category)] ?? 4;
    if (aTier !== bTier) return aTier - bTier;
    return a.fee_category.localeCompare(b.fee_category);
  });

  const isStale =
    profile.last_crawl_at &&
    Date.now() - new Date(profile.last_crawl_at).getTime() >
      365 * 24 * 60 * 60 * 1000;

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <BreadcrumbJsonLd
        items={[
          { name: "Home", href: "/" },
          { name: "Find Your Bank", href: "/institutions" },
          {
            name: profile.institution_name,
            href: `/institutions/${profile.id}`,
          },
        ]}
      />

      {/* Breadcrumb */}
      <nav
        aria-label="Breadcrumb"
        className="mb-6 text-[13px] text-slate-400"
      >
        <Link
          href="/institutions"
          className="hover:text-slate-600 transition-colors"
        >
          Find Your Bank
        </Link>
        <span className="mx-2" aria-hidden="true">
          /
        </span>
        <span className="text-slate-600" aria-current="page">
          {profile.institution_name}
        </span>
      </nav>

      {/* Header */}
      <div className="mb-10">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <span className="inline-block rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-500">
            {profile.charter_type === "bank" ? "Bank" : "Credit Union"}
          </span>
          {profile.asset_size_tier && (
            <span className="inline-block rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-500">
              {profile.asset_size_tier}
            </span>
          )}
          {district && (
            <span className="inline-block rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-500">
              District {district}
              {DISTRICT_NAMES[district]
                ? ` - ${DISTRICT_NAMES[district]}`
                : ""}
            </span>
          )}
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          {profile.institution_name}
        </h1>
        <p className="mt-1 text-[15px] text-slate-500">
          {[profile.city, stateName].filter(Boolean).join(", ")}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-4 text-[12px] text-slate-400">
          {profile.last_crawl_at && (
            <span>Last updated {timeAgo(profile.last_crawl_at)}</span>
          )}
          {isSafeUrl(profile.fee_schedule_url) && (
            <a
              href={profile.fee_schedule_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 hover:text-blue-600 hover:underline transition-colors"
            >
              View source fee schedule
            </a>
          )}
        </div>
        {isStale && (
          <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-[12px] text-amber-700">
            This data was last updated {timeAgo(profile.last_crawl_at!)}. Fees
            may have changed since then.
          </p>
        )}
      </div>

      {profile.fees.length === 0 ? (
        /* Empty state */
        <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center">
          <svg
            className="mx-auto h-10 w-10 text-slate-300"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 7.5h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z"
            />
          </svg>
          <p className="mt-4 text-sm text-slate-500">
            Fee data is not yet available for{" "}
            {profile.institution_name}.
          </p>
          <p className="mt-1 text-[13px] text-slate-400">
            We&apos;re continuously expanding our coverage. In the meantime:
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            {stateName && (
              <Link
                href={`/fees/monthly_maintenance/by-state/${(profile.state_code ?? "").toLowerCase()}`}
                className="rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:border-blue-300 hover:text-blue-600 transition-colors"
              >
                Banking fees in {stateName}
              </Link>
            )}
            <Link
              href="/check"
              className="rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:border-blue-300 hover:text-blue-600 transition-colors"
            >
              Compare fees by state
            </Link>
            <Link
              href="/fees"
              className="rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:border-blue-300 hover:text-blue-600 transition-colors"
            >
              National Fee Index
            </Link>
          </div>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-white p-5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Fees Tracked
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
                {profile.fees.length}
              </p>
              <p className="mt-1 text-[11px] text-slate-400">
                of 49 fee categories
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                vs National Median
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
                {belowCount} of {scorecard.length}
              </p>
              <p className="mt-1 text-[11px] text-slate-400">
                fees below the national median for{" "}
                {profile.charter_type === "bank" ? "banks" : "credit unions"}
              </p>
            </div>
          </div>

          {/* Fee comparison table */}
          <section className="mb-10">
            <h2 className="mb-4 text-lg font-bold tracking-tight text-slate-900">
              Fee Comparison
            </h2>
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full text-left">
                <caption className="sr-only">
                  {profile.institution_name} fees compared to national medians
                </caption>
                <thead>
                  <tr className="bg-slate-50/80">
                    <th
                      scope="col"
                      className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400"
                    >
                      Category
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400"
                    >
                      Your Fee
                    </th>
                    <th
                      scope="col"
                      className="hidden px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400 sm:table-cell"
                    >
                      National Median
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400"
                    >
                      vs National
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sortedScorecard.map((entry) => (
                    <tr
                      key={entry.fee_category}
                      className="hover:bg-slate-50/50 transition-colors"
                    >
                      <td className="px-4 py-2.5">
                        <Link
                          href={`/fees/${entry.fee_category}`}
                          className="text-sm font-medium text-slate-900 hover:text-blue-600 transition-colors"
                        >
                          {getDisplayName(entry.fee_category)}
                        </Link>
                        {entry.conditions && (
                          <p className="mt-0.5 text-[11px] text-slate-400 line-clamp-1">
                            {entry.conditions}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right text-sm font-semibold tabular-nums text-slate-900">
                        {formatAmount(entry.institution_amount)}
                      </td>
                      <td className="hidden px-4 py-2.5 text-right text-sm tabular-nums text-slate-500 sm:table-cell">
                        {formatAmount(entry.national_median)}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {entry.national_delta_pct != null ? (
                          <span
                            className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${
                              entry.national_delta_pct < 0
                                ? "bg-emerald-50 text-emerald-600"
                                : entry.national_delta_pct > 0
                                  ? "bg-red-50 text-red-600"
                                  : "bg-slate-100 text-slate-500"
                            }`}
                            title={`${Math.abs(entry.national_delta_pct).toFixed(1)}% ${entry.national_delta_pct < 0 ? "below" : entry.national_delta_pct > 0 ? "above" : "at"} national median`}
                          >
                            {entry.national_delta_pct > 0 ? "+" : ""}
                            {entry.national_delta_pct.toFixed(1)}%{" "}
                            {entry.national_delta_pct < 0
                              ? "below"
                              : entry.national_delta_pct > 0
                                ? "above"
                                : "at avg"}
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-300">
                            --
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[11px] text-slate-400">
              Fee amounts reflect disclosed fee schedules and may not include
              promotional rates or waived fees.
            </p>
          </section>

          {/* Cross-links */}
          <div className="flex flex-wrap gap-3">
            {stateName && district && (
              <Link
                href={`/districts/${district}`}
                className="rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:border-blue-300 hover:text-blue-600 transition-colors"
              >
                District {district} - {DISTRICT_NAMES[district]}
              </Link>
            )}
            <Link
              href="/fees"
              className="rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:border-blue-300 hover:text-blue-600 transition-colors"
            >
              National Fee Index
            </Link>
            <a
              href={`mailto:data@bankfeeindex.com?subject=Data correction: ${profile.institution_name}&body=Institution: ${profile.institution_name} (ID: ${profile.id})%0ACity/State: ${profile.city ?? ""}, ${profile.state_code ?? ""}%0A%0AFee category:%0ACurrent amount shown:%0ACorrect amount:%0ASource URL:`}
              className="rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:border-blue-300 hover:text-blue-600 transition-colors"
            >
              Report an error
            </a>
          </div>
        </>
      )}
    </div>
  );
}
