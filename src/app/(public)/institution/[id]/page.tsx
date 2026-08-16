export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BarChart2,
  Building2,
  CheckCircle2,
  Clock3,
  ClipboardCheck,
  Database,
  ExternalLink,
  FileText,
  Landmark,
  MapPin,
  MessageSquareText,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import {
  getFeesByInstitution,
  getFinancialsByInstitution,
  getNationalIndexCached,
  getPublicInstitutionById,
} from "@/lib/data-store";
import {
  getInstitutionFeeScheduleEvidence,
  getInstitutionSubmissionState,
} from "@/lib/data-store/institution";
import { getDisplayName } from "@/lib/fee-taxonomy";
import { DISTRICT_NAMES, FDIC_TIER_LABELS } from "@/lib/fed-districts";
import {
  formatAmount,
  formatAssets,
  formatCompactDollars,
  formatStoredPercent,
} from "@/lib/format";
import { STATE_NAMES } from "@/lib/us-states";
import { BreadcrumbJsonLd } from "@/components/breadcrumb-jsonld";
import { SITE_URL } from "@/lib/constants";
import {
  computeInstitutionRating,
  generateInterpretation,
} from "@/lib/institution-rating";
import {
  getFeePublicationStatusLabel,
  getInstitutionSourceNeededReasonLabel,
  type FeePublicationStatus,
} from "@/lib/institution-quality";
import { getAutomationControl } from "@/lib/automation-control";
import { buildInstitutionProfileLinks } from "@/lib/institution-profile-links";

interface PageProps {
  params: Promise<{ id: string }>;
}

interface DisplayFee {
  id: string;
  feeName: string;
  feeCategory: string | null;
  amount: number | null;
  frequency: string | null;
  conditions: string | null;
  status: "verified" | "provisional";
  extractionConfidence: number | null;
  sourceUrl: string | null;
}

const STATUS_COPY: Record<FeePublicationStatus, string> = {
  verified:
    "Approved fee observations are available. Benchmark scores on this page use verified rows only.",
  provisional:
    "Fee observations are available but have not cleared verification. They are shown for directional exploration and excluded from verified benchmark scores.",
  under_review:
    "A fee source or extraction attempt is on record, but no public fee row has cleared review yet.",
  unavailable:
    "This institution is tracked, but no usable public consumer fee data is available yet.",
};

const STATUS_TONE: Record<FeePublicationStatus, string> = {
  verified: "border-emerald-200 bg-emerald-50 text-emerald-800",
  provisional: "border-amber-200 bg-amber-50 text-amber-900",
  under_review: "border-[#E8DFD1] bg-[#FFF8EC] text-[#6B4A12]",
  unavailable: "border-[#E8DFD1] bg-white text-[#7A7062]",
};

const STATUS_ICON = {
  verified: CheckCircle2,
  provisional: AlertTriangle,
  under_review: Clock3,
  unavailable: Database,
} satisfies Record<FeePublicationStatus, LucideIcon>;

