export const dynamic = "force-dynamic";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  TrendingUp,
  CheckCircle,
  Info,
  ExternalLink,
  FileText,
  MapPin,
  Building2,
  Landmark,
  BarChart2,
  ArrowRight,
  ChevronDown,
  ShieldCheck,
} from "lucide-react";
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
import { getDisplayName } from "@/lib/fee-taxonomy";
import { DISTRICT_NAMES, FDIC_TIER_LABELS } from "@/lib/fed-districts";
import { formatAmount, formatAssets } from "@/lib/format";
import { STATE_NAMES } from "@/lib/us-states";
import { BreadcrumbJsonLd } from "@/components/breadcrumb-jsonld";
import { SITE_URL } from "@/lib/constants";
import { getCurrentUser } from "@/lib/auth";
import { canAccessPremium } from "@/lib/access";
import {
  computeInstitutionRating,
  deriveStrengthsAndWatch,
  generateInterpretation,
} from "@/lib/institution-rating";
import type { IndexEntry } from "@/lib/crawler-db/fee-index";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PageProps {
  params: Promise<{ id: string }>;
}

type FeeGroup =
  | "Overdraft & NSF"
  | "Account Maintenance"
  | "Wire Transfers"
  | "ATM"
  | "Other Fees";

const GROUP_ORDER: FeeGroup[] = [
  "Overdraft & NSF",
  "Account Maintenance",
  "Wire Transfers",
  "ATM",
  "Other Fees",
];

