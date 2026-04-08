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
} from "@/lib/fee-taxonomy";
import { DISTRICT_NAMES, FDIC_TIER_LABELS } from "@/lib/fed-districts";
import { formatAmount, formatAssets } from "@/lib/format";
import { getExplainer } from "@/lib/fee-explainers";
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
import { FeeSummaryCard } from "./summary-card";
import { InterpretationBlock } from "./interpretation-block";
import { FeeComparisonBars } from "./fee-comparison-bars";
import { FeeCountCard } from "./fee-count-card";
import { ProsConsBlock } from "./pros-cons-block";
import { MidPageCTA } from "./mid-page-cta";
import { CompareSection } from "./compare-section";
import type { IndexEntry } from "@/lib/crawler-db/fee-index";

interface PageProps {
  params: Promise<{ id: string }>;
}

// ─── Category detection helpers ─────────────────────────────────────────────

type FeeDisplayCategory =
  | "Overdraft / NSF"
  | "Maintenance"
  | "Wire"
  | "ATM"
  | "Service"
  | "Other";

const CATEGORY_ORDER: FeeDisplayCategory[] = [
  "Overdraft / NSF",
  "Maintenance",
  "Wire",
  "ATM",
  "Service",
  "Other",
];

const IMPACT_MAP: Record<FeeDisplayCategory, "High" | "Med" | "Low"> = {
  "Overdraft / NSF": "High",
  "Maintenance": "High",
  "Wire": "Med",
  "ATM": "Med",
  "Service": "Low",
  "Other": "Low",
};

const KEY_CATEGORIES = new Set<FeeDisplayCategory>(["Overdraft / NSF", "Maintenance"]);

function detectFeeCategory(feeName: string): FeeDisplayCategory {
  const n = feeName.toLowerCase();
  if (
    n.includes("overdraft") ||
    n.includes(" od ") ||
    n.startsWith("od_") ||
    n === "od"
  ) {
    return "Overdraft / NSF";
  }
  if (
    n.includes("nsf") ||
    n.includes("returned") ||
    n.includes("insufficient")
  ) {
    return "Overdraft / NSF";
  }
  if (
    n.includes("maintenance") ||
    n.includes("monthly") ||
    n.includes("service charge")
  ) {
    return "Maintenance";
  }
  if (n.includes("wire")) {
    return "Wire";
  }
  if (n.includes("atm")) {
    return "ATM";
  }
  if (
    n.includes("stop payment") ||
    n.includes("cashier") ||
    n.includes("money order") ||
    n.includes("notary") ||
    n.includes("safe deposit") ||
    n.includes("check")
  ) {
    return "Service";
  }
  return "Other";
}

// ─── Fee comparison helpers ──────────────────────────────────────────────────

type ComparisonResult = "above" | "below" | "equal" | "none";

function getComparisonResult(
  amount: number | null,
  median: number | null
): ComparisonResult {
  if (!amount || !median || amount <= 0 || median <= 0) return "none";
  const absDiff = Math.abs(amount - median);
  const pctDiff = absDiff / median;
  if (absDiff <= 1 || pctDiff <= 0.05) return "equal";
  return amount > median ? "above" : "below";
}

