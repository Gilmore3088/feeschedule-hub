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
import { SITE_URL } from "@/lib/constants";
import { getCurrentUser } from "@/lib/auth";
import { canAccessPremium } from "@/lib/access";
import { UpgradeGate } from "@/components/upgrade-gate";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateStaticParams() {
  try {
    const ids = getInstitutionIdsWithFees();
    return ids.map((id) => ({ id: String(id) }));
  } catch {
    return [];
  }
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
    return <span className="text-[11px] text-[#A09788]">at median</span>;
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

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#E8DFD1]/80 bg-white/70 backdrop-blur-sm px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#A09788]">
        {label}
      </p>
      <p
        className="mt-1 text-[15px] font-medium tabular-nums text-[#1A1815]"
      >
        {value}
      </p>
    </div>
  );
}

export default async function InstitutionProfilePage({ params }: PageProps) {
  const { id } = await params;
  const instId = parseInt(id, 10);
  if (isNaN(instId)) notFound();

  const user = await getCurrentUser();
  const isPro = canAccessPremium(user);

  const inst = getInstitutionById(instId);
  if (!inst) notFound();

  const fees = getFeesByInstitution(instId).filter(
    (f) => f.review_status === "approved"
  );
  const financials = getFinancialsByInstitution(instId);
  const nationalIndex = getNationalIndex();

  const nationalMedians = new Map(
    nationalIndex.map((e) => [e.fee_category, e.median_amount])
  );

  const categorized = new Map<string, typeof fees>();
  for (const fee of fees) {
    if (!fee.amount || fee.amount <= 0) continue;
    const key = fee.fee_name;
    if (!categorized.has(key)) categorized.set(key, []);
    categorized.get(key)!.push(fee);
  }

  const stateName = inst.state_code ? STATE_NAMES[inst.state_code] : null;
  const charterLabel = inst.charter_type === "bank" ? "Bank" : "Credit Union";
  const tierLabel = inst.asset_size_tier ? TIER_LABELS[inst.asset_size_tier] : null;
  const latestFinancial = financials[0] ?? null;

  return (
    <div className="mx-auto max-w-7xl px-6 py-14">
      <BreadcrumbJsonLd
        items={[
          { name: "Home", href: "/" },
          { name: "Fee Index", href: "/fees" },
          { name: inst.institution_name, href: `/institution/${instId}` },
        ]}
      />

      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-[12px] text-[#A09788] mb-6">
        <Link href="/" className="hover:text-[#1A1815] transition-colors">Home</Link>
        <span className="text-[#D4C9BA]">/</span>
        <Link href="/fees" className="hover:text-[#1A1815] transition-colors">Fee Index</Link>
        <span className="text-[#D4C9BA]">/</span>
        <span className="text-[#5A5347] truncate max-w-[200px]">{inst.institution_name}</span>
      </nav>

      <div className="flex items-center gap-2 mb-3">
        <span className="h-px w-8 bg-[#C44B2E]/40" />
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#C44B2E]/60">
          Institution Profile
        </span>
      </div>

      <h1
        className="text-[1.75rem] sm:text-[2.25rem] leading-[1.12] tracking-[-0.02em] text-[#1A1815]"
        style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
      >
        {inst.institution_name}
      </h1>
      <p className="mt-2 text-[14px] text-[#7A7062]">
        {charterLabel}
        {inst.city && <> in {inst.city}</>}
        {stateName && <>, {stateName}</>}
        {inst.fed_district && (
          <>
            {" "}&middot;{" "}
            <Link
              href={`/research/district/${inst.fed_district}`}
              className="text-[#C44B2E]/70 hover:text-[#C44B2E] transition-colors"
            >
              District {inst.fed_district} ({DISTRICT_NAMES[inst.fed_district]})
            </Link>
          </>
        )}
      </p>

      {/* Source links */}
      {(inst.website_url || inst.fee_schedule_url) && (
        <div className="mt-3 flex flex-wrap gap-3 text-[12px]">
          {inst.website_url && (
            <a
              href={inst.website_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[#7A7062] hover:text-[#C44B2E] transition-colors"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M2 12h20M12 2a15 15 0 014 10 15 15 0 01-4 10 15 15 0 01-4-10 15 15 0 014-10z" />
              </svg>
              Website
            </a>
          )}
          {inst.fee_schedule_url && (
            <a
              href={inst.fee_schedule_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[#7A7062] hover:text-[#C44B2E] transition-colors"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              Fee Schedule Source
            </a>
          )}
        </div>
      )}

      {/* Info cards */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <InfoCard label="Charter Type" value={charterLabel} />
        <InfoCard label="Asset Tier" value={tierLabel ?? "Unknown"} />
        <InfoCard label="Total Assets" value={inst.asset_size ? formatAssets(inst.asset_size) : "N/A"} />
        <InfoCard label="Published Fees" value={String(fees.length)} />
      </div>

      {/* Financial snapshot */}
      {!isPro && latestFinancial && (
        <div className="mt-8">
          <UpgradeGate message="Financial snapshot from Call Reports" />
        </div>
      )}
      {isPro && latestFinancial && (
        <section className="mt-10">
          <h2
            className="text-[16px] font-medium text-[#1A1815]"
            style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
          >
            Financial Snapshot
          </h2>
          <p className="mt-1 text-[11px] text-[#A09788]">
            From {latestFinancial.source.toUpperCase()} call report — {latestFinancial.report_date}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {latestFinancial.total_deposits !== null && (
              <InfoCard label="Total Deposits" value={formatAssets(latestFinancial.total_deposits)} />
            )}
            {latestFinancial.service_charge_income !== null && (
              <InfoCard label="Service Charge Income" value={formatAssets(latestFinancial.service_charge_income)} />
            )}
            {latestFinancial.branch_count !== null && (
              <InfoCard label="Branches" value={latestFinancial.branch_count.toLocaleString()} />
            )}
            {latestFinancial.roa !== null && (
              <InfoCard label="Return on Assets" value={`${latestFinancial.roa.toFixed(2)}%`} />
            )}
          </div>
        </section>
      )}

      {/* Fee schedule */}
      <section className="mt-10">
        <h2
          className="text-[16px] font-medium text-[#1A1815]"
          style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
        >
          Fee Schedule
        </h2>
        <p className="mt-1 text-[13px] text-[#7A7062]">
          {fees.length} fees extracted from published fee schedule.
          Compared against national medians where category data is available.
        </p>

        <div className="mt-3 overflow-hidden rounded-xl border border-[#E8DFD1]/80 bg-white/70 backdrop-blur-sm">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[#E8DFD1]/60 bg-[#FAF7F2]/60">
                <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[#A09788]">
                  Fee
                </th>
                <th className="px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-[0.1em] text-[#A09788]">
                  Amount
                </th>
                <th className="hidden px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[#A09788] sm:table-cell">
                  Frequency
                </th>
                <th className="hidden px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-[0.1em] text-[#A09788] md:table-cell">
                  National Median
                </th>
                <th className="hidden px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-[0.1em] text-[#A09788] md:table-cell">
                  vs. Median
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8DFD1]/40">
              {fees.map((fee) => {
                const nationalMedian = nationalMedians.get(fee.fee_name) ?? null;
                const delta =
                  nationalMedian && fee.amount
                    ? ((fee.amount - nationalMedian) / nationalMedian) * 100
                    : null;

                return (
                  <tr
                    key={fee.id}
                    className="hover:bg-[#FAF7F2]/60 transition-colors"
                  >
                    <td className="px-4 py-2.5">
                      <span className="font-medium text-[#1A1815]">
                        {fee.fee_name}
                      </span>
                      {fee.conditions && (
                        <span className="mt-0.5 block text-[11px] text-[#A09788] max-w-xs truncate">
                          {fee.conditions}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium text-[#1A1815]">
                      {formatAmount(fee.amount)}
                    </td>
                    <td className="hidden px-4 py-2.5 text-[#7A7062] sm:table-cell">
                      {fee.frequency ?? "-"}
                    </td>
                    <td className="hidden px-4 py-2.5 text-right tabular-nums text-[#7A7062] md:table-cell">
                      {formatAmount(nationalMedian)}
                    </td>
                    <td className="hidden px-4 py-2.5 text-right md:table-cell">
                      {delta !== null ? (
                        <DeltaPill delta={delta} />
                      ) : (
                        <span className="text-[11px] text-[#A09788]">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Links */}
      <div className="mt-8 flex flex-wrap gap-2">
        {inst.state_code && (
          <Link
            href={`/research/state/${inst.state_code}`}
            className="rounded-full border border-[#E8DFD1] px-4 py-1.5 text-[12px] font-medium text-[#5A5347] hover:border-[#C44B2E]/30 hover:text-[#C44B2E] transition-colors no-underline"
          >
            {stateName} State Report
          </Link>
        )}
        {inst.fed_district && (
          <Link
            href={`/research/district/${inst.fed_district}`}
            className="rounded-full border border-[#E8DFD1] px-4 py-1.5 text-[12px] font-medium text-[#5A5347] hover:border-[#C44B2E]/30 hover:text-[#C44B2E] transition-colors no-underline"
          >
            District {inst.fed_district} Report
          </Link>
        )}
        <Link
          href="/fees"
          className="rounded-full border border-[#E8DFD1] px-4 py-1.5 text-[12px] font-medium text-[#5A5347] hover:border-[#C44B2E]/30 hover:text-[#C44B2E] transition-colors no-underline"
        >
          Fee Index
        </Link>
      </div>

      {/* Methodology */}
      <section className="mt-12 rounded-xl border border-[#E8DFD1] bg-[#FAF7F2]/50 px-6 py-5">
        <h2 className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#A09788]">
          Data Sources
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-[#7A7062]">
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
            url: `${SITE_URL}/institution/${instId}`,
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