const ACCENT_GROUPS = new Set<FeeGroup>(["Overdraft & NSF", "Wire Transfers"]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function detectGroup(feeName: string): FeeGroup {
  const n = feeName.toLowerCase();
  if (n.includes("overdraft") || n.includes("od ") || n.startsWith("od_") || n === "od") return "Overdraft & NSF";
  if (n.includes("nsf") || n.includes("returned") || n.includes("insufficient")) return "Overdraft & NSF";
  if (n.includes("maintenance") || n.includes("monthly") || n.includes("service charge")) return "Account Maintenance";
  if (n.includes("wire")) return "Wire Transfers";
  if (n.includes("atm")) return "ATM";
  return "Other Fees";
}

const RATING_COLORS = {
  green:  { bg: "rgba(5,150,105,0.08)", border: "#059669", pill: "#059669", pillText: "white", label: "#047857" },
  yellow: { bg: "rgba(217,119,6,0.08)",  border: "#D97706", pill: "#D97706", pillText: "white", label: "#A47E13" },
  red:    { bg: "rgba(220,38,38,0.08)",  border: "#DC2626", pill: "#DC2626", pillText: "white", label: "#B91C1C" },
};

const SERIF = "var(--font-newsreader), Georgia, serif";

// ---------------------------------------------------------------------------
// Static params + metadata
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Pro helpers
// ---------------------------------------------------------------------------

function computeScorecard(
  fees: { id: number; fee_name: string; amount: number | null }[],
  indexEntries: IndexEntry[]
) {
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
    .filter(Boolean) as Array<{
      name: string; amount: number; median: number;
      p25: number; p75: number; min: number; max: number;
      delta: number; indexEntry: IndexEntry;
    }>;
}

function estimatePercentile(
  amount: number,
  entry: { p25_amount: number | null; p75_amount: number | null; min_amount: number | null; max_amount: number | null; median_amount: number | null }
): number {
  const median = entry.median_amount ?? 0;
  const p25 = entry.p25_amount ?? median;
  const p75 = entry.p75_amount ?? median;
  const min = entry.min_amount ?? 0;
  const max = entry.max_amount ?? median * 2;
  if (amount <= min) return 1;
  if (amount >= max) return 99;
  if (amount <= p25) return Math.max(1, Math.round((25 * (amount - min)) / Math.max(p25 - min, 0.01)));
  if (amount <= median) return Math.round(25 + (25 * (amount - p25)) / Math.max(median - p25, 0.01));
  if (amount <= p75) return Math.round(50 + (25 * (amount - median)) / Math.max(p75 - median, 0.01));
  return Math.min(99, Math.round(75 + (25 * (amount - p75)) / Math.max(max - p75, 0.01)));
}

async function getRelatedReports(inst: {
  charter_type: string | null;
  asset_size_tier: string | null;
  fed_district: number | null;
}): Promise<{ slug: string; title: string }[]> {
  try {
    const { getSql } = await import("@/lib/crawler-db/connection");
    const db = getSql();
    const rows = await db<{ slug: string; title: string }[]>`
      SELECT slug, title FROM published_reports
      WHERE is_public = true ORDER BY published_at DESC LIMIT 20
    `;
    const keywords: string[] = [];
    if (inst.charter_type) keywords.push(inst.charter_type === "bank" ? "bank" : "credit union");
    if (inst.fed_district) keywords.push(`district ${inst.fed_district}`);
    if (inst.asset_size_tier) keywords.push(inst.asset_size_tier);
    return rows.filter((r) => keywords.some((kw) => r.title.toLowerCase().includes(kw.toLowerCase()))).slice(0, 5);
  } catch {
    return [];
  }
}

/** Compute distribution bar position for a fee relative to national index. */
function computeBarPosition(
  amount: number,
  entry: IndexEntry
): { p25Pct: number; rangePct: number; dotPct: number } | null {
  if (entry.median_amount === null) return null;
  const min = entry.min_amount ?? 0;
  const max = entry.max_amount ?? entry.median_amount * 2;
  const span = max - min || 1;
  const p25 = entry.p25_amount ?? entry.median_amount;
  const p75 = entry.p75_amount ?? entry.median_amount;
  const p25Pct = Math.max(0, Math.min(100, ((p25 - min) / span) * 100));
  const p75Pct = Math.max(0, Math.min(100, ((p75 - min) / span) * 100));
  const dotPct = Math.max(0, Math.min(100, ((amount - min) / span) * 100));
  return { p25Pct, rangePct: Math.max(p75Pct - p25Pct, 2), dotPct };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function InstitutionProfilePage({ params }: PageProps) {
  const { id } = await params;
  const instId = parseInt(id, 10);
  if (isNaN(instId)) notFound();

  const user = await getCurrentUser();
  const isPro = canAccessPremium(user);

  const inst = await getInstitutionById(instId);
  if (!inst) notFound();

  const fees = (await getFeesByInstitution(instId)).filter((f) => f.review_status !== "rejected");
  const [financials, nationalIndex, revenueTrend, peerRanking] = await Promise.all([
    getFinancialsByInstitution(instId),
    getNationalIndex(),
    getInstitutionRevenueTrend(instId),
    getInstitutionPeerRanking(instId),
  ]);

  const indexMap = new Map(nationalIndex.map((e) => [e.fee_category, e]));
  const stateName = inst.state_code ? STATE_NAMES[inst.state_code] : null;
  const charterLabel = inst.charter_type === "bank" ? "Bank" : "Credit Union";
  const tierLabel = inst.asset_size_tier ? FDIC_TIER_LABELS[inst.asset_size_tier] : null;
  const latestFinancial = financials[0] ?? null;

  // Rating engine
  const rating = computeInstitutionRating(fees, nationalIndex);
  const rc = RATING_COLORS[rating.color];
  const strengthsWatch = deriveStrengthsAndWatch(fees, nationalIndex);
  const overdraftFee = fees.find((f) => f.fee_name.toLowerCase().includes("overdraft") && f.amount !== null);
  const interpretation = generateInterpretation({
    rating,
    feeCount: fees.length,
    overdraftAmount: overdraftFee?.amount ?? null,
    charterType: inst.charter_type,
  });

  // Group fees for schedule
  const grouped = new Map<FeeGroup, typeof fees>();
  for (const g of GROUP_ORDER) grouped.set(g, []);
  for (const f of fees) grouped.get(detectGroup(f.fee_name))!.push(f);

  // Pro-only data
  const marketConcentration = isPro ? await getMarketConcentrationForInstitution(instId) : null;
  const relatedReports = isPro ? await getRelatedReports(inst) : [];

  const SPOTLIGHT_CATEGORIES = ["overdraft", "nsf", "monthly_maintenance", "atm_non_network", "wire_domestic_outgoing", "card_foreign_txn"];
  const instSpotlightFees = fees.filter((f) => SPOTLIGHT_CATEGORIES.includes(f.fee_name) && f.amount && f.amount > 0);
  const distributionData = isPro
    ? await Promise.all(instSpotlightFees.map(async (f) => {
        const allFees = await getFeesForCategory(f.fee_name, {});
        return { category: f.fee_name, institutionAmount: f.amount!, allFees };
      }))
    : [];

  const scorecardComparisons = isPro ? computeScorecard(fees, nationalIndex) : [];

  // Build rating insight bullets with icons
  const ratingBullets: { icon: "trending" | "check" | "info"; text: string }[] = [];
  if (strengthsWatch.watch.length > 0) {
    ratingBullets.push({ icon: "trending", text: strengthsWatch.watch[0] });
  }
  if (strengthsWatch.strengths.length > 0) {
    ratingBullets.push({ icon: "check", text: strengthsWatch.strengths[0] });
  }
  for (const b of rating.bullets) {
    if (ratingBullets.length >= 3) break;
    if (!ratingBullets.some((r) => r.text === b)) {
      ratingBullets.push({ icon: "info", text: b });
    }
  }

  return (
    <main className="max-w-4xl mx-auto px-6 md:px-16 py-12">
      <BreadcrumbJsonLd
        items={[
          { name: "Home", href: "/" },
          { name: "Fee Index", href: "/fees" },
          { name: inst.institution_name, href: `/institution/${instId}` },
        ]}
      />

      {/* ================================================================ */}
      {/* HEADER                                                           */}
      {/* ================================================================ */}
      <header className="mb-16">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <span
              className="text-xs uppercase tracking-widest font-semibold mb-2 block"
              style={{ color: "#C44B2E" }}
            >
              Institution Intelligence
            </span>
            <h1
              className="text-5xl md:text-6xl tracking-tighter text-[#1A1815] mb-4"
              style={{ fontFamily: SERIF }}
            >
              {inst.institution_name}
            </h1>
            <div className="flex flex-wrap items-center gap-y-2 gap-x-6 text-[#6B6355] text-sm">
              {(inst.city || stateName) && (
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-4 h-4" />
                  {inst.city}{stateName ? `, ${stateName}` : ""}
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <Building2 className="w-4 h-4" />
                Charter: {charterLabel}
              </div>
              {inst.fed_district && (
                <div className="flex items-center gap-1.5">
                  <Landmark className="w-4 h-4" />
                  Fed District: {DISTRICT_NAMES[inst.fed_district]}
                </div>
              )}
            </div>
          </div>
          <div className="flex gap-4">
            {inst.website_url && (
              <a
                href={inst.website_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 font-medium hover:underline text-sm uppercase tracking-wider"
                style={{ color: "#C44B2E" }}
              >
                Website <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
            {inst.fee_schedule_url && (
              <a
                href={inst.fee_schedule_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 font-medium hover:underline text-sm uppercase tracking-wider"
                style={{ color: "#C44B2E" }}
              >
                Full Disclosure <FileText className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        </div>
      </header>

      {/* ================================================================ */}
      {/* RATING + INTERPRETATION GRID                                     */}
      {/* ================================================================ */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-8 mb-16">

        {/* Rating Card */}
        <div
          className="md:col-span-5 p-8 rounded-lg flex flex-col justify-between"
          style={{
            backgroundColor: rc.bg,
            borderLeft: `4px solid ${rc.border}`,
          }}
        >
          <div>
            <div className="flex justify-between items-start mb-6">
              <span
                className="text-xs uppercase tracking-widest font-semibold"
                style={{ color: rc.label }}
              >
                Fee Profile
              </span>
              <div
                className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-tight"
                style={{ backgroundColor: rc.pill, color: rc.pillText }}
              >
                {rating.color === "green" ? "Green" : rating.color === "yellow" ? "Yellow" : "Red"}
              </div>
            </div>

            {overdraftFee?.amount !== undefined && overdraftFee?.amount !== null && (
              <div className="mb-8">
                <span className="text-xs text-[#6B6355] uppercase">Key Indicator</span>
                <div
                  className="text-5xl text-[#1A1815]"
                  style={{ fontFamily: SERIF }}
                >
                  {formatAmount(overdraftFee.amount)}
                </div>
                <p className="text-sm text-[#6B6355] mt-1">Standard Overdraft Fee</p>
              </div>
            )}

            <ul className="space-y-4">
              {ratingBullets.slice(0, 3).map((bullet, i) => (
                <li key={i} className="flex items-start gap-3">
                  {bullet.icon === "trending" && (
                    <TrendingUp className="w-[18px] h-[18px] mt-0.5 shrink-0 text-red-600" />
                  )}
                  {bullet.icon === "check" && (
                    <CheckCircle className="w-[18px] h-[18px] mt-0.5 shrink-0" style={{ color: "#C44B2E" }} />
                  )}
                  {bullet.icon === "info" && (
                    <Info className="w-[18px] h-[18px] mt-0.5 shrink-0 text-[#6B6355]" />
                  )}
                  <span className="text-sm leading-relaxed">{bullet.text}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Interpretation + Stats */}
        <div className="md:col-span-7 flex flex-col justify-between py-2">
          <div className="space-y-6">
            <h3
              className="text-2xl italic text-[#1A1815]"
              style={{ fontFamily: SERIF }}
            >
              &ldquo;{interpretation}&rdquo;
            </h3>

            <div className="grid grid-cols-3 gap-4 pt-8">
              <div className="p-6 rounded-lg" style={{ backgroundColor: "#F5EFE6" }}>
                <span className="text-[10px] uppercase tracking-widest text-[#6B6355] mb-1 block font-semibold">Charter</span>
                <span className="text-xl text-[#1A1815]" style={{ fontFamily: SERIF }}>{charterLabel}</span>
              </div>
              <div className="p-6 rounded-lg" style={{ backgroundColor: "#F5EFE6" }}>
                <span className="text-[10px] uppercase tracking-widest text-[#6B6355] mb-1 block font-semibold">Assets</span>
                <span className="text-xl text-[#1A1815]" style={{ fontFamily: SERIF }}>
                  {inst.asset_size ? formatAssets(inst.asset_size) : "N/A"}
                </span>
              </div>
              <div className="p-6 rounded-lg" style={{ backgroundColor: "#F5EFE6" }}>
                <span className="text-[10px] uppercase tracking-widest text-[#6B6355] mb-1 block font-semibold">Fees</span>
                <span className="text-xl text-[#1A1815]" style={{ fontFamily: SERIF }}>{fees.length}</span>
              </div>
            </div>
          </div>

          {/* Inline Pro CTA */}
          {!isPro && (
            <div
              className="mt-8 p-6 rounded-xl flex items-center gap-6"
              style={{ backgroundColor: "rgba(232,223,209,0.5)", border: "1px solid rgba(232,223,209,0.2)" }}
            >
              <div style={{ color: "#C44B2E" }}>
                <BarChart2 className="w-9 h-9" />
              </div>
              <div>
                <p className="text-sm text-[#6B6355] leading-relaxed">
                  <span className="font-bold text-[#1A1815]">Financial professionals</span> get access to peer benchmarking, competitive intelligence, and AI-powered research.
                  <Link href="/pro" className="font-bold hover:underline ml-1" style={{ color: "#C44B2E" }}>
                    Learn More
                  </Link>
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ================================================================ */}
      {/* FEE SCHEDULE                                                     */}
      {/* ================================================================ */}
      <section className="mt-20">
        <h2
          className="text-3xl mb-10 pb-4"
          style={{
            fontFamily: SERIF,
            borderBottom: "1px solid rgba(232,223,209,0.3)",
          }}
        >
          Schedule of Fees
        </h2>

        <div className="space-y-8">
          {GROUP_ORDER.map((group, groupIdx) => {
            const rows = grouped.get(group) ?? [];
            if (rows.length === 0) return null;
            const hasAccent = ACCENT_GROUPS.has(group);
            const isFirst = groupIdx === 0;

            return (
              <details key={group} open={isFirst ? true : undefined}>
                <summary
                  className="relative pl-8 mb-6 flex items-center justify-between cursor-pointer"
                  style={hasAccent ? { borderLeft: "4px solid #C44B2E" } : undefined}
                >
                  <div className="flex items-center gap-3">
                    <h3
                      className="text-xs uppercase font-semibold"
                      style={{
                        letterSpacing: "0.2em",
                        color: hasAccent ? "#C44B2E" : "#6B6355",
                      }}
                    >
                      {group}
                    </h3>
                    <ChevronDown
                      className="w-4 h-4 transition-transform duration-300"
                      style={{ color: hasAccent ? "rgba(196,75,46,0.4)" : "rgba(107,99,85,0.4)" }}
                    />
                  </div>
                  <div className="hidden md:flex gap-12 text-[10px] uppercase tracking-widest text-[#6B6355]/50 pr-4">
                    <span className="w-32">Market Distribution</span>
                    <span className="w-16 text-right">Amount</span>
                    <span className="w-16 text-right">Freq.</span>
                  </div>
                </summary>

                <div className="pl-8 pb-8 space-y-0.5">
                  {rows.map((fee) => {
                    const entry = indexMap.get(fee.fee_name);
                    const bar = fee.amount !== null && entry
                      ? computeBarPosition(fee.amount, entry)
                      : null;

                    return (
                      <div
                        key={fee.id}
                        className="grid grid-cols-12 gap-4 py-4 items-center px-2 -mx-2 rounded transition-colors hover:bg-[#F5EFE6]/50"
                        style={{ borderBottom: "1px solid rgba(232,223,209,0.05)" }}
                      >
                        <div className="col-span-12 md:col-span-5 text-sm font-semibold text-[#1A1815]">
                          {getDisplayName(fee.fee_name)}
                          {fee.conditions && (
                            <span className="block text-[11px] text-[#A09788] mt-0.5 max-w-xs truncate font-normal">
                              {fee.conditions}
                            </span>
                          )}
                        </div>

                        <div className="col-span-6 md:col-span-3">
                          {bar ? (
                            <div className="relative h-1 w-full rounded-full overflow-visible flex items-center" style={{ backgroundColor: "rgba(232,223,209,0.2)" }}>
                              <div
                                className="absolute h-1 rounded-full"
                                style={{
                                  left: `${bar.p25Pct}%`,
                                  width: `${bar.rangePct}%`,
                                  backgroundColor: "rgba(232,223,209,0.4)",
                                }}
                              />
                              <div
                                className="absolute w-2 h-2 rounded-full shadow-sm"
                                style={{
                                  left: `${bar.dotPct}%`,
                                  backgroundColor: "#C44B2E",
                                  boxShadow: "0 0 0 4px rgba(196,75,46,0.2)",
                                }}
                              />
                            </div>
                          ) : (
                            <div className="h-1" />
                          )}
                        </div>

                        <div
                          className="col-span-3 md:col-span-2 text-right text-lg text-[#1A1815]"
                          style={{ fontFamily: SERIF }}
                        >
                          {formatAmount(fee.amount)}
                        </div>

                        <div className="col-span-3 md:col-span-2 text-right text-xs text-[#6B6355]">
                          {fee.frequency ? (
                            fee.frequency
                          ) : fee.amount === 0 ? (
                            <span className="italic">None</span>
                          ) : (
                            <span className="text-[#C4B9A8]">&mdash;</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </details>
            );
          })}
        </div>
      </section>

      {/* ================================================================ */}
      {/* PRO SECTIONS (gated)                                             */}
      {/* ================================================================ */}
      {isPro ? (
        <>
          {latestFinancial && (
            <ProSection title="Financial Snapshot" subtitle={`From ${latestFinancial.source.toUpperCase()} call report — ${latestFinancial.report_date}`}>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {latestFinancial.total_deposits !== null && <Stat label="Total Deposits" value={formatAssets(latestFinancial.total_deposits)} />}
                {latestFinancial.service_charge_income !== null && <Stat label="Service Charge Income" value={formatAssets(latestFinancial.service_charge_income)} />}
                {latestFinancial.branch_count !== null && <Stat label="Branches" value={latestFinancial.branch_count.toLocaleString()} />}
                {latestFinancial.roa !== null && <Stat label="Return on Assets" value={`${latestFinancial.roa.toFixed(2)}%`} />}
                {latestFinancial.fee_income_ratio !== null && <Stat label="Fee Income Ratio" value={`${(latestFinancial.fee_income_ratio * 100).toFixed(1)}%`} />}
                {latestFinancial.total_revenue !== null && <Stat label="Total Revenue" value={formatAssets(latestFinancial.total_revenue)} />}
              </div>
            </ProSection>
          )}

          {marketConcentration && (
            <ProSection title="Market Context" subtitle={`Deposit market competition in ${marketConcentration.msa_name || "this metro area"}`}>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Market HHI" value={marketConcentration.hhi.toLocaleString()} />
                <Stat label="Banks in Market" value={marketConcentration.institution_count.toLocaleString()} />
                <Stat label="Top 3 Share" value={`${marketConcentration.top3_share.toFixed(0)}%`} />
                <Stat label="Concentration" value={marketConcentration.hhi >= 2500 ? "High" : marketConcentration.hhi >= 1500 ? "Moderate" : "Competitive"} />
              </div>
            </ProSection>
          )}

          {scorecardComparisons.length >= 2 && (
            <ProSection title="Competitive Position" subtitle={`${scorecardComparisons.length} fees benchmarked against national medians.`}>
              {(() => {
                const below = scorecardComparisons.filter((c) => c.delta < -0.5);
                const above = scorecardComparisons.filter((c) => c.delta > 0.5);
                const atMedian = scorecardComparisons.filter((c) => Math.abs(c.delta) <= 0.5);
                const score = Math.round(((below.length + atMedian.length) / scorecardComparisons.length) * 100);
                const scoreColor = score >= 70 ? "text-emerald-600" : score >= 40 ? "text-amber-600" : "text-red-600";
                const sorted = [...scorecardComparisons].sort((a, b) => a.delta - b.delta);

                return (
                  <>
                    <div className="grid grid-cols-4 gap-3 mb-5">
                      <div className="rounded-lg bg-[#F5EFE6]/80 px-3 py-2 text-center">
                        <p className={`text-[24px] font-bold tabular-nums ${scoreColor}`}>{score}</p>
                        <p className={`text-[10px] font-semibold uppercase ${scoreColor}`}>
                          {score >= 70 ? "Competitive" : score >= 40 ? "Mixed" : "Above Market"}
                        </p>
                      </div>
                      <div className="rounded-lg bg-emerald-50/40 px-3 py-2 text-center">
                        <p className="text-[20px] font-bold tabular-nums text-emerald-600">{below.length}</p>
                        <p className="text-[10px] text-emerald-600/70">Below median</p>
                      </div>
                      <div className="rounded-lg bg-[#F5EFE6]/40 px-3 py-2 text-center">
                        <p className="text-[20px] font-bold tabular-nums text-[#7A7062]">{atMedian.length}</p>
                        <p className="text-[10px] text-[#A09788]">At median</p>
                      </div>
                      <div className="rounded-lg bg-red-50/40 px-3 py-2 text-center">
                        <p className="text-[20px] font-bold tabular-nums text-red-600">{above.length}</p>
                        <p className="text-[10px] text-red-600/70">Above median</p>
                      </div>
                    </div>
                    <div className="rounded-lg bg-white/70 px-4 py-3">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#A09788]">Fee-by-Fee Positioning</p>
                      </div>
                      <div className="divide-y divide-[#E8DFD1]/30">
                        {sorted.map((comp) => {
                          const rangeMax = Math.max(comp.max, comp.amount);
                          const span = rangeMax - comp.min || 1;
                          const pctP25 = ((comp.p25 - comp.min) / span) * 100;
                          const pctP75 = ((comp.p75 - comp.min) / span) * 100;
                          const pctMedian = ((comp.median - comp.min) / span) * 100;
                          const pctFee = Math.max(0, Math.min(100, ((comp.amount - comp.min) / span) * 100));
                          const isBelow = comp.delta < -0.5;
                          const isAbove = comp.delta > 0.5;
                          const pct = estimatePercentile(comp.amount, comp.indexEntry);
                          const pctLabel = pct < 50 ? `top ${pct}%` : pct > 50 ? `bottom ${100 - pct}%` : "50th pct";
                          const pctColor = pct < 50 ? "text-emerald-600" : pct > 50 ? "text-red-600" : "text-[#A09788]";

                          return (
                            <div key={comp.name} className="flex items-center gap-3 py-2">
                              <span className="w-[120px] sm:w-[140px] shrink-0 text-[12px] text-[#5A5347] truncate">{getDisplayName(comp.name)}</span>
                              <div className="flex-1 relative h-5">
                                <div className="absolute inset-y-0 left-0 right-0 flex items-center"><div className="w-full h-[3px] rounded-full bg-[#E8DFD1]/60" /></div>
                                <div className="absolute top-1/2 -translate-y-1/2 h-[6px] rounded-full bg-[#E8DFD1]" style={{ left: `${pctP25}%`, width: `${Math.max(pctP75 - pctP25, 1)}%` }} />
                                <div className="absolute top-1/2 -translate-y-1/2 w-[2px] h-3 bg-[#A09788] rounded-full" style={{ left: `${pctMedian}%` }} />
                                <div className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full border-2 border-white shadow-sm ${isBelow ? "bg-emerald-500" : isAbove ? "bg-red-500" : "bg-[#7A7062]"}`} style={{ left: `${pctFee}%` }} />
                              </div>
                              <span className="w-[52px] shrink-0 text-right text-[11px] tabular-nums font-medium text-[#1A1815]">{formatAmount(comp.amount)}</span>
                              <span className={`w-[44px] shrink-0 text-right text-[10px] tabular-nums font-semibold ${isBelow ? "text-emerald-600" : isAbove ? "text-red-600" : "text-[#A09788]"}`}>
                                {isAbove ? "+" : ""}{comp.delta.toFixed(0)}%
                              </span>
                              <span className={`w-[60px] shrink-0 text-right text-[10px] tabular-nums font-medium ${pctColor}`}>{pctLabel}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </>
                );
              })()}
            </ProSection>
          )}

          {(revenueTrend.length > 0 || peerRanking) && (
            <ProSection title="Financial Context" subtitle="Call Report data — service charge income, fee dependency, and peer benchmarking.">
              {peerRanking && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  <Stat label="SC Income" value={formatAmount(peerRanking.sc_income)} />
                  <Stat label={`Rank in ${peerRanking.tier} Peers`} value={`#${peerRanking.sc_rank} of ${peerRanking.peer_count}`} />
                  <Stat label="Peer Median SC" value={formatAmount(peerRanking.peer_median_sc)} />
                  <Stat label="Fee Dependency" value={peerRanking.fee_income_ratio !== null ? `${peerRanking.fee_income_ratio.toFixed(1)}%${peerRanking.peer_median_fee_ratio !== null ? ` vs ${peerRanking.peer_median_fee_ratio.toFixed(1)}% median` : ""}` : "N/A"} />
                </div>
              )}
              {revenueTrend.length > 0 && (
                <div className="overflow-x-auto rounded-lg" style={{ backgroundColor: "#F5EFE6" }}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ borderBottom: "1px solid rgba(232,223,209,0.3)" }}>
                        <th className="text-left px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-[#A09788]">Quarter</th>
                        <th className="text-right px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-[#A09788]">SC Income</th>
                        <th className="text-right px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-[#A09788]">Fee Ratio</th>
                        <th className="text-right px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-[#A09788]">YoY</th>
                      </tr>
                    </thead>
                    <tbody>
                      {revenueTrend.map((q) => (
                        <tr key={q.quarter} className="hover:bg-[#E8DFD1]/30 transition-colors" style={{ borderBottom: "1px solid rgba(232,223,209,0.15)" }}>
                          <td className="px-4 py-2 font-medium text-[#1A1815]">{q.quarter}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-[#1A1815]">{formatAmount(q.service_charge_income)}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-[#7A7062]">
                            {q.fee_income_ratio !== null ? `${q.fee_income_ratio.toFixed(1)}%` : <span className="text-[#A09788]">&mdash;</span>}
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums">
                            {q.yoy_change_pct !== null ? (
                              <span className={q.yoy_change_pct >= 0 ? "text-red-600" : "text-emerald-600"}>
                                {q.yoy_change_pct >= 0 ? "+" : ""}{q.yoy_change_pct.toFixed(1)}%
                              </span>
                            ) : <span className="text-[#A09788]">&mdash;</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </ProSection>
          )}

          {distributionData.length >= 2 && (
            <ProSection title="Fee Distribution" subtitle={`Where ${inst.institution_name}'s fees sit in the national distribution.`}>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                {distributionData.map((d) => {
                  const indexEntry = nationalIndex.find((e) => e.fee_category === d.category);
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
            </ProSection>
          )}

          <ProSection title="Intelligence & Reports" subtitle="Reports and analysis for this institution's peer group.">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#A09788] mb-2">Related Reports</p>
                <div className="flex flex-wrap gap-2">
                  {relatedReports.length > 0 ? (
                    relatedReports.map((r) => (
                      <Link key={r.slug} href={`/reports/${r.slug}`} className="rounded-full px-4 py-2 text-[12px] font-medium text-[#5A5347] hover:text-[#C44B2E] transition-colors" style={{ backgroundColor: "#F5EFE6" }}>
                        {r.title}
                      </Link>
                    ))
                  ) : (
                    <p className="text-[13px] text-[#A09788]">No peer reports published yet for this segment.</p>
                  )}
                </div>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#A09788] mb-2">Ask Hamilton</p>
                <div className="flex flex-wrap gap-2">
                  <Link href={`/pro/research?prompt=competitive-brief&instId=${instId}`} className="inline-flex items-center gap-2 rounded-full bg-[#C44B2E]/5 px-4 py-2 text-[12px] font-bold text-[#C44B2E] hover:bg-[#C44B2E]/10 transition-colors">
                    Generate a competitive brief
                  </Link>
                  <Link href={`/pro/research?prompt=institution&instId=${instId}`} className="inline-flex items-center gap-2 rounded-full bg-[#C44B2E]/5 px-4 py-2 text-[12px] font-bold text-[#C44B2E] hover:bg-[#C44B2E]/10 transition-colors">
                    Ask about this institution
                  </Link>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <a href={`/api/reports/institution/${instId}?format=html`} target="_blank" rel="noopener noreferrer" className="rounded-full px-4 py-1.5 text-[12px] font-medium text-[#5A5347] hover:text-[#C44B2E] transition-colors no-underline" style={{ backgroundColor: "#F5EFE6" }}>
                    Fee Report Card
                  </a>
                  {inst.state_code && stateName && (
                    <Link href={`/research/state/${inst.state_code}`} className="rounded-full px-4 py-1.5 text-[12px] font-medium text-[#5A5347] hover:text-[#C44B2E] transition-colors no-underline" style={{ backgroundColor: "#F5EFE6" }}>
                      {stateName} State Report
                    </Link>
                  )}
                  {inst.fed_district && (
                    <Link href={`/research/district/${inst.fed_district}`} className="rounded-full px-4 py-1.5 text-[12px] font-medium text-[#5A5347] hover:text-[#C44B2E] transition-colors no-underline" style={{ backgroundColor: "#F5EFE6" }}>
                      District {inst.fed_district} Report
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </ProSection>
        </>
      ) : (
        /* ================================================================ */
        /* PROFESSIONAL CTA (public users)                                  */
        /* ================================================================ */
        <div
          className="mt-20 p-10 rounded-lg"
          style={{ backgroundColor: "#F5EFE6", border: "1px solid rgba(232,223,209,0.3)" }}
        >
          <div className="max-w-3xl mx-auto">
            <h3
              className="text-3xl text-[#1A1815] mb-4"
              style={{ fontFamily: SERIF }}
            >
              For Financial Professionals
            </h3>
            <p className="text-[#6B6355] mb-8 text-lg leading-relaxed">
              Go beyond fee listings and understand how this institution compares across peers, pricing strategy, and regulatory risk.
            </p>
            <ul className="space-y-4 mb-10">
              <li className="flex items-center gap-3">
                <BarChart2 className="w-5 h-5" style={{ color: "#C44B2E" }} />
                <span className="text-[#1A1815]">Peer benchmarking and percentile positioning</span>
              </li>
              <li className="flex items-center gap-3">
                <TrendingUp className="w-5 h-5" style={{ color: "#C44B2E" }} />
                <span className="text-[#1A1815]">Revenue trend analysis from Call Reports</span>
              </li>
              <li className="flex items-center gap-3">
                <ShieldCheck className="w-5 h-5" style={{ color: "#C44B2E" }} />
                <span className="text-[#1A1815]">Complaint-aligned risk signals</span>
              </li>
            </ul>
            <div className="flex flex-col sm:flex-row sm:items-center gap-6">
              <Link
                href="/pro"
                className="text-white px-8 py-3 rounded font-medium transition-all inline-flex items-center gap-2 hover:opacity-90"
                style={{ background: "linear-gradient(135deg, #C44B2E, #A93D25)" }}
              >
                View Professional Analysis
                <ArrowRight className="w-4 h-4" />
              </Link>
              <p className="text-xs text-[#6B6355]/60 italic">
                Built for banks, credit unions, and financial analysts
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* METHODOLOGY FOOTER                                               */}
      {/* ================================================================ */}
      <footer
        className="mt-32 pt-12 opacity-60"
        style={{ borderTop: "1px solid rgba(232,223,209,0.2)" }}
      >
        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-[18px] h-[18px]" />
            <span className="text-[10px] uppercase tracking-widest font-bold">Data Methodology Disclosure</span>
          </div>
          <p className="text-xs leading-relaxed max-w-2xl">
            Fee data is extracted from publicly available Deposit Account Agreements and Fee Schedules.
            Rates are current as of the last filing period and may vary by specific account tier or regional
            promotion. FeeInsight uses a proprietary normalization engine to compare disparate banking terms
            against national benchmarks.
          </p>
          <p className="text-[10px] italic">
            Source: Federal Reserve System Call Reports &amp; Institutional Disclosure Documents.
          </p>
        </div>
      </footer>

      {/* Structured data */}
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
              ...(stateName && { address: { "@type": "PostalAddress", addressRegion: inst.state_code } }),
            },
          }).replace(/</g, "\\u003c"),
        }}
      />
    </main>
  );
}

// ---------------------------------------------------------------------------
// Inlined components
// ---------------------------------------------------------------------------

function ProSection({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2
        className="text-xl font-semibold text-[#1A1815]"
        style={{ fontFamily: SERIF }}
      >
        {title}
      </h2>
      {subtitle && <p className="mt-1 text-[13px] text-[#7A7062]">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg px-3 py-2.5" style={{ backgroundColor: "#F5EFE6" }}>
      <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#A09788]">{label}</p>
      <p className="mt-1 text-[14px] font-medium tabular-nums text-[#1A1815]">{value}</p>
    </div>
  );
}
