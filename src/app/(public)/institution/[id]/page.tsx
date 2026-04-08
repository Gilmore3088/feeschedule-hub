export const dynamic = "force-dynamic";
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
import { getFeesForCategory } from "@/lib/crawler-db/market";
import { InstitutionHistogram } from "./fee-distribution";
import { getMarketConcentrationForInstitution } from "@/lib/crawler-db/financial";
import {
  getInstitutionRevenueTrend,
  getInstitutionPeerRanking,
} from "@/lib/crawler-db/call-reports";
import {
  getDisplayName,
  getFeeFamily,
  getFeeTier,
  FEE_FAMILIES,
} from "@/lib/fee-taxonomy";
import { DISTRICT_NAMES, FDIC_TIER_LABELS } from "@/lib/fed-districts";
import { formatAmount, formatAssets } from "@/lib/format";
import { getExplainer } from "@/lib/fee-explainers";
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
    const ids = await getInstitutionIdsWithFees();
    return ids.map((id) => ({ id: String(id) }));
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const inst = await getInstitutionById(parseInt(id, 10));
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

import type { IndexEntry } from "@/lib/crawler-db/fee-index";

interface ScorecardComparison {
  name: string;
  amount: number;
  median: number;
  p25: number;
  p75: number;
  min: number;
  max: number;
  delta: number;
  indexEntry: IndexEntry;
}

function computeScorecard(
  fees: { id: number; fee_name: string; amount: number | null }[],
  indexEntries: IndexEntry[]
): ScorecardComparison[] {
  const indexMap = new Map(indexEntries.map((e) => [e.fee_category, e]));
  return fees
    .filter((f) => f.amount && f.amount > 0)
    .map((f) => {
      const entry = indexMap.get(f.fee_name);
      if (!entry || entry.median_amount === null) return null;
      return {
        name: f.fee_name,
        amount: f.amount!,
        median: entry.median_amount,
        p25: entry.p25_amount ?? entry.median_amount,
        p75: entry.p75_amount ?? entry.median_amount,
        min: entry.min_amount ?? 0,
        max: entry.max_amount ?? entry.median_amount * 2,
        delta: ((f.amount! - entry.median_amount) / entry.median_amount) * 100,
        indexEntry: entry,
      };
    })
    .filter(Boolean) as ScorecardComparison[];
}

function estimatePercentile(
  amount: number,
  entry: {
    p25_amount: number | null;
    p75_amount: number | null;
    min_amount: number | null;
    max_amount: number | null;
    median_amount: number | null;
  }
): number {
  const median = entry.median_amount ?? 0;
  const p25 = entry.p25_amount ?? median;
  const p75 = entry.p75_amount ?? median;
  const min = entry.min_amount ?? 0;
  const max = entry.max_amount ?? median * 2;

  if (amount <= min) return 1;
  if (amount >= max) return 99;
  if (amount <= p25)
    return Math.max(1, Math.round((25 * (amount - min)) / Math.max(p25 - min, 0.01)));
  if (amount <= median)
    return Math.round(25 + (25 * (amount - p25)) / Math.max(median - p25, 0.01));
  if (amount <= p75)
    return Math.round(50 + (25 * (amount - median)) / Math.max(p75 - median, 0.01));
  return Math.min(99, Math.round(75 + (25 * (amount - p75)) / Math.max(max - p75, 0.01)));
}