const getPublicInstitutionForPage = cache(getPublicInstitutionById);

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const instId = parseInt(id, 10);
  if (Number.isNaN(instId)) return { title: "Institution Not Found" };

  const inst = await getPublicInstitutionForPage(instId);
  if (!inst) return { title: "Institution Not Found" };

  const stateName = inst.state_code ? STATE_NAMES[inst.state_code] : null;
  const charterLabel = inst.charter_type === "bank" ? "Bank" : "Credit Union";

  return {
    title: `${inst.institution_name} Fee Data Status`,
    description: `${inst.institution_name}${stateName ? ` in ${stateName}` : ""} is tracked by Bank Fee Index with public fee status, source quality, financial context, and next validation steps.`,
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
  if (Number.isNaN(instId)) notFound();

  const instPromise = getPublicInstitutionForPage(instId);
  const financialsPromise = withFallback(
    getFinancialsByInstitution(instId, 4),
    [],
    "financial context",
  );
  const inst = await instPromise;
  if (!inst) notFound();

  const catalogVisibleFeeCount = Number(inst.fee_count ?? 0);
  const status = inst.fee_publication_status ?? "unavailable";
  const statusLabel = getFeePublicationStatusLabel(status);
  const sourceNeeded =
    inst.insight_readiness === "source_needed" || status === "unavailable";
  const sourceReasonLabel = getInstitutionSourceNeededReasonLabel(
    inst.source_needed_reason ?? "official_source_missing",
  );
  const validationNeeded = sourceNeeded || status === "under_review";
  const emptySubmissionState = {
    status: "none" as const,
    label: "No source submission recorded.",
    submission_count: 0,
    pending_count: 0,
    accepted_count: 0,
    rejected_count: 0,
    needs_info_count: 0,
    latest_submission: null,
  };

  const trustWorkflowPromise = validationNeeded
    ? Promise.all([
        withFallback(getInstitutionSubmissionState(instId), emptySubmissionState, "source submissions"),
        withFallback(getAutomationControl(), null, "automation state"),
      ])
    : Promise.resolve([emptySubmissionState, null] as const);
  const feesPromise = catalogVisibleFeeCount > 0
    ? withFallback(getFeesByInstitution(instId), [], "published fee rows")
    : Promise.resolve([]);
  const shouldLoadPipelineEvidence =
    catalogVisibleFeeCount === 0 &&
    Boolean(
      inst.fee_schedule_url ||
        inst.latest_source_status ||
        (inst.latest_extracted_fee_count ?? 0) > 0,
    );
  const evidencePromise = shouldLoadPipelineEvidence
    ? withFallback(getInstitutionFeeScheduleEvidence(instId), null, "fee evidence")
    : Promise.resolve(null);
  const [allFees, evidence, financials, [submissionState, automationControl]] = await Promise.all([
    feesPromise,
    evidencePromise,
    financialsPromise,
    trustWorkflowPromise,
  ]);
  const visibleFees = allFees.filter((fee) => fee.review_status !== "rejected");
  const latestFinancial = financials[0] ?? null;
  const revenueTrend = financials.map((financial) => ({
    quarter: formatReportQuarter(financial.report_date),
    service_charge_income: financial.service_charge_income,
    fee_income_ratio: financial.fee_income_ratio,
    yoy_change_pct: null,
  }));

  const verifiedFees = visibleFees.filter((fee) => fee.review_status === "approved");
  const provisionalFees = visibleFees.filter((fee) => fee.review_status !== "approved");
  const catalogFeeRows: DisplayFee[] = visibleFees.map((fee) => ({
    id: `catalog-${fee.id}`,
    feeName: fee.fee_name,
    feeCategory: fee.fee_category ?? null,
    amount: fee.amount,
    frequency: fee.frequency,
    conditions: fee.conditions,
    status: fee.review_status === "approved" ? "verified" : "provisional",
    extractionConfidence: fee.extraction_confidence,
    sourceUrl: fee.source_url ?? null,
  }));
  const pipelineProvisionalRows: DisplayFee[] =
    catalogFeeRows.length === 0 && evidence
      ? [
          ...evidence.verified_fee_preview
            .filter((fee) => fee.review_status !== "rejected")
            .map((fee) => ({
              id: `verified-${fee.fee_verified_id}`,
              feeName: fee.fee_name,
              feeCategory: fee.canonical_fee_key,
              amount: fee.amount,
              frequency: fee.frequency,
              conditions: null,
              status: "provisional" as const,
              extractionConfidence: fee.extraction_confidence,
              sourceUrl: fee.source_url,
            })),
          ...evidence.raw_fee_preview.map((fee) => ({
            id: `raw-${fee.fee_raw_id}`,
            feeName: fee.fee_name,
            feeCategory: null,
            amount: fee.amount,
            frequency: fee.frequency,
            conditions: fee.conditions,
            status: "provisional" as const,
            extractionConfidence: fee.extraction_confidence,
            sourceUrl: fee.source_url,
          })),
        ].slice(0, 18)
      : [];
  const feeRows = [...catalogFeeRows, ...pipelineProvisionalRows];
  const pipelineCounts = evidence?.pipeline_counts ?? null;
  const pipelineProvisionalCount = pipelineCounts
    ? Math.max(
        0,
        (pipelineCounts.raw_without_verified_count ?? 0) +
          (pipelineCounts.verified_without_published_count ?? 0),
      )
    : pipelineProvisionalRows.length;

  const nationalIndex = verifiedFees.length > 0 ? await getNationalIndexCached().catch(() => []) : [];
  const rating = verifiedFees.length > 0 ? computeInstitutionRating(verifiedFees, nationalIndex) : null;
  const overdraftFee = verifiedFees.find(
    (fee) => fee.fee_name.toLowerCase().includes("overdraft") && fee.amount !== null,
  );
  const interpretation = rating
    ? generateInterpretation({
        rating,
        feeCount: verifiedFees.length,
        overdraftAmount: overdraftFee?.amount ?? null,
        charterType: inst.charter_type,
      })
    : null;

  const stateName = inst.state_code ? STATE_NAMES[inst.state_code] : null;
  const charterLabel = inst.charter_type === "bank" ? "Bank" : "Credit Union";
  const districtName = inst.fed_district ? DISTRICT_NAMES[inst.fed_district] : null;
  const tierLabel = inst.asset_size_tier
    ? FDIC_TIER_LABELS[inst.asset_size_tier] ?? inst.asset_size_tier
    : null;
  const StatusIcon = STATUS_ICON[status];
  const latestCollected = formatDate(inst.latest_source_collected_at ?? null);
  const {
    submitSourceHref,
    claimReviewHref,
    analyzeHref,
    briefHref,
    scenarioHref,
  } = buildInstitutionProfileLinks({
    institutionId: instId,
    institutionName: inst.institution_name,
  });
  const hasSubmittedSource = submissionState.status !== "none";
  const trustQueueLabel = hasSubmittedSource ? submissionState.label : sourceReasonLabel;
  const automationPaused = automationControl ? !automationControl.enabled : false;
  const verifiedCount = inst.published_fee_count ?? verifiedFees.length;
  const provisionalCount = Math.max(
    inst.provisional_fee_count ?? 0,
    provisionalFees.length,
    pipelineProvisionalCount,
  );
  const rowPreviewUnavailable = feeRows.length === 0 && provisionalCount > 0;
  const hasSourceEvidence = Boolean(
    inst.fee_schedule_url ||
      evidence?.latest_document ||
      inst.latest_source_status ||
      latestCollected ||
      hasSubmittedSource,
  );
  const hasExtractionEvidence = Boolean(
    feeRows.length > 0 ||
      (inst.latest_extracted_fee_count ?? 0) > 0 ||
      (pipelineCounts?.raw_fee_count ?? 0) > 0 ||
      (pipelineCounts?.verified_fee_count ?? 0) > 0,
  );
  const hasReviewEvidence = Boolean(
    verifiedCount > 0 ||
      provisionalCount > 0 ||
      (pipelineCounts?.verified_fee_count ?? 0) > 0,
  );
  const readinessSteps = [
    {
      label: "Source",
      value: hasSourceEvidence ? (hasSubmittedSource && !inst.fee_schedule_url ? "Submitted" : "Found") : "Needed",
      complete: hasSourceEvidence,
    },
    {
      label: "Extraction",
      value: hasExtractionEvidence ? "Rows detected" : "Waiting",
      complete: hasExtractionEvidence,
    },
    {
      label: "Review",
      value: hasReviewEvidence ? statusLabel : "Not started",
      complete: hasReviewEvidence,
    },
    {
      label: "Benchmark",
      value: verifiedCount > 0 ? "Scored" : "Withheld",
      complete: verifiedCount > 0,
    },
  ];

  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: "Home", href: "/" },
          { name: "Institutions", href: "/institutions" },
          { name: inst.institution_name, href: `/institution/${instId}` },
        ]}
      />

      <main className="min-h-screen bg-[#FAF7F2] text-[#1A1815]">
        <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-7">
          <header className="fi-reveal mb-5">
            <div className="grid gap-5 border-b border-[#D8CBB8] pb-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-end">
              <div className="min-w-0">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <StatusBadge status={status} label={statusLabel} />
                  {tierLabel && (
                    <span className="rounded-md border border-[#E8DFD1] bg-white px-2 py-1 text-[11px] font-medium text-[#7A7062]">
                      {tierLabel}
                    </span>
                  )}
                </div>
                <h1
                  className="max-w-4xl break-words text-4xl font-normal leading-[1.02] tracking-tight text-[#1A1815] sm:text-5xl"
                  style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
                >
                  {inst.institution_name}
                </h1>
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-[#7A7062]">
                  {(inst.city || stateName) && (
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin className="h-4 w-4" />
                      {inst.city && stateName ? `${inst.city}, ${stateName}` : inst.city ?? stateName}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1.5">
                    <Building2 className="h-4 w-4" />
                    {charterLabel}
                  </span>
                  {districtName && (
                    <span className="inline-flex items-center gap-1.5">
                      <Landmark className="h-4 w-4" />
                      {districtName}
                    </span>
                  )}
                </div>
              </div>

              <div className="min-w-0 border-t border-[#E8DFD1] pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#A69D90]">
                  Evidence Snapshot
                </p>
                <div className="mt-3 grid grid-cols-3 divide-x divide-[#E8DFD1] border-y border-[#E8DFD1] bg-[#FFFDF9]">
                  <SnapshotFact label="Verified" value={verifiedCount.toLocaleString()} tone="verified" />
                  <SnapshotFact label="Provisional" value={provisionalCount.toLocaleString()} tone="provisional" />
                  <SnapshotFact label="Score" value={rating ? rating.label : "Withheld"} />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {inst.website_url && (
                    <a
                      href={inst.website_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-1.5 rounded-md border border-[#D5CBBF] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#1A1815] transition-colors hover:border-[#C44B2E] hover:text-[#C44B2E]"
                    >
                      Website
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                  {inst.fee_schedule_url && (
                    <a
                      href={inst.fee_schedule_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-1.5 rounded-md border border-[#D5CBBF] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#1A1815] transition-colors hover:border-[#C44B2E] hover:text-[#C44B2E]"
                    >
                      Source disclosure
                      <FileText className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          </header>

          <section className={`fi-reveal fi-reveal-delay-1 mb-0 border-y px-0 py-4 ${STATUS_TONE[status]}`}>
            <div className="flex gap-3">
              <StatusIcon className="mt-0.5 h-5 w-5 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-bold">{statusLabel}</p>
                <p className="mt-1 max-w-3xl text-sm leading-relaxed">{STATUS_COPY[status]}</p>
                {latestCollected && (
                  <p className="mt-2 text-xs font-medium">
                    Latest source collection: {latestCollected}
                  </p>
                )}
                {hasSubmittedSource && (
                  <p className="mt-2 text-xs font-medium">
                    {submissionState.label}
                    {submissionState.latest_submission
                      ? ` Submitted ${formatDate(submissionState.latest_submission.created_at) ?? submissionState.latest_submission.created_at}.`
                      : ""}
                  </p>
                )}
              </div>
            </div>
          </section>

          <section className="fi-reveal fi-reveal-delay-1 mb-6 border-b border-[#E8DFD1] py-4">
            <div className="grid gap-2 sm:grid-cols-4">
              {readinessSteps.map((step, index) => (
                <ReadinessStep
                  key={step.label}
                  label={step.label}
                  value={step.value}
                  complete={step.complete}
                  showArrow={index < readinessSteps.length - 1}
                />
              ))}
            </div>
          </section>

          {validationNeeded && (
            <section className="fi-reveal fi-reveal-delay-2 mb-5 border border-[#E8DFD1] bg-white p-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex min-w-0 gap-3">
                  <ClipboardCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#C44B2E]" />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[#1A1815]">
                      {trustQueueLabel}
                    </p>
                    <p className="mt-1 max-w-3xl text-sm leading-relaxed text-[#5A5347]">
                      {hasSubmittedSource
                        ? "This profile has a submitted source in the trust workflow. The public page will update after review and validation."
                        : sourceNeeded
                        ? "This profile has identity and financial context, but no usable official fee source. Submit a fee schedule URL or claim the profile so review can start."
                        : "A source or extraction attempt exists, but the fee evidence still needs validation before Hamilton can make benchmark-grade conclusions."}
                    </p>
                    {automationPaused && (
                      <p className="mt-2 text-xs font-medium text-[#7A7062]">
                        Automated extraction is paused; submitted sources are queued for deterministic review and later extraction.
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col gap-2 sm:flex-row lg:flex-col">
                  <Link
                    href={submitSourceHref}
                    className="inline-flex items-center justify-center gap-2 rounded-md bg-[#C44B2E] px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#A83D25]"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    {hasSubmittedSource ? "Add another source" : "Submit official source"}
                  </Link>
                  <Link
                    href={claimReviewHref}
                    className="inline-flex items-center justify-center gap-2 rounded-md border border-[#D5CBBF] bg-white px-3 py-2 text-xs font-semibold text-[#1A1815] transition-colors hover:border-[#C44B2E] hover:text-[#C44B2E]"
                  >
                    Claim or validate
                  </Link>
                </div>
              </div>
            </section>
          )}

          <section className="fi-reveal fi-reveal-delay-2 mb-6 overflow-hidden border border-[#E8DFD1] bg-white">
            <div className="grid divide-y divide-[#E8DFD1] sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
              <Metric label="Verified fee rows" value={verifiedCount.toLocaleString()} tone="verified" />
              <Metric label="Provisional fee rows" value={provisionalCount.toLocaleString()} tone="provisional" />
              <Metric label="Assets" value={inst.asset_size ? formatAssets(inst.asset_size) : "N/A"} />
              <Metric label="Fee benchmark score" value={rating ? rating.label : "Not scored"} />
            </div>
          </section>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
            <div className="min-w-0 space-y-6">
              {rating && interpretation && (
                <section className="border border-[#E8DFD1] bg-white p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#A69D90]">
                        Verified Fee Profile
                      </p>
                      <h2 className="mt-2 text-xl font-semibold text-[#1A1815]">
                        {rating.label}
                      </h2>
                      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#5A5347]">
                        {interpretation}
                      </p>
                    </div>
                    {overdraftFee?.amount !== null && overdraftFee?.amount !== undefined && (
                      <div className="rounded-lg border border-[#E8DFD1] bg-[#FAF7F2] px-4 py-3">
                        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#A69D90]">
                          Overdraft
                        </p>
                        <p
                          className="mt-1 text-3xl text-[#1A1815]"
                          style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
                        >
                          {formatAmount(overdraftFee.amount)}
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="mt-4 grid gap-2 sm:grid-cols-3">
                    {rating.bullets.map((bullet) => (
                      <div key={bullet} className="rounded-md border border-[#E8DFD1] bg-[#FFFDF9] px-3 py-2 text-sm text-[#5A5347]">
                        {bullet}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <section className="border border-[#E8DFD1] bg-white">
                <div className="border-b border-[#E8DFD1] px-4 py-3 sm:px-5">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#A69D90]">
                        Fee Schedule
                      </p>
                      <h2 className="text-lg font-semibold text-[#1A1815]">
                        Public fee observations
                      </h2>
                    </div>
                    <p className="text-xs text-[#7A7062]">
                      Verified rows power benchmarks; provisional rows do not.
                    </p>
                  </div>
                </div>

                {status === "provisional" && (
                  <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:px-5">
                    Provisional amounts may change after review. Use them as source-backed context, not final benchmark evidence.
                  </div>
                )}

                {feeRows.length > 0 ? (
                  <div className="divide-y divide-[#E8DFD1]">
                    {feeRows.map((fee) => (
                      <FeeObservationRow
                        key={fee.id}
                        fee={fee}
                        disclosureUrl={inst.fee_schedule_url}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="px-4 py-8 sm:px-5">
                    <div className="flex gap-3 rounded-lg border border-[#E8DFD1] bg-[#FAF7F2] p-4">
                      <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#7A7062]" />
                      <div>
                        <p className="text-sm font-semibold text-[#1A1815]">
                          {rowPreviewUnavailable
                            ? "Fee row preview is temporarily unavailable."
                            : "No public fee rows are available yet."}
                        </p>
                        <p className="mt-1 text-sm leading-relaxed text-[#7A7062]">
                          {rowPreviewUnavailable
                            ? "This profile has provisional fee evidence, but the detailed row preview did not resolve quickly enough for this page load. The status and counts remain visible; refresh or continue into Pro for deeper analysis."
                            : "This profile is still useful for identity and financial context, but fee comparisons are intentionally withheld until fee observations clear review."}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </section>

              <section className="border border-[#E8DFD1] bg-white p-5">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#A69D90]">
                      Financial Context
                    </p>
                    <h2 className="text-lg font-semibold text-[#1A1815]">
                      Revenue signal
                    </h2>
                  </div>
                  {latestFinancial && (
                    <p className="text-xs text-[#7A7062]">
                      {latestFinancial.source.toUpperCase()} report: {latestFinancial.report_date}
                    </p>
                  )}
                </div>

                {latestFinancial ? (
                  <>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      <Metric framed label="Total assets" value={formatCompactDollars(latestFinancial.total_assets)} />
                      <Metric framed label="Total deposits" value={formatCompactDollars(latestFinancial.total_deposits)} />
                      <Metric framed label="Service charge income" value={formatCompactDollars(latestFinancial.service_charge_income)} />
                      <Metric framed label="Fee income ratio" value={formatFinancialRatio(latestFinancial.fee_income_ratio)} />
                      <Metric framed label="ROA" value={formatStoredPercent(latestFinancial.roa, 2)} />
                      <Metric framed label="Branches" value={latestFinancial.branch_count?.toLocaleString() ?? "N/A"} />
                    </div>

                    {revenueTrend.length > 0 && (
                      <div className="mt-5 rounded-lg border border-[#E8DFD1] bg-[#FAF7F2] p-4">
                        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#A69D90]">
                          Recent revenue trend
                        </p>
                        <div className="mt-3 space-y-2">
                          {revenueTrend.slice(0, 4).map((quarter, index) => (
                            <div key={`${quarter.quarter}-${index}`} className="flex items-center justify-between gap-3 text-sm">
                              <span className="font-medium text-[#1A1815]">{quarter.quarter}</span>
                              <span className="tabular-nums text-[#5A5347]">
                                {formatCompactDollars(quarter.service_charge_income)}
                              </span>
                              <span className="w-16 text-right text-xs tabular-nums text-[#7A7062]">
                                {formatTrendPercent(quarter.yoy_change_pct)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="mt-4 rounded-lg border border-[#E8DFD1] bg-[#FAF7F2] p-4 text-sm text-[#7A7062]">
                    Financial context is not available for this institution in the current dataset.
                  </p>
                )}
              </section>
            </div>

            <aside className="min-w-0 space-y-6 lg:sticky lg:top-6">
              <section className="border border-[#E8DFD1] bg-white p-5">
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#A69D90]">
                  Key Facts
                </p>
                <div className="mt-4 space-y-3 text-sm">
                  <Fact label="Charter" value={charterLabel} />
                  <Fact label="Location" value={[inst.city, stateName].filter(Boolean).join(", ") || "N/A"} />
                  <Fact label="Asset tier" value={tierLabel ?? "N/A"} />
                  <Fact label="Fed district" value={districtName ?? "N/A"} />
                  <Fact label="Verified rows" value={verifiedCount.toLocaleString()} />
                  <Fact label="Provisional rows" value={provisionalCount.toLocaleString()} />
                  <Fact label="Source submission" value={hasSubmittedSource ? submissionState.label : "None recorded"} />
                  <Fact label="Source status" value={inst.latest_source_status ?? "N/A"} />
                  <Fact label="Last collected" value={latestCollected ?? "N/A"} />
                </div>
              </section>

              <section className="border border-[#1A1815] bg-[#1A1815] p-5 text-white">
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#D4A574]">
                  Pro Preview
                </p>
                <h2 className="mt-2 text-lg font-semibold">
                  Institution-aware analysis
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-[#E8DFD1]">
                  Hamilton will start with this institution selected, including fee status, asset tier, district, financials, peer ranking, and quality signals.
                </p>
                <div className="mt-4 grid gap-2">
                  <Link
                    href={briefHref}
                    className="inline-flex items-center justify-center gap-2 rounded-md bg-[#C44B2E] px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#A83D25]"
                  >
                    <BarChart2 className="h-4 w-4" />
                    Generate competitive brief
                  </Link>
                  <Link
                    href={analyzeHref}
                    className="inline-flex items-center justify-center gap-2 rounded-md border border-[#5A5347] px-3 py-2 text-sm font-semibold text-white transition-colors hover:border-[#D4A574]"
                  >
                    <MessageSquareText className="h-4 w-4" />
                    Ask about this institution
                  </Link>
                  <Link
                    href={scenarioHref}
                    className="inline-flex items-center justify-center gap-2 rounded-md border border-[#5A5347] px-3 py-2 text-sm font-semibold text-white transition-colors hover:border-[#D4A574]"
                  >
                    <FileText className="h-4 w-4" />
                    Run scenario
                  </Link>
                  {sourceNeeded && (
                    <Link
                      href={submitSourceHref}
                      className="inline-flex items-center justify-center gap-2 rounded-md border border-[#5A5347] px-3 py-2 text-sm font-semibold text-white transition-colors hover:border-[#D4A574]"
                    >
                      <ClipboardCheck className="h-4 w-4" />
                      Add source
                    </Link>
                  )}
                </div>
              </section>

              <section className="border border-[#E8DFD1] bg-white p-5">
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#A69D90]">
                  Methodology
                </p>
                <div className="mt-3 space-y-3 text-sm leading-relaxed text-[#5A5347]">
                  <p>
                    Verified fee rows have cleared review and may be used in Bank Fee Index benchmark calculations.
                  </p>
                  <p>
                    Provisional rows are visible for exploration with confidence and source labels, but are excluded from verified benchmark scores until approved.
                  </p>
                  <p>
                    Financial metrics come from public call-report style records. Percent metrics are displayed as stored, without automatic multiplication.
                  </p>
                </div>
              </section>
            </aside>
          </div>
        </div>
      </main>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FinancialService",
            name: inst.institution_name,
            description: `${statusLabel} profile for ${inst.institution_name}`,
            url: `${SITE_URL}/institution/${instId}`,
            address: inst.state_code
              ? { "@type": "PostalAddress", addressRegion: inst.state_code }
              : undefined,
          }).replace(/</g, "\\u003c"),
        }}
      />
    </>
  );
}

function StatusBadge({
  status,
  label,
}: {
  status: FeePublicationStatus;
  label: string;
}) {
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-1 text-[11px] font-semibold ${STATUS_TONE[status]}`}>
      {label}
    </span>
  );
}

function SnapshotFact({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "verified" | "provisional";
}) {
  const valueClass =
    tone === "verified"
      ? "text-emerald-700"
      : tone === "provisional"
        ? "text-amber-800"
        : "text-[#1A1815]";

  return (
    <div className="min-w-0 px-3 py-2">
      <p className="truncate text-[9px] font-bold uppercase tracking-[0.14em] text-[#A69D90]">
        {label}
      </p>
      <p className={`mt-1 truncate text-sm font-semibold tabular-nums ${valueClass}`} title={value}>
        {value}
      </p>
    </div>
  );
}

function ReadinessStep({
  label,
  value,
  complete,
  showArrow,
}: {
  label: string;
  value: string;
  complete: boolean;
  showArrow: boolean;
}) {
  return (
    <div className="relative min-w-0 border border-[#E8DFD1] bg-[#FFFDF9] px-3 py-2">
      <div className="flex items-center gap-2">
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${
            complete ? "bg-[#C44B2E]" : "border border-[#C4B89F] bg-white"
          }`}
        />
        <p className="truncate text-[10px] font-bold uppercase tracking-[0.13em] text-[#A69D90]">
          {label}
        </p>
        {showArrow && (
          <ArrowRight className="ml-auto hidden h-3.5 w-3.5 text-[#C4B89F] sm:block" />
        )}
      </div>
      <p className="mt-1 truncate text-sm font-semibold text-[#1A1815]" title={value}>
        {value}
      </p>
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
  framed = false,
}: {
  label: string;
  value: string;
  tone?: "verified" | "provisional";
  framed?: boolean;
}) {
  const valueClass =
    tone === "verified"
      ? "text-emerald-700"
      : tone === "provisional"
        ? "text-amber-800"
        : "text-[#1A1815]";

  return (
    <div className={`min-w-0 px-4 py-3 ${framed ? "border border-[#E8DFD1] bg-[#FFFDF9]" : ""}`}>
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#A69D90]">
        {label}
      </p>
      <p className={`mt-1 truncate text-lg font-semibold tabular-nums ${valueClass}`} title={value}>
        {value}
      </p>
    </div>
  );
}

function FeeObservationRow({
  fee,
  disclosureUrl,
}: {
  fee: DisplayFee;
  disclosureUrl: string | null;
}) {
  const isVerified = fee.status === "verified";
  const label = isVerified ? "Verified" : "Provisional";
  const sourceUrl = fee.sourceUrl ?? disclosureUrl;
  const confidence = confidenceLabel(fee.extractionConfidence);

  return (
    <div className="fi-row-interaction grid gap-3 border-l-2 border-l-transparent px-4 py-4 sm:px-5 md:grid-cols-[minmax(0,1.5fr)_110px_minmax(0,1fr)_130px] md:items-start">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="min-w-0 break-words text-sm font-semibold text-[#1A1815]">
            {getDisplayName(fee.feeCategory ?? fee.feeName)}
          </p>
          <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${isVerified ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
            {label}
          </span>
        </div>
        {fee.conditions && (
          <p className="mt-1 break-words text-xs leading-relaxed text-[#7A7062]">
            {fee.conditions}
          </p>
        )}
      </div>
      <p
        className="text-2xl text-[#1A1815] tabular-nums md:text-right"
        style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
      >
        {formatAmount(fee.amount)}
      </p>
      <div className="min-w-0 text-xs text-[#7A7062]">
        <p className="font-medium text-[#5A5347]">{fee.frequency ?? "Frequency not specified"}</p>
        <p className="mt-1">{confidence}</p>
      </div>
      <div className="md:text-right">
        {sourceUrl ? (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#C44B2E] hover:text-[#A83D25]"
          >
            Source
            <ExternalLink className="h-3 w-3" />
          </a>
        ) : (
          <span className="text-xs text-[#A69D90]">Source pending</span>
        )}
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-[#F0EBE3] pb-3 last:border-0 last:pb-0">
      <span className="text-[#7A7062]">{label}</span>
      <span className="max-w-[55%] break-words text-right font-semibold text-[#1A1815]">
        {value}
      </span>
    </div>
  );
}

function confidenceLabel(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "Confidence not scored";
  }
  const pct = value <= 1 ? value * 100 : value;
  if (pct >= 90) return `High confidence (${pct.toFixed(0)}%)`;
  if (pct >= 70) return `Medium confidence (${pct.toFixed(0)}%)`;
  return `Low confidence (${pct.toFixed(0)}%)`;
}

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatFinancialRatio(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "N/A";
  return formatStoredPercent(value, Math.abs(value) < 1 ? 2 : 1);
}

function formatReportQuarter(reportDate: string): string {
  const date = new Date(reportDate);
  if (Number.isNaN(date.getTime())) return reportDate;
  return `${date.getUTCFullYear()}-Q${Math.floor(date.getUTCMonth() / 3) + 1}`;
}

function formatTrendPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "N/A";
  if (Math.abs(value) > 1_000) return "Review";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function withFallback<T>(
  promise: Promise<T>,
  fallback: T,
  label: string,
): Promise<T> {
  return promise.catch((error) => {
    console.error(`Institution page ${label} failed:`, error);
    return fallback;
  });
}
