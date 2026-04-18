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
import { FeeGroup } from "./fee-group";
import {
  MapPin,
  Building2,
  Landmark,
  ExternalLink,
  FileText,
  Info,
  CheckCircle2,
  TrendingUp,
  BarChart2,
  SlidersHorizontal,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PageProps {
  params: Promise<{ id: string }>;
}

type FeeGroupName =
  | "Overdraft & NSF"
  | "Account Maintenance"
  | "Wire Transfers"
  | "ATM"
  | "Other Fees";

const GROUP_ORDER: FeeGroupName[] = [
  "Overdraft & NSF",
  "Account Maintenance",
  "Wire Transfers",
  "ATM",
  "Other Fees",
];

const PRIMARY_GROUPS = new Set<FeeGroupName>(["Overdraft & NSF", "Wire Transfers"]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function detectGroup(feeName: string): FeeGroupName {
  const n = feeName.toLowerCase();
  if (n.includes("overdraft") || n.includes("od ") || n.startsWith("od_") || n === "od") return "Overdraft & NSF";
  if (n.includes("nsf") || n.includes("returned") || n.includes("insufficient")) return "Overdraft & NSF";
  if (n.includes("maintenance") || n.includes("monthly") || n.includes("service charge")) return "Account Maintenance";
  if (n.includes("wire")) return "Wire Transfers";
  if (n.includes("atm")) return "ATM";
  return "Other Fees";
}

// Rating color config matching the mockup's color scheme
const RATING_CONFIG = {
  green:  { bg: "rgba(76,175,80,0.08)", border: "#4caf50", badge: "#4caf50", labelColor: "#2e7d32", bulletIconOk: true },
  yellow: { bg: "rgba(251,192,45,0.15)", border: "#fbc02d", badge: "#fbc02d", labelColor: "#a47e13", bulletIconOk: false },
  red:    { bg: "rgba(244,67,54,0.08)", border: "#f44336", badge: "#f44336", labelColor: "#c62828", bulletIconOk: false },
};

function getBulletIcon(bullet: string, color: "green" | "yellow" | "red"): "check_circle" | "trending_up" | "info" {
  const lower = bullet.toLowerCase();
  if (color === "green") return "check_circle";
  if (lower.includes("above") || lower.includes("higher") || lower.includes("%")) {
    if (lower.includes("below") || lower.includes("lower")) return "check_circle";
    if (lower.includes("above") || lower.includes("higher")) return "trending_up";
  }
  if (color === "red") return "trending_up";
  return "info";
}

const BULLET_ICON_MAP = {
  check_circle: CheckCircle2,
  trending_up: TrendingUp,
  info: Info,
} as const;

function getBulletIconColor(bullet: string, color: "green" | "yellow" | "red"): string {
  if (color === "green") return "#4caf50";
  if (color === "red") return "#f44336";
  const lower = bullet.toLowerCase();
  if (lower.includes("above") || lower.includes("higher")) return "#f44336";
  if (lower.includes("below") || lower.includes("lower")) return "#4caf50";
  return "var(--hamilton-on-surface-variant)";
}

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
    getFinancialsByInstitution(instId).catch(() => []),
    getNationalIndex(),
    getInstitutionRevenueTrend(instId).catch(() => []),
    getInstitutionPeerRanking(instId).catch(() => null),
  ]);

  const indexMap = new Map(nationalIndex.map((e) => [e.fee_category, e]));
  const stateName = inst.state_code ? STATE_NAMES[inst.state_code] : null;
  const charterLabel = inst.charter_type === "bank" ? "Bank" : "Credit Union";
  const tierLabel = inst.asset_size_tier ? FDIC_TIER_LABELS[inst.asset_size_tier] : null;
  const latestFinancial = financials[0] ?? null;
  const districtName = inst.fed_district ? DISTRICT_NAMES[inst.fed_district] : null;

  // Rating engine
  const rating = computeInstitutionRating(fees, nationalIndex);
  const ratingConfig = RATING_CONFIG[rating.color];
  const overdraftFee = fees.find((f) => f.fee_name.toLowerCase().includes("overdraft") && f.amount !== null);
  const interpretation = generateInterpretation({
    rating,
    feeCount: fees.length,
    overdraftAmount: overdraftFee?.amount ?? null,
    charterType: inst.charter_type,
  });

  // Group fees for schedule
  const grouped = new Map<FeeGroupName, typeof fees>();
  for (const g of GROUP_ORDER) grouped.set(g, []);
  for (const f of fees) grouped.get(detectGroup(f.fee_name))!.push(f);

  // Build fee rows with display names + index entries for each group.
  // ExtractedFee has no fee_category field — look up by fee_name directly.
  const groupedRows = new Map<FeeGroupName, {
    id: number;
    fee_name: string;
    amount: number | null;
    frequency: string | null;
    conditions: string | null;
    displayName: string;
    indexEntry: IndexEntry | null;
  }[]>();

  for (const [group, groupFees] of grouped.entries()) {
    groupedRows.set(group, groupFees.map((f) => ({
      id: f.id,
      fee_name: f.fee_name,
      amount: f.amount,
      frequency: f.frequency ?? null,
      conditions: f.conditions ?? null,
      displayName: getDisplayName(f.fee_name),
      indexEntry: indexMap.get(f.fee_name) ?? null,
    })));
  }

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

  // Website and disclosure links — InstitutionDetail includes these fields
  const websiteUrl = inst.website_url ?? null;
  const disclosureUrl = inst.fee_schedule_url ?? null;

  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: "Home", href: "/" },
          { name: "Fee Index", href: "/fees" },
          { name: inst.institution_name, href: `/institution/${instId}` },
        ]}
      />

      <div className="bg-[var(--hamilton-surface)] text-[var(--hamilton-on-surface)] min-h-screen">
        <main className="max-w-4xl mx-auto px-6 md:px-16 py-12">

          {/* ── Institution Header ───────────────────────────────── */}
          <header className="mb-16">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
              <div>
                <span className="font-sans text-[11px] uppercase tracking-widest text-terra mb-2 block">
                  Institution Intelligence
                </span>
                <h1
                  className="text-5xl md:text-6xl tracking-tighter text-[var(--hamilton-on-surface)] mb-4"
                  style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
                >
                  {inst.institution_name}
                </h1>
                <div className="flex flex-wrap items-center gap-y-2 gap-x-6 text-[var(--hamilton-on-surface-variant)] font-sans text-sm">
                  {(inst.city || stateName) && (
                    <div className="flex items-center gap-1.5">
                      <MapPin className="h-[18px] w-[18px]" />
                      {inst.city && stateName ? `${inst.city}, ${stateName}` : inst.city ?? stateName}
                    </div>
                  )}
                  <div className="flex items-center gap-1.5">
                    <Building2 className="h-[18px] w-[18px]" />
                    Charter: {charterLabel}
                  </div>
                  {districtName && (
                    <div className="flex items-center gap-1.5">
                      <Landmark className="h-[18px] w-[18px]" />
                      Fed District: {districtName}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-4">
                {websiteUrl && (
                  <a
                    href={websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-terra font-medium hover:underline text-xs uppercase tracking-wider"
                  >
                    Website <ExternalLink className="h-[14px] w-[14px]" />
                  </a>
                )}
                {disclosureUrl && (
                  <a
                    href={disclosureUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-terra font-medium hover:underline text-xs uppercase tracking-wider"
                  >
                    Full Disclosure <FileText className="h-[14px] w-[14px]" />
                  </a>
                )}
              </div>
            </div>
          </header>

          {/* ── Rating & Interpretation Grid ─────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 mb-16">

            {/* Rating Card */}
            <div
              className="md:col-span-5 p-8 rounded-lg border-l-4 flex flex-col justify-between"
              style={{
                backgroundColor: `${ratingConfig.bg}`,
                borderLeftColor: ratingConfig.border,
              }}
            >
              <div>
                <div className="flex justify-between items-start mb-6">
                  <span
                    className="font-sans text-[11px] uppercase tracking-widest"
                    style={{ color: ratingConfig.labelColor }}
                  >
                    Fee Profile
                  </span>
                  <div
                    className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-tighter text-white"
                    style={{ backgroundColor: ratingConfig.badge }}
                  >
                    {rating.label}
                  </div>
                </div>

                {overdraftFee && overdraftFee.amount !== null && (
                  <div className="mb-8">
                    <span className="font-sans text-xs text-[var(--hamilton-on-surface-variant)] uppercase">Key Indicator</span>
                    <div
                      className="text-5xl text-[var(--hamilton-on-surface)]"
                      style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
                    >
                      {formatAmount(overdraftFee.amount)}
                    </div>
                    <p className="text-sm text-[var(--hamilton-on-surface-variant)] mt-1 font-sans">
                      {getDisplayName(overdraftFee.fee_name)}
                    </p>
                  </div>
                )}

                <ul className="space-y-4">
                  {rating.bullets.map((bullet, i) => {
                    const iconKey = getBulletIcon(bullet, rating.color);
                    const IconComponent = BULLET_ICON_MAP[iconKey];
                    return (
                      <li key={i} className="flex items-start gap-3">
                        <IconComponent
                          className="h-[18px] w-[18px] mt-0.5 flex-shrink-0"
                          style={{ color: getBulletIconColor(bullet, rating.color) }}
                        />
                        <span className="text-sm font-sans leading-relaxed text-[var(--hamilton-on-surface)]">
                          {bullet}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>

            {/* Interpretation & Stats */}
            <div className="md:col-span-7 flex flex-col justify-between py-2">
              <div className="space-y-6">
                <h3
                  className="text-2xl italic text-[var(--hamilton-on-surface)]"
                  style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
                >
                  &ldquo;{interpretation}&rdquo;
                </h3>

                <div className="grid grid-cols-3 gap-4 pt-8">
                  <div className="bg-[var(--hamilton-surface-container-low)] p-6 rounded-lg">
                    <span className="font-sans text-[10px] uppercase tracking-widest text-[var(--hamilton-on-surface-variant)] mb-1 block">
                      Charter
                    </span>
                    <span
                      className="text-xl text-[var(--hamilton-on-surface)]"
                      style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
                    >
                      {charterLabel}
                    </span>
                  </div>
                  <div className="bg-[var(--hamilton-surface-container-low)] p-6 rounded-lg">
                    <span className="font-sans text-[10px] uppercase tracking-widest text-[var(--hamilton-on-surface-variant)] mb-1 block">
                      Assets
                    </span>
                    <span
                      className="text-xl text-[var(--hamilton-on-surface)]"
                      style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
                    >
                      {inst.asset_size ? formatAssets(inst.asset_size) : "N/A"}
                    </span>
                  </div>
                  <div className="bg-[var(--hamilton-surface-container-low)] p-6 rounded-lg">
                    <span className="font-sans text-[10px] uppercase tracking-widest text-[var(--hamilton-on-surface-variant)] mb-1 block">
                      Fees
                    </span>
                    <span
                      className="text-xl text-[var(--hamilton-on-surface)]"
                      style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
                    >
                      {fees.length}
                    </span>
                  </div>
                </div>
              </div>

              {/* Mini CTA */}
              <div className="mt-8 p-6 bg-[var(--hamilton-surface-container-highest)]/50 rounded-xl flex items-center gap-6">
                <div className="text-terra flex-shrink-0">
                  <BarChart2 className="h-[36px] w-[36px]" />
                </div>
                <div>
                  <p className="text-sm font-sans text-[var(--hamilton-on-surface-variant)] leading-relaxed">
                    <span className="font-bold text-[var(--hamilton-on-surface)]">Financial professionals</span>{" "}
                    get access to peer benchmarking, competitive intelligence, and AI-powered research.{" "}
                    <Link href="/pro" className="text-terra font-bold hover:underline">
                      Learn More
                    </Link>
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* ── Fee Schedule ──────────────────────────────────────── */}
          <section className="mt-20">
            <h2
              className="text-3xl mb-10 pb-4 border-b border-[var(--hamilton-outline-variant)]/30"
              style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
            >
              Schedule of Fees
            </h2>

            <div className="space-y-8">
              {GROUP_ORDER.map((group) => {
                const rows = groupedRows.get(group) ?? [];
                if (rows.length === 0) return null;

                return (
                  <FeeGroup
                    key={group}
                    groupName={group}
                    fees={rows}
                    isPrimary={PRIMARY_GROUPS.has(group)}
                    defaultOpen={PRIMARY_GROUPS.has(group)}
                  />
                );
              })}
            </div>
          </section>

          {/* ── Pro Sections (below fee schedule for logged-in pro users) ── */}
          {isPro && (
            <>
              {/* Financial Snapshot */}
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

              {/* Market Context */}
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

              {/* Competitive Scorecard */}
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
                          <div className="rounded-lg bg-white/70 px-3 py-2 text-center">
                            <p className={`text-[24px] font-bold tabular-nums ${scoreColor}`}>{score}</p>
                            <p className={`text-[10px] font-semibold uppercase ${scoreColor}`}>
                              {score >= 70 ? "Competitive" : score >= 40 ? "Mixed" : "Above Market"}
                            </p>
                          </div>
                          <div className="rounded-lg bg-emerald-50/40 px-3 py-2 text-center">
                            <p className="text-[20px] font-bold tabular-nums text-emerald-600">{below.length}</p>
                            <p className="text-[10px] text-emerald-600/70">Below median</p>
                          </div>
                          <div className="rounded-lg bg-[var(--hamilton-surface-container-low)]/40 px-3 py-2 text-center">
                            <p className="text-[20px] font-bold tabular-nums text-[var(--hamilton-on-surface-variant)]">{atMedian.length}</p>
                            <p className="text-[10px] text-[var(--hamilton-text-tertiary)]">At median</p>
                          </div>
                          <div className="rounded-lg bg-red-50/40 px-3 py-2 text-center">
                            <p className="text-[20px] font-bold tabular-nums text-red-600">{above.length}</p>
                            <p className="text-[10px] text-red-600/70">Above median</p>
                          </div>
                        </div>
                        <div className="rounded-lg bg-white/70 px-4 py-3">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--hamilton-text-tertiary)]">Fee-by-Fee Positioning</p>
                            <div className="flex items-center gap-3 text-[9px] text-[var(--hamilton-text-tertiary)]">
                              <span className="flex items-center gap-1"><span className="inline-block w-4 h-[4px] rounded-full bg-[var(--hamilton-outline-variant)]" />P25-P75</span>
                              <span className="flex items-center gap-1"><span className="inline-block w-[2px] h-2.5 bg-[var(--hamilton-text-tertiary)] rounded-full" />Median</span>
                              <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-[var(--hamilton-on-surface-variant)]" />This institution</span>
                            </div>
                          </div>
                          <div className="divide-y divide-[var(--hamilton-outline-variant)]/30">
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
                              const pctColor = pct < 50 ? "text-emerald-600" : pct > 50 ? "text-red-600" : "text-[var(--hamilton-text-tertiary)]";

                              return (
                                <div key={comp.name} className="flex items-center gap-3 py-2">
                                  <span className="w-[120px] sm:w-[140px] shrink-0 text-[12px] text-[var(--hamilton-on-surface-variant)] truncate">{getDisplayName(comp.name)}</span>
                                  <div className="flex-1 relative h-5">
                                    <div className="absolute inset-y-0 left-0 right-0 flex items-center"><div className="w-full h-[3px] rounded-full bg-[var(--hamilton-outline-variant)]/60" /></div>
                                    <div className="absolute top-1/2 -translate-y-1/2 h-[6px] rounded-full bg-[var(--hamilton-outline-variant)]" style={{ left: `${pctP25}%`, width: `${Math.max(pctP75 - pctP25, 1)}%` }} />
                                    <div className="absolute top-1/2 -translate-y-1/2 w-[2px] h-3 bg-[var(--hamilton-text-tertiary)] rounded-full" style={{ left: `${pctMedian}%` }} />
                                    <div className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full border-2 border-white shadow-sm ${isBelow ? "bg-emerald-500" : isAbove ? "bg-red-500" : "bg-[var(--hamilton-on-surface-variant)]"}`} style={{ left: `${pctFee}%` }} />
                                  </div>
                                  <span className="w-[52px] shrink-0 text-right text-[11px] tabular-nums font-medium text-[var(--hamilton-on-surface)]">{formatAmount(comp.amount)}</span>
                                  <span className={`w-[44px] shrink-0 text-right text-[10px] tabular-nums font-semibold ${isBelow ? "text-emerald-600" : isAbove ? "text-red-600" : "text-[var(--hamilton-text-tertiary)]"}`}>
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

              {/* Financial Context */}
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
                    <div className="overflow-x-auto rounded-lg bg-white/60">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-[var(--hamilton-surface-container-low)] border-b border-[var(--hamilton-outline-variant)]/20">
                            <th className="text-left px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-[var(--hamilton-text-tertiary)]">Quarter</th>
                            <th className="text-right px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-[var(--hamilton-text-tertiary)]">SC Income</th>
                            <th className="text-right px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-[var(--hamilton-text-tertiary)]">Fee Ratio</th>
                            <th className="text-right px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-[var(--hamilton-text-tertiary)]">YoY</th>
                          </tr>
                        </thead>
                        <tbody>
                          {revenueTrend.map((q) => (
                            <tr key={q.quarter} className="border-b border-[var(--hamilton-outline-variant)]/20 hover:bg-[var(--hamilton-surface-container-low)]/50 transition-colors">
                              <td className="px-4 py-2 font-medium text-[var(--hamilton-on-surface)]">{q.quarter}</td>
                              <td className="px-4 py-2 text-right tabular-nums text-[var(--hamilton-on-surface)]">{formatAmount(q.service_charge_income)}</td>
                              <td className="px-4 py-2 text-right tabular-nums text-[var(--hamilton-on-surface-variant)]">
                                {q.fee_income_ratio !== null ? `${q.fee_income_ratio.toFixed(1)}%` : <span className="text-[var(--hamilton-text-tertiary)]">&mdash;</span>}
                              </td>
                              <td className="px-4 py-2 text-right tabular-nums">
                                {q.yoy_change_pct !== null ? (
                                  <span className={q.yoy_change_pct >= 0 ? "text-red-600" : "text-emerald-600"}>
                                    {q.yoy_change_pct >= 0 ? "+" : ""}{q.yoy_change_pct.toFixed(1)}%
                                  </span>
                                ) : <span className="text-[var(--hamilton-text-tertiary)]">&mdash;</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </ProSection>
              )}

              {/* Fee Distribution */}
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

              {/* Intelligence & Reports */}
              <ProSection title="Intelligence & Reports" subtitle="Reports and analysis for this institution's peer group.">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--hamilton-text-tertiary)] mb-2">Related Reports</p>
                    <div className="flex flex-wrap gap-2">
                      {relatedReports.length > 0 ? (
                        relatedReports.map((r) => (
                          <Link key={r.slug} href={`/reports/${r.slug}`} className="rounded-full px-4 py-2 text-[12px] font-medium text-[var(--hamilton-on-surface-variant)] bg-[var(--hamilton-surface-container)] hover:bg-[var(--hamilton-surface-container-high)] transition-colors">
                            {r.title}
                          </Link>
                        ))
                      ) : (
                        <p className="text-[13px] text-[var(--hamilton-text-tertiary)]">No peer reports published yet for this segment.</p>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--hamilton-text-tertiary)] mb-2">Ask Hamilton</p>
                    <div className="flex flex-wrap gap-2">
                      <Link href={`/pro/research?prompt=competitive-brief&instId=${instId}`} className="inline-flex items-center gap-2 rounded-full bg-terra/10 px-4 py-2 text-[12px] font-bold text-terra hover:bg-terra/20 transition-colors">
                        Generate a competitive brief
                      </Link>
                      <Link href={`/pro/research?prompt=institution&instId=${instId}`} className="inline-flex items-center gap-2 rounded-full bg-terra/10 px-4 py-2 text-[12px] font-bold text-terra hover:bg-terra/20 transition-colors">
                        Ask about this institution
                      </Link>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <a href={`/api/reports/institution/${instId}?format=html`} target="_blank" rel="noopener noreferrer" className="rounded-full bg-[var(--hamilton-surface-container)] px-4 py-1.5 text-[12px] font-medium text-[var(--hamilton-on-surface-variant)] hover:bg-[var(--hamilton-surface-container-high)] transition-colors no-underline">
                        Fee Report Card
                      </a>
                      {inst.state_code && stateName && (
                        <Link href={`/research/state/${inst.state_code}`} className="rounded-full bg-[var(--hamilton-surface-container)] px-4 py-1.5 text-[12px] font-medium text-[var(--hamilton-on-surface-variant)] hover:bg-[var(--hamilton-surface-container-high)] transition-colors no-underline">
                          {stateName} State Report
                        </Link>
                      )}
                      {inst.fed_district && (
                        <Link href={`/research/district/${inst.fed_district}`} className="rounded-full bg-[var(--hamilton-surface-container)] px-4 py-1.5 text-[12px] font-medium text-[var(--hamilton-on-surface-variant)] hover:bg-[var(--hamilton-surface-container-high)] transition-colors no-underline">
                          District {inst.fed_district} Report
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              </ProSection>
            </>
          )}

          {/* ── Professional CTA Section (hidden for pro users) ──── */}
          {!isPro && <div className="mt-20 p-10 bg-[var(--hamilton-surface-container-low)] rounded-lg">
            <div className="max-w-3xl mx-auto">
              <h3
                className="text-3xl text-[var(--hamilton-on-surface)] mb-4"
                style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
              >
                For Financial Professionals
              </h3>
              <p className="font-sans text-[var(--hamilton-on-surface-variant)] mb-8 text-lg leading-relaxed">
                Go beyond fee listings and understand how this institution compares across peers,
                pricing strategy, and regulatory risk.
              </p>
              <ul className="space-y-4 mb-10">
                <li className="flex items-center gap-3">
                  <BarChart2 className="h-[20px] w-[20px] text-terra" />
                  <span className="font-sans text-[var(--hamilton-on-surface)]">Peer benchmarking &amp; percentile positioning</span>
                </li>
                <li className="flex items-center gap-3">
                  <SlidersHorizontal className="h-[20px] w-[20px] text-terra" />
                  <span className="font-sans text-[var(--hamilton-on-surface)]">Scenario simulation &mdash; what-if fee modeling</span>
                </li>
                <li className="flex items-center gap-3">
                  <AlertTriangle className="h-[20px] w-[20px] text-terra" />
                  <span className="font-sans text-[var(--hamilton-on-surface)]">Complaint-aligned risk signals</span>
                </li>
              </ul>
              <div className="flex flex-col sm:flex-row sm:items-center gap-6">
                <Link
                  href="/pro"
                  className="bg-terra hover:bg-terra-dark text-white px-8 py-3 rounded font-medium transition-all inline-flex items-center gap-2"
                >
                  View Professional Analysis
                  <ArrowRight className="h-[18px] w-[18px]" />
                </Link>
                <p className="text-xs font-sans text-[var(--hamilton-on-surface-variant)]/60 italic">
                  Built for banks, credit unions, and financial analysts
                </p>
              </div>
            </div>
          </div>}

          {/* ── Methodology Footer ───────────────────────────────── */}
          <footer className="mt-32 pt-12 border-t border-[var(--hamilton-outline-variant)]/20 opacity-60">
            <div className="flex flex-col gap-6">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-[18px] w-[18px]" />
                <span className="font-sans text-[10px] uppercase tracking-widest font-bold">
                  Data Methodology Disclosure
                </span>
              </div>
              <p className="font-sans text-xs leading-relaxed max-w-2xl">
                Fee data is extracted from publicly available Deposit Account Agreements and Fee Schedules.
                Rates are current as of the last filing period and may vary by specific account tier or regional promotion.
                Bank Fee Index uses a proprietary normalization engine to compare disparate banking terms against national benchmarks.
                Financial data from{" "}
                {inst.charter_type === "bank" ? "FDIC Call Reports" : "NCUA 5300 Reports"}.
              </p>
              <p className="font-sans text-[10px] italic">
                Source: Federal Reserve System Call Reports &amp; Institutional Disclosure Documents.
              </p>
            </div>
          </footer>

        </main>
      </div>

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
    </>
  );
}

// ---------------------------------------------------------------------------
// Shared tiny components
// ---------------------------------------------------------------------------

function ProSection({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2
        className="text-2xl text-[var(--hamilton-on-surface)]"
        style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
      >
        {title}
      </h2>
      {subtitle && <p className="mt-1 text-[13px] text-[var(--hamilton-on-surface-variant)]">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-[var(--hamilton-surface-container-low)] px-3 py-2.5">
      <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--hamilton-text-tertiary)]">{label}</p>
      <p className="mt-1 text-[14px] font-medium tabular-nums text-[var(--hamilton-on-surface)]">{value}</p>
    </div>
  );
}