function PositionBar({
  comp,
  charterType,
  tierLabel,
}: {
  comp: ScorecardComparison;
  charterType: string;
  tierLabel: string;
}) {
  const rangeMin = comp.min;
  const rangeMax = Math.max(comp.max, comp.amount);
  const span = rangeMax - rangeMin || 1;
  const pctP25 = ((comp.p25 - rangeMin) / span) * 100;
  const pctP75 = ((comp.p75 - rangeMin) / span) * 100;
  const pctMedian = ((comp.median - rangeMin) / span) * 100;
  const pctFee = Math.max(0, Math.min(100, ((comp.amount - rangeMin) / span) * 100));
  const isBelow = comp.delta < -0.5;
  const isAbove = comp.delta > 0.5;

  const percentile = estimatePercentile(comp.amount, comp.indexEntry);
  const isPercentileBelow = percentile < 50;
  const isPercentileAbove = percentile > 50;
  const percentileLabel =
    isPercentileBelow
      ? `top ${percentile}%`
      : isPercentileAbove
        ? `bottom ${100 - percentile}%`
        : "50th pct";
  const percentileColor = isPercentileBelow
    ? "text-emerald-600"
    : isPercentileAbove
      ? "text-red-600"
      : "text-[#A09788]";
  const tooltipText = isPercentileBelow
    ? `Lower than ${100 - percentile}% of ${charterType} institutions in the ${tierLabel} asset tier`
    : `Higher than ${percentile}% of ${charterType} institutions in the ${tierLabel} asset tier`;

  return (
    <div className="flex items-center gap-3 py-2">
      <span className="w-[120px] sm:w-[140px] shrink-0 text-[12px] text-[#5A5347] truncate">
        {getDisplayName(comp.name)}
      </span>
      <div className="flex-1 relative h-5">
        {/* Track */}
        <div className="absolute inset-y-0 left-0 right-0 flex items-center">
          <div className="w-full h-[3px] rounded-full bg-[#E8DFD1]/60" />
        </div>
        {/* P25-P75 range */}
        <div
          className="absolute top-1/2 -translate-y-1/2 h-[6px] rounded-full bg-[#E8DFD1]"
          style={{ left: `${pctP25}%`, width: `${Math.max(pctP75 - pctP25, 1)}%` }}
        />
        {/* Median marker */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-[2px] h-3 bg-[#A09788] rounded-full"
          style={{ left: `${pctMedian}%` }}
        />
        {/* Fee position dot */}
        <div
          className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full border-2 border-white shadow-sm ${
            isBelow ? "bg-emerald-500" : isAbove ? "bg-red-500" : "bg-[#7A7062]"
          }`}
          style={{ left: `${pctFee}%` }}
        />
      </div>
      <span className="w-[52px] shrink-0 text-right text-[11px] tabular-nums font-medium text-[#1A1815]">
        {formatAmount(comp.amount)}
      </span>
      <span className={`w-[44px] shrink-0 text-right text-[10px] tabular-nums font-semibold ${
        isBelow ? "text-emerald-600" : isAbove ? "text-red-600" : "text-[#A09788]"
      }`}>
        {isAbove ? "+" : ""}{comp.delta.toFixed(0)}%
      </span>
      <span
        className={`w-[60px] shrink-0 text-right text-[10px] tabular-nums font-medium ${percentileColor}`}
        title={tooltipText}
      >
        {percentileLabel}
      </span>
    </div>
  );
}

function CompetitiveScorecard({
  fees,
  indexEntries,
  isPro,
  charterType,
  tierLabel,
}: {
  fees: { id: number; fee_name: string; amount: number | null }[];
  indexEntries: IndexEntry[];
  isPro: boolean;
  charterType: string;
  tierLabel: string;
}) {
  const comparisons = computeScorecard(fees, indexEntries);
  if (comparisons.length < 2) return null;

  const below = comparisons.filter((c) => c.delta < -0.5);
  const above = comparisons.filter((c) => c.delta > 0.5);
  const atMedian = comparisons.filter((c) => Math.abs(c.delta) <= 0.5);
  const competitiveScore = Math.round(
    ((below.length + atMedian.length) / comparisons.length) * 100
  );

  const scoreColor =
    competitiveScore >= 70
      ? "text-emerald-600"
      : competitiveScore >= 40
        ? "text-amber-600"
        : "text-red-600";
  const scoreLabel =
    competitiveScore >= 70
      ? "Competitive"
      : competitiveScore >= 40
        ? "Mixed"
        : "Above Market";

  const sorted = [...comparisons].sort((a, b) => a.delta - b.delta);

  return (
    <section className="mt-10">
      <h2
        className="text-[16px] font-medium text-[#1A1815]"
        style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
      >
        Competitive Position
      </h2>
      <p className="mt-1 text-[13px] text-[#7A7062]">
        {comparisons.length} fees benchmarked against national medians.
      </p>

      {/* Score + summary cards */}
      <div className="mt-4 grid grid-cols-4 gap-3">
        <div className="rounded-xl border border-[#E8DFD1]/80 bg-white/70 px-4 py-3 text-center">
          <p className={`text-[28px] font-bold tabular-nums ${scoreColor}`}>
            {competitiveScore}
          </p>
          <p className={`text-[10px] font-semibold uppercase tracking-wider ${scoreColor}`}>
            {scoreLabel}
          </p>
        </div>
        <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/40 px-4 py-3 text-center">
          <p className="text-[22px] font-bold tabular-nums text-emerald-600">
            {below.length}
          </p>
          <p className="text-[10px] font-medium text-emerald-600/70">
            Below median
          </p>
        </div>
        <div className="rounded-xl border border-[#E8DFD1]/80 bg-[#FAF7F2]/40 px-4 py-3 text-center">
          <p className="text-[22px] font-bold tabular-nums text-[#7A7062]">
            {atMedian.length}
          </p>
          <p className="text-[10px] font-medium text-[#A09788]">
            At median
          </p>
        </div>
        <div className="rounded-xl border border-red-200/80 bg-red-50/40 px-4 py-3 text-center">
          <p className="text-[22px] font-bold tabular-nums text-red-600">
            {above.length}
          </p>
          <p className="text-[10px] font-medium text-red-600/70">
            Above median
          </p>
        </div>
      </div>

      {/* Percentile position bars — Pro only */}
      {isPro ? (
        <div className="mt-5 rounded-xl border border-[#E8DFD1]/80 bg-white/70 px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#A09788]">
              Fee-by-Fee Positioning
            </p>
            <div className="flex items-center gap-3 text-[9px] text-[#A09788]">
              <span className="flex items-center gap-1">
                <span className="inline-block w-4 h-[4px] rounded-full bg-[#E8DFD1]" />
                P25-P75
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-[2px] h-2.5 bg-[#A09788] rounded-full" />
                Median
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-full bg-[#7A7062]" />
                This institution
              </span>
            </div>
          </div>
          <div className="divide-y divide-[#E8DFD1]/30">
            {sorted.map((comp) => (
              <PositionBar
                key={comp.name}
                comp={comp}
                charterType={charterType}
                tierLabel={tierLabel}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-5">
          <UpgradeGate message="Unlock fee-by-fee positioning analysis with percentile bars" />
        </div>
      )}
    </section>
  );
}

function FeeCallout({
  category,
  amount,
  institutionName,
  charterLabel,
  nationalMedian,
}: {
  category: string;
  amount: number;
  institutionName: string;
  charterLabel: string;
  nationalMedian: number | null;
}) {
  const explainer = getExplainer(category);
  if (!explainer) return null;

  return (
    <tr>
      <td colSpan={5} className="px-4 pb-3 pt-0">
        <div className="mt-1 rounded-lg border border-[#E8DFD1]/60 bg-[#FAF7F2]/70 px-4 py-3">
          <p className="text-[13px] leading-relaxed text-[#5A5347]">
            {explainer}{" "}
            {nationalMedian !== null ? (
              <span className="text-[13px] leading-relaxed text-[#1A1815] font-medium">
                {institutionName} charges {formatAmount(amount)}. The national median for{" "}
                {charterLabel.toLowerCase()} institutions is {formatAmount(nationalMedian)}.
              </span>
            ) : (
              <span className="text-[13px] leading-relaxed text-[#A09788]">
                Benchmark data unavailable for this category.
              </span>
            )}
          </p>
        </div>
      </td>
    </tr>
  );
}

export default async function InstitutionProfilePage({ params }: PageProps) {
  const { id } = await params;
  const instId = parseInt(id, 10);
  if (isNaN(instId)) notFound();

  const user = await getCurrentUser();
  const isPro = canAccessPremium(user);

  const inst = await getInstitutionById(instId);
  if (!inst) notFound();

  const fees = (await getFeesByInstitution(instId)).filter(
    (f) => f.review_status === "approved"
  );
  const [financials, nationalIndex, revenueTrend, peerRanking] = await Promise.all([
    getFinancialsByInstitution(instId),
    getNationalIndex(),
    getInstitutionRevenueTrend(instId),
    getInstitutionPeerRanking(instId),
  ]);

  const SPOTLIGHT_CATEGORIES = [
    "overdraft",
    "nsf",
    "monthly_maintenance",
    "atm_non_network",
    "wire_domestic_outgoing",
    "card_foreign_txn",
  ];

  const instSpotlightFees = fees.filter(
    (f) => SPOTLIGHT_CATEGORIES.includes(f.fee_name) && f.amount && f.amount > 0
  );

  const distributionData = await Promise.all(
    instSpotlightFees.map(async (f) => {
      const allFees = await getFeesForCategory(f.fee_name, {});
      return { category: f.fee_name, institutionAmount: f.amount!, allFees };
    })
  );

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
  const tierLabel = inst.asset_size_tier ? FDIC_TIER_LABELS[inst.asset_size_tier] : null;
  const latestFinancial = financials[0] ?? null;
  const marketConcentration = await getMarketConcentrationForInstitution(instId);

  return (
    <div className="mx-auto max-w-7xl px-6 py-14">
      <BreadcrumbJsonLd
        items={[
          { name: "Home", href: "/" },
          { name: "Fee Index", href: "/fees" },
          { name: inst.institution_name, href: `/institution/${instId}` },
        ]}
      />

      {/* Breadcrumb — sticky on mobile for navigation context */}
      <nav className="flex items-center gap-2 text-[12px] text-[#A09788] mb-6 sticky top-14 z-30 -mx-6 px-6 py-2 bg-[#FAF7F2]/95 backdrop-blur-sm border-b border-transparent sm:static sm:mx-0 sm:px-0 sm:py-0 sm:bg-transparent sm:backdrop-blur-none sm:border-none [&:not(:hover)]:sm:border-transparent">
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
            {latestFinancial.fee_income_ratio !== null && (
              <InfoCard label="Fee Income Ratio" value={`${(latestFinancial.fee_income_ratio * 100).toFixed(1)}%`} />
            )}
            {latestFinancial.total_revenue !== null && (
              <InfoCard label="Total Revenue" value={formatAssets(latestFinancial.total_revenue)} />
            )}
          </div>
        </section>
      )}

      {/* Market context */}
      {!isPro && marketConcentration && (
        <div className="mt-8">
          <UpgradeGate message="Market concentration and competitive landscape" />
        </div>
      )}
      {isPro && marketConcentration && (
        <section className="mt-8">
          <h2
            className="text-[16px] font-medium text-[#1A1815]"
            style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
          >
            Market Context
          </h2>
          <p className="mt-1 text-[11px] text-[#A09788]">
            Deposit market competition in {marketConcentration.msa_name || "this metro area"}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <InfoCard label="Market HHI" value={marketConcentration.hhi.toLocaleString()} />
            <InfoCard label="Banks in Market" value={marketConcentration.institution_count.toLocaleString()} />
            <InfoCard label="Top 3 Share" value={`${marketConcentration.top3_share.toFixed(0)}%`} />
            <InfoCard
              label="Concentration"
              value={
                marketConcentration.hhi >= 2500
                  ? "High"
                  : marketConcentration.hhi >= 1500
                    ? "Moderate"
                    : "Competitive"
              }
            />
          </div>
        </section>
      )}

      {/* Competitive Position */}
      <CompetitiveScorecard
        fees={fees}
        indexEntries={nationalIndex}
        isPro={isPro}
        charterType={charterLabel}
        tierLabel={tierLabel ?? "Unknown"}
      />

      {/* Financial Context — Call Report data (D-08, D-09, D-10) */}
      {(revenueTrend.length > 0 || peerRanking) && (
        <section className="mt-10">
          <h2
            className="text-[16px] font-medium text-[#1A1815]"
            style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
          >
            Financial Context
          </h2>
          <p className="mt-1 text-[13px] text-[#7A7062]">
            Call Report data — service charge income, fee dependency, and peer benchmarking.
          </p>

          {peerRanking && (
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <InfoCard
                label="SC Income"
                value={formatAmount(peerRanking.sc_income)}
              />
              <InfoCard
                label={`Rank in ${peerRanking.tier} Peers`}
                value={`#${peerRanking.sc_rank} of ${peerRanking.peer_count}`}
              />
              <InfoCard
                label="Peer Median SC"
                value={formatAmount(peerRanking.peer_median_sc)}
              />
              <InfoCard
                label="Fee Dependency"
                value={
                  peerRanking.fee_income_ratio !== null
                    ? `${peerRanking.fee_income_ratio.toFixed(1)}%${
                        peerRanking.peer_median_fee_ratio !== null
                          ? ` vs ${peerRanking.peer_median_fee_ratio.toFixed(1)}% median`
                          : ""
                      }`
                    : "N/A"
                }
              />
            </div>
          )}

          {revenueTrend.length > 0 && (
            <div className="mt-4 overflow-x-auto rounded-xl border border-[#E8DFD1]/80">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#FAF8F5] border-b border-[#E8DFD1]/60">
                    <th className="text-left px-4 py-2 text-[11px] font-semibold text-[#A09788] uppercase tracking-wider">
                      Quarter
                    </th>
                    <th className="text-right px-4 py-2 text-[11px] font-semibold text-[#A09788] uppercase tracking-wider">
                      SC Income
                    </th>
                    <th className="text-right px-4 py-2 text-[11px] font-semibold text-[#A09788] uppercase tracking-wider">
                      Fee Ratio
                    </th>
                    <th className="text-right px-4 py-2 text-[11px] font-semibold text-[#A09788] uppercase tracking-wider">
                      YoY
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {revenueTrend.map((q) => (
                    <tr
                      key={q.quarter}
                      className="border-b border-[#E8DFD1]/30 hover:bg-[#FAF8F5]/50 transition-colors"
                    >
                      <td className="px-4 py-2 font-medium text-[#1A1815]">{q.quarter}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-[#1A1815]">
                        {formatAmount(q.service_charge_income)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-[#7A7062]">
                        {q.fee_income_ratio !== null
                          ? `${q.fee_income_ratio.toFixed(1)}%`
                          : "—"}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {q.yoy_change_pct !== null ? (
                          <span
                            className={
                              q.yoy_change_pct >= 0
                                ? "text-red-600"
                                : "text-emerald-600"
                            }
                          >
                            {q.yoy_change_pct >= 0 ? "+" : ""}
                            {q.yoy_change_pct.toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-[#A09788]">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Fee Distribution */}
      {distributionData.length >= 2 && (
        <section className="mt-12">
          <h2
            className="text-[16px] font-medium text-[#1A1815]"
            style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
          >
            Fee Distribution
          </h2>
          <p className="mt-1 text-[13px] text-[#7A7062]">
            Where {inst.institution_name}&apos;s fees sit in the national distribution.
          </p>
          <div className="mt-5 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {distributionData.map((d) => {
              const indexEntry = nationalIndex.find(
                (e) => e.fee_category === d.category
              );
              return (
                <InstitutionHistogram
                  key={d.category}
                  categoryName={getDisplayName(d.category)}
                  institutionName={inst.institution_name}
                  institutionAmount={d.institutionAmount}
                  fees={d.allFees}
                  median={indexEntry?.median_amount ?? null}
                />
              );
            })}
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
                const showCallout =
                  fee.amount !== null && fee.amount > 0 && getExplainer(fee.fee_name) !== null;

                return (
                  <>
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
                    {showCallout && (
                      <FeeCallout
                        key={`callout-${fee.id}`}
                        category={fee.fee_name}
                        amount={fee.amount!}
                        institutionName={inst.institution_name}
                        charterLabel={charterLabel}
                        nationalMedian={nationalMedian}
                      />
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Report Card + Links */}
      <div className="mt-8 flex flex-wrap gap-2">
        <a
          href={`/api/reports/institution/${instId}?format=html`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full border border-[#C44B2E]/30 bg-[#C44B2E]/5 px-4 py-1.5 text-[12px] font-semibold text-[#C44B2E] hover:bg-[#C44B2E]/10 transition-colors no-underline"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
          Fee Report Card
        </a>
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
