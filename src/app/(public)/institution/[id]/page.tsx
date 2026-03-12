import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getInstitutionById,
  getFeesByInstitution,
  getFinancialsByInstitution,
  getNationalIndex,
  getInstitutionIdsWithFees,
} from "@/lib/crawler-db";
import {
  getDisplayName,
  getFeeFamily,
  getFeeTier,
  FEE_FAMILIES,
} from "@/lib/fee-taxonomy";
import { DISTRICT_NAMES, TIER_LABELS } from "@/lib/fed-districts";
import { formatAmount, formatAssets } from "@/lib/format";
import { STATE_NAMES } from "@/lib/us-states";
import { BreadcrumbJsonLd } from "@/components/breadcrumb-jsonld";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateStaticParams() {
  const ids = getInstitutionIdsWithFees();
  return ids.map((id) => ({ id: String(id) }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const inst = getInstitutionById(parseInt(id, 10));
  if (!inst) return { title: "Institution Not Found" };

  const stateName = inst.state_code ? STATE_NAMES[inst.state_code] : null;
  const charterLabel = inst.charter_type === "bank" ? "Bank" : "Credit Union";

  return {
    title: `${inst.institution_name} Fees - ${charterLabel} Fee Schedule`,
    description: `Fee schedule for ${inst.institution_name}${stateName ? ` in ${stateName}` : ""}. ${inst.fee_count} fees extracted and benchmarked against national medians.`,
    keywords: [
      inst.institution_name,
      `${inst.institution_name} fees`,
      `${inst.institution_name} overdraft fee`,
      stateName ? `${stateName} ${charterLabel.toLowerCase()} fees` : "",
    ].filter(Boolean),
  };
}

function DeltaPill({ delta }: { delta: number }) {
  if (Math.abs(delta) < 0.5) {
    return <span className="text-[11px] text-slate-400">at median</span>;
  }
  const isBelow = delta < 0;
  return (
    <span
      className={`inline-block rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
        isBelow
          ? "bg-emerald-50 text-emerald-600"
          : "bg-red-50 text-red-600"
      }`}
    >
      {isBelow ? "" : "+"}{delta.toFixed(0)}%
    </span>
  );
}

export default async function InstitutionProfilePage({ params }: PageProps) {
  const { id } = await params;
  const instId = parseInt(id, 10);
  if (isNaN(instId)) notFound();

  const inst = getInstitutionById(instId);
  if (!inst || inst.fee_count === 0) notFound();

  const fees = getFeesByInstitution(instId).filter(
    (f) => f.review_status !== "rejected"
  );
  const financials = getFinancialsByInstitution(instId);
  const nationalIndex = getNationalIndex();

  // Build national median lookup
  const nationalMedians = new Map(
    nationalIndex.map((e) => [e.fee_category, e.median_amount])
  );

  // Group fees by family
  const categorized = new Map<string, typeof fees>();
  for (const fee of fees) {
    if (!fee.amount || fee.amount <= 0) continue;
    // We need fee_category — it's not in ExtractedFee, but fee_name maps to display name
    // Use fee_name as the grouping key since that's what we have
    const key = fee.fee_name;
    if (!categorized.has(key)) categorized.set(key, []);
    categorized.get(key)!.push(fee);
  }

  const stateName = inst.state_code ? STATE_NAMES[inst.state_code] : null;
  const charterLabel = inst.charter_type === "bank" ? "Bank" : "Credit Union";
  const tierLabel = inst.asset_size_tier ? TIER_LABELS[inst.asset_size_tier] : null;
  const latestFinancial = financials[0] ?? null;

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <BreadcrumbJsonLd
        items={[
          { name: "Home", href: "/" },
          { name: "Fee Index", href: "/fees" },
          { name: inst.institution_name, href: `/institution/${instId}` },
        ]}
      />

      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        Institution Profile
      </p>
      <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
        {inst.institution_name}
      </h1>
      <p className="mt-2 text-[14px] text-slate-600">
        {charterLabel}
        {inst.city && <> in {inst.city}</>}
        {stateName && <>, {stateName}</>}
        {inst.fed_district && (
          <>
            {" "}&middot;{" "}
            <Link
              href={`/research/district/${inst.fed_district}`}
              className="text-blue-600 hover:underline"
            >
              District {inst.fed_district} ({DISTRICT_NAMES[inst.fed_district]})
            </Link>
          </>
        )}
      </p>

      {/* Info cards */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-slate-200 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Charter Type
          </p>
          <p className="mt-1 text-sm font-bold text-slate-900">{charterLabel}</p>
        </div>
        <div className="rounded-lg border border-slate-200 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Asset Tier
          </p>
          <p className="mt-1 text-sm font-bold text-slate-900">
            {tierLabel ?? "Unknown"}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Total Assets
          </p>
          <p className="mt-1 text-sm font-bold tabular-nums text-slate-900">
            {inst.asset_size ? formatAssets(inst.asset_size) : "N/A"}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Fees Extracted
          </p>
          <p className="mt-1 text-sm font-bold tabular-nums text-slate-900">
            {fees.length}
          </p>
        </div>
      </div>

      {/* Call report summary */}
      {latestFinancial && (
        <section className="mt-8">
          <h2 className="text-sm font-bold text-slate-800">
            Financial Snapshot
          </h2>
          <p className="mt-1 text-[11px] text-slate-400">
            From {latestFinancial.source.toUpperCase()} call report — {latestFinancial.report_date}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {latestFinancial.total_deposits !== null && (
              <div className="rounded-lg border border-slate-200 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Total Deposits
                </p>
                <p className="mt-1 text-sm font-bold tabular-nums text-slate-900">
                  {formatAssets(latestFinancial.total_deposits)}
                </p>
              </div>
            )}
            {latestFinancial.service_charge_income !== null && (
              <div className="rounded-lg border border-slate-200 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Service Charge Income
                </p>
                <p className="mt-1 text-sm font-bold tabular-nums text-slate-900">
                  {formatAssets(latestFinancial.service_charge_income)}
                </p>
              </div>
            )}
            {latestFinancial.branch_count !== null && (
              <div className="rounded-lg border border-slate-200 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Branches
                </p>
                <p className="mt-1 text-sm font-bold tabular-nums text-slate-900">
                  {latestFinancial.branch_count.toLocaleString()}
                </p>
              </div>
            )}
            {latestFinancial.roa !== null && (
              <div className="rounded-lg border border-slate-200 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Return on Assets
                </p>
                <p className="mt-1 text-sm font-bold tabular-nums text-slate-900">
                  {latestFinancial.roa.toFixed(2)}%
                </p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Fee schedule */}
      <section className="mt-8">
        <h2 className="text-sm font-bold text-slate-800">
          Fee Schedule
        </h2>
        <p className="mt-1 text-[13px] text-slate-500">
          {fees.length} fees extracted from published fee schedule.
          Compared against national medians where category data is available.
        </p>

        <div className="mt-3 overflow-hidden rounded-lg border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/80">
                <th className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Fee
                </th>
                <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Amount
                </th>
                <th className="hidden px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 sm:table-cell">
                  Frequency
                </th>
                <th className="hidden px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400 md:table-cell">
                  National Median
                </th>
                <th className="hidden px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400 md:table-cell">
                  vs. Median
                </th>
                <th className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {fees.map((fee) => {
                const nationalMedian = nationalMedians.get(fee.fee_name) ?? null;
                const delta =
                  nationalMedian && fee.amount
                    ? ((fee.amount - nationalMedian) / nationalMedian) * 100
                    : null;

                return (
                  <tr
                    key={fee.id}
                    className="hover:bg-slate-50/50 transition-colors"
                  >
                    <td className="px-4 py-2.5">
                      <span className="font-medium text-slate-900">
                        {fee.fee_name}
                      </span>
                      {fee.conditions && (
                        <span className="mt-0.5 block text-[11px] text-slate-400 max-w-xs truncate">
                          {fee.conditions}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium text-slate-900">
                      {formatAmount(fee.amount)}
                    </td>
                    <td className="hidden px-4 py-2.5 text-slate-500 sm:table-cell">
                      {fee.frequency ?? "-"}
                    </td>
                    <td className="hidden px-4 py-2.5 text-right tabular-nums text-slate-500 md:table-cell">
                      {formatAmount(nationalMedian)}
                    </td>
                    <td className="hidden px-4 py-2.5 text-right md:table-cell">
                      {delta !== null ? (
                        <DeltaPill delta={delta} />
                      ) : (
                        <span className="text-[11px] text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`inline-block rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                          fee.review_status === "approved"
                            ? "bg-emerald-50 text-emerald-600"
                            : fee.review_status === "staged"
                            ? "bg-blue-50 text-blue-600"
                            : "bg-amber-50 text-amber-600"
                        }`}
                      >
                        {fee.review_status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Links */}
      <div className="mt-8 flex flex-wrap gap-3 text-sm">
        {inst.state_code && (
          <Link
            href={`/research/state/${inst.state_code}`}
            className="rounded-md border border-slate-200 px-3 py-1.5 text-slate-700 transition-colors hover:border-blue-200 hover:bg-blue-50/30 hover:text-blue-600"
          >
            {stateName} State Report
          </Link>
        )}
        {inst.fed_district && (
          <Link
            href={`/research/district/${inst.fed_district}`}
            className="rounded-md border border-slate-200 px-3 py-1.5 text-slate-700 transition-colors hover:border-blue-200 hover:bg-blue-50/30 hover:text-blue-600"
          >
            District {inst.fed_district} Report
          </Link>
        )}
        <Link
          href="/fees"
          className="rounded-md border border-slate-200 px-3 py-1.5 text-slate-700 transition-colors hover:border-blue-200 hover:bg-blue-50/30 hover:text-blue-600"
        >
          Fee Index
        </Link>
      </div>

      {/* Methodology */}
      <section className="mt-10 rounded-lg border border-slate-200 bg-slate-50/50 px-5 py-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Data Sources
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-slate-600">
          Fees extracted from the institution&apos;s published fee schedule using
          automated extraction with manual review. Financial data from{" "}
          {inst.charter_type === "bank" ? "FDIC Call Reports" : "NCUA 5300 Reports"}.
          National medians computed across all tracked institutions in the same
          fee category.
        </p>
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FinancialProduct",
            name: inst.institution_name,
            description: `Fee schedule for ${inst.institution_name}`,
            url: `https://bankfeeindex.com/institution/${instId}`,
            provider: {
              "@type": "FinancialService",
              name: inst.institution_name,
              ...(stateName && {
                address: {
                  "@type": "PostalAddress",
                  addressRegion: inst.state_code,
                },
              }),
            },
          }).replace(/</g, "\\u003c"),
        }}
      />
    </div>
  );
}