function ComparisonArrow({ result }: { result: ComparisonResult }) {
  if (result === "none") return null;
  if (result === "above") {
    return (
      <span
        className="inline-flex items-center gap-0.5 text-[13px] font-semibold text-red-600"
        title="Above national median"
      >
        ↑
      </span>
    );
  }
  if (result === "below") {
    return (
      <span
        className="inline-flex items-center gap-0.5 text-[13px] font-semibold text-emerald-600"
        title="Below national median"
      >
        ↓
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-0.5 text-[13px] font-semibold text-[#A09788]"
      title="At national median"
    >
      =
    </span>
  );
}

function CategoryPill({ category }: { category: FeeDisplayCategory }) {
  return (
    <span className="rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider bg-[#F0EDE8] text-[#A09788]">
      {category}
    </span>
  );
}

function ImpactBadge({ impact }: { impact: "High" | "Med" | "Low" }) {
  const colors =
    impact === "High"
      ? "text-[#C44B2E]/70"
      : impact === "Med"
        ? "text-[#A09788]"
        : "text-[#C4B9A8]";
  return (
    <span className={`text-[10px] font-semibold uppercase tracking-wide ${colors}`}>
      {impact}
    </span>
  );
}

// ─── FeeTableSummary: max 3 bullets for key fees ─────────────────────────────

interface SummaryBullet {
  label: string;
  amount: number;
  comparison: ComparisonResult;
}

function FeeTableSummary({ bullets }: { bullets: SummaryBullet[] }) {
  if (bullets.length === 0) return null;

  const compLabel = (c: ComparisonResult): string => {
    if (c === "above") return "Above average";
    if (c === "below") return "Below average";
    if (c === "equal") return "In line";
    return "";
  };

  const compColor = (c: ComparisonResult): string => {
    if (c === "above") return "text-red-600";
    if (c === "below") return "text-emerald-600";
    if (c === "equal") return "text-[#7A7062]";
    return "text-[#A09788]";
  };

  return (
    <div className="mb-4 rounded-lg border border-[#E8DFD1]/60 bg-[#FAF7F2]/70 px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#A09788] mb-2">
        Key Fees at a Glance
      </p>
      <ul className="space-y-1">
        {bullets.map((b, i) => (
          <li key={i} className="flex items-center gap-2 text-[13px]">
            <span className="text-[#5A5347] font-medium">{b.label}:</span>
            <span className="tabular-nums text-[#1A1815] font-semibold">
              {formatAmount(b.amount)}
            </span>
            {b.comparison !== "none" && (
              <span className={`text-[11px] ${compColor(b.comparison)}`}>
                ({compLabel(b.comparison)})
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Existing helpers ────────────────────────────────────────────────────────

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#E8DFD1]/80 bg-white/70 backdrop-blur-sm px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#A09788]">
        {label}
      </p>
      <p className="mt-1 text-[15px] font-medium tabular-nums text-[#1A1815]">
        {value}
      </p>
    </div>
  );
}

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
        <div className="absolute inset-y-0 left-0 right-0 flex items-center">
          <div className="w-full h-[3px] rounded-full bg-[#E8DFD1]/60" />
        </div>
        <div
          className="absolute top-1/2 -translate-y-1/2 h-[6px] rounded-full bg-[#E8DFD1]"
          style={{ left: `${pctP25}%`, width: `${Math.max(pctP75 - pctP25, 1)}%` }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-[2px] h-3 bg-[#A09788] rounded-full"
          style={{ left: `${pctMedian}%` }}
        />
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
      ) : null}
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
      <td colSpan={6} className="px-4 pb-3 pt-0">
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

async function getRelatedReports(inst: {
  charter_type: string | null;
  asset_size_tier: string | null;
  fed_district: number | null;
}): Promise<{ slug: string; title: string }[]> {
  try {
    const { getSql } = await import("@/lib/crawler-db/connection");
    const db = getSql();
    const rows = await db<{ slug: string; title: string }[]>`
      SELECT slug, title
      FROM published_reports
      WHERE is_public = true
      ORDER BY published_at DESC
      LIMIT 20
    `;
    const keywords: string[] = [];
    if (inst.charter_type)
      keywords.push(inst.charter_type === "bank" ? "bank" : "credit union");
    if (inst.fed_district) keywords.push(`district ${inst.fed_district}`);
    if (inst.asset_size_tier) keywords.push(inst.asset_size_tier);

    const matched = rows.filter((r) => {
      const titleLower = r.title.toLowerCase();
      return keywords.some((kw) => titleLower.includes(kw.toLowerCase()));
    });
    return matched.slice(0, 5);
  } catch {
    return [];
  }
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

export default async function InstitutionProfilePage({ params }: PageProps) {
  const { id } = await params;
  const instId = parseInt(id, 10);
  if (isNaN(instId)) notFound();

  const user = await getCurrentUser();
  const isPro = canAccessPremium(user);

  const inst = await getInstitutionById(instId);
  if (!inst) notFound();

  const fees = (await getFeesByInstitution(instId)).filter(
    (f) => f.review_status !== "rejected"
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

  const relatedReports = await getRelatedReports(inst);

  const nationalMedians = new Map(
    nationalIndex.map((e) => [e.fee_category, e.median_amount])
  );

  const stateName = inst.state_code ? STATE_NAMES[inst.state_code] : null;
  const charterLabel = inst.charter_type === "bank" ? "Bank" : "Credit Union";
  const tierLabel = inst.asset_size_tier ? FDIC_TIER_LABELS[inst.asset_size_tier] : null;
  const latestFinancial = financials[0] ?? null;
  const marketConcentration = await getMarketConcentrationForInstitution(instId);

  // V2 rating engine
  const rating = computeInstitutionRating(fees, nationalIndex);
  const strengthsWatch = deriveStrengthsAndWatch(fees, nationalIndex);

  const overdraftFee = fees.find((f) =>
    f.fee_name.toLowerCase().includes("overdraft") && f.amount !== null
  );
  const overdraftAmount = overdraftFee?.amount ?? null;

  const interpretation = generateInterpretation({
    rating,
    feeCount: fees.length,
    overdraftAmount,
    charterType: inst.charter_type,
  });

  // Build comparison bars for key fee categories
  const COMPARISON_CATEGORIES: Array<{ key: string; label: string }> = [
    { key: "overdraft", label: "Overdraft" },
    { key: "monthly_maintenance", label: "Monthly Maintenance" },
    { key: "wire_domestic_outgoing", label: "Domestic Wire" },
    { key: "nsf", label: "NSF" },
  ];
  const feeByCategory = new Map(fees.map((f) => [f.fee_name, f.amount]));
  const comparisonData = COMPARISON_CATEGORIES.flatMap(({ key, label }) => {
    const instAmt = feeByCategory.get(key);
    const indexEntry = nationalIndex.find((e) => e.fee_category === key);
    if (
      instAmt === null ||
      instAmt === undefined ||
      instAmt <= 0 ||
      !indexEntry ||
      indexEntry.median_amount === null ||
      indexEntry.median_amount <= 0
    ) {
      return [];
    }
    return [{ label, institutionAmount: instAmt, nationalMedian: indexEntry.median_amount }];
  });

  // Build grouped fee rows for enhanced table
  type FeeRow = {
    id: number;
    fee_name: string;
    amount: number | null;
    frequency: string | null;
    conditions: string | null;
    review_status: string;
    displayCategory: FeeDisplayCategory;
    nationalMedian: number | null;
    comparison: ComparisonResult;
    impact: "High" | "Med" | "Low";
    isKeyRow: boolean;
  };

  const feeRows: FeeRow[] = fees.map((f) => {
    const displayCategory = detectFeeCategory(f.fee_name);
    const median = nationalMedians.get(f.fee_name) ?? null;
    const comparison = getComparisonResult(f.amount, median);
    return {
      ...f,
      displayCategory,
      nationalMedian: median,
      comparison,
      impact: IMPACT_MAP[displayCategory],
      isKeyRow: KEY_CATEGORIES.has(displayCategory),
    };
  });

  // Group by display category, sorted by CATEGORY_ORDER
  const groupedFees = new Map<FeeDisplayCategory, FeeRow[]>();
  for (const cat of CATEGORY_ORDER) {
    groupedFees.set(cat, []);
  }
  for (const row of feeRows) {
    groupedFees.get(row.displayCategory)!.push(row);
  }

  // Build FeeTableSummary bullets: pick up to 3 key fees with amounts
  const summaryBullets: SummaryBullet[] = [];
  const SUMMARY_PRIORITY = [
    "overdraft",
    "nsf",
    "monthly_maintenance",
    "wire_domestic_outgoing",
    "atm_non_network",
  ];
  for (const key of SUMMARY_PRIORITY) {
    if (summaryBullets.length >= 3) break;
    const fee = fees.find((f) => f.fee_name === key && f.amount && f.amount > 0);
    if (!fee) continue;
    const median = nationalMedians.get(key) ?? null;
    summaryBullets.push({
      label: getDisplayName(key),
      amount: fee.amount!,
      comparison: getComparisonResult(fee.amount, median),
    });
  }

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
      <nav className="flex items-center gap-2 text-[12px] text-[#A09788] mb-6 sticky top-14 z-30 -mx-6 px-6 py-2 bg-[#FAF7F2]/95 backdrop-blur-sm border-b border-transparent sm:static sm:mx-0 sm:px-0 sm:py-0 sm:bg-transparent sm:backdrop-blur-none sm:border-none [&:not(:hover)]:sm:border-transparent">
        <Link href="/" className="hover:text-[#1A1815] transition-colors">Home</Link>
        <span className="text-[#D4C9BA]">/</span>
        <Link href="/fees" className="hover:text-[#1A1815] transition-colors">Fee Index</Link>
        <span className="text-[#D4C9BA]">/</span>
        <span className="text-[#5A5347] truncate max-w-[200px]">{inst.institution_name}</span>
      </nav>

      {/* ── 1. Institution Header ─────────────────────────────────────── */}
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

      {/* ── 2. Summary Card ──────────────────────────────────────────── */}
      <div className="mt-8 text-center">
        <div className="mx-auto max-w-xl text-left">
          <FeeSummaryCard rating={rating} />
        </div>
      </div>

      {/* ── 3. What This Means ──────────────────────────────────────── */}
      <div className="mt-6 mx-auto max-w-xl">
        <InterpretationBlock text={interpretation} />
      </div>

      {/* ── 4. Key Metrics Row ───────────────────────────────────────── */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <InfoCard label="Charter Type" value={charterLabel} />
        <InfoCard label="Asset Tier" value={tierLabel ?? "Unknown"} />
        <InfoCard label="Total Assets" value={inst.asset_size ? formatAssets(inst.asset_size) : "N/A"} />
        <InfoCard label="Published Fees" value={String(fees.length)} />
      </div>

      {/* ── 5. Fee Count Card ────────────────────────────────────────── */}
      <div className="mt-6">
        <FeeCountCard
          institutionCount={fees.length}
          charterType={inst.charter_type}
        />
      </div>

      {/* ── 6. Fee Comparison Bars ───────────────────────────────────── */}
      {comparisonData.length > 0 && (
        <div className="mt-6">
          <FeeComparisonBars comparisons={comparisonData} />
        </div>
      )}

      {/* ── 7. Fee Table (Enhanced) ──────────────────────────────────── */}
      <section className="mt-8">
        <h2
          className="text-[16px] font-medium text-[#1A1815]"
          style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
        >
          Fee Schedule
        </h2>
        <p className="mt-1 text-[13px] text-[#7A7062]">
          {fees.length} fees extracted from published fee schedule, grouped by category.
        </p>

        {/* Summary bullets above table */}
        <div className="mt-4">
          <FeeTableSummary bullets={summaryBullets} />
        </div>

        <div className="overflow-hidden rounded-xl border border-[#E8DFD1]/80 bg-white/70 backdrop-blur-sm">
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
                <th className="hidden px-4 py-2.5 text-center text-[10px] font-bold uppercase tracking-[0.1em] text-[#A09788] md:table-cell">
                  vs. Median
                </th>
                <th className="hidden px-4 py-2.5 text-center text-[10px] font-bold uppercase tracking-[0.1em] text-[#A09788] lg:table-cell">
                  Impact
                </th>
                <th className="hidden px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[#A09788] lg:table-cell">
                  Category
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8DFD1]/40">
              {CATEGORY_ORDER.map((cat) => {
                const rows = groupedFees.get(cat) ?? [];
                if (rows.length === 0) return null;

                return (
                  <>
                    {/* Category group header */}
                    <tr key={`header-${cat}`} className="bg-[#FAF7F2]/40">
                      <td
                        colSpan={6}
                        className="px-4 py-1.5"
                      >
                        <h3 className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#A09788]">
                          {cat}
                        </h3>
                      </td>
                    </tr>

                    {/* Fee rows */}
                    {rows.map((fee) => {
                      const showCallout =
                        fee.amount !== null &&
                        fee.amount > 0 &&
                        getExplainer(fee.fee_name) !== null;

                      return (
                        <>
                          <tr
                            key={fee.id}
                            className={`hover:bg-[#FAF7F2]/60 transition-colors ${
                              fee.isKeyRow
                                ? "border-l-2 border-l-[#C44B2E]"
                                : "border-l-2 border-l-transparent"
                            }`}
                          >
                            <td className="px-4 py-2.5">
                              <span className="font-medium text-[#1A1815]">
                                {getDisplayName(fee.fee_name)}
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
                              {fee.frequency ?? (
                                <span className="text-[#C4B9A8] text-[11px]">—</span>
                              )}
                            </td>
                            <td className="hidden px-4 py-2.5 text-center md:table-cell">
                              <ComparisonArrow result={fee.comparison} />
                            </td>
                            <td className="hidden px-4 py-2.5 text-center lg:table-cell">
                              <ImpactBadge impact={fee.impact} />
                            </td>
                            <td className="hidden px-4 py-2.5 lg:table-cell">
                              <CategoryPill category={fee.displayCategory} />
                            </td>
                          </tr>
                          {showCallout && (
                            <FeeCallout
                              key={`callout-${fee.id}`}
                              category={fee.fee_name}
                              amount={fee.amount!}
                              institutionName={inst.institution_name}
                              charterLabel={charterLabel}
                              nationalMedian={fee.nationalMedian}
                            />
                          )}
                        </>
                      );
                    })}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── 8. Compare Section ───────────────────────────────────────── */}
      <CompareSection
        stateCode={inst.state_code}
        charterType={inst.charter_type}
        stateName={stateName}
      />

      {/* ── Pro-only: Financial Snapshot ─────────────────────────────── */}
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

      {/* ── Pro-only: Market Context ──────────────────────────────────── */}
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

      {/* ── Pro-only: Competitive Position ───────────────────────────── */}
      {isPro && (
        <CompetitiveScorecard
          fees={fees}
          indexEntries={nationalIndex}
          isPro={isPro}
          charterType={charterLabel}
          tierLabel={tierLabel ?? "Unknown"}
        />
      )}

      {/* ── Pro-only: Financial Context (Call Reports) ───────────────── */}
      {isPro && (revenueTrend.length > 0 || peerRanking) && (
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
                          : <span className="text-[#A09788]">—</span>}
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

      {/* ── Pro-only: Fee Distribution ────────────────────────────────── */}
      {isPro && distributionData.length >= 2 && (
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

      {/* ── Strengths / Watch (all users) ────────────────────────────── */}
      {(strengthsWatch.strengths.length > 0 || strengthsWatch.watch.length > 0) && (
        <div className="mt-8">
          <ProsConsBlock
            strengths={strengthsWatch.strengths}
            watch={strengthsWatch.watch}
          />
        </div>
      )}

      {/* ── 9. CTA (bottom only) ─────────────────────────────────────── */}
      {isPro ? (
        <section className="mt-10">
          <h2
            className="text-[16px] font-medium text-[#1A1815]"
            style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
          >
            Intelligence &amp; Reports
          </h2>
          <p className="mt-1 text-[13px] text-[#7A7062]">
            Reports and analysis for this institution&apos;s peer group.
          </p>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#A09788]">
                Related Reports
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {relatedReports.length > 0 ? (
                  relatedReports.map((r) => (
                    <Link
                      key={r.slug}
                      href={`/reports/${r.slug}`}
                      className="rounded-full border border-[#E8DFD1] px-4 py-2 text-[12px] font-medium text-[#5A5347] hover:border-[#C44B2E]/30 hover:text-[#C44B2E] transition-colors"
                    >
                      {r.title}
                    </Link>
                  ))
                ) : (
                  <p className="text-[13px] text-[#A09788]">
                    No peer reports published yet for this segment.
                  </p>
                )}
              </div>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#A09788]">
                Ask Hamilton
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Link
                  href={`/pro/research?prompt=competitive-brief&instId=${instId}`}
                  className="inline-flex items-center gap-2 rounded-full border border-[#C44B2E]/30 bg-[#C44B2E]/5 px-4 py-2 text-[12px] font-bold text-[#C44B2E] hover:bg-[#C44B2E]/10 transition-colors"
                >
                  Generate a competitive brief
                </Link>
                <Link
                  href={`/pro/research?prompt=institution&instId=${instId}`}
                  className="inline-flex items-center gap-2 rounded-full border border-[#C44B2E]/30 bg-[#C44B2E]/5 px-4 py-2 text-[12px] font-bold text-[#C44B2E] hover:bg-[#C44B2E]/10 transition-colors"
                >
                  Ask about this institution
                </Link>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <a
                  href={`/api/reports/institution/${instId}?format=html`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full border border-[#E8DFD1] px-4 py-1.5 text-[12px] font-medium text-[#5A5347] hover:border-[#C44B2E]/30 hover:text-[#C44B2E] transition-colors no-underline"
                >
                  Fee Report Card
                </a>
                {inst.state_code && stateName && (
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
            </div>
          </div>
        </section>
      ) : (
        <div className="mt-10">
          <MidPageCTA />
        </div>
      )}

      {/* ── Methodology ───────────────────────────────────────────────── */}
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
