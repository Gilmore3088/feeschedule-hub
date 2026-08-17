export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFinancialsByInstitution, getNationalIndexCached } from "@/lib/data-store";
import { getInstitutionFeeScheduleEvidence } from "@/lib/data-store/institution";
import { getCurrentUser } from "@/lib/auth";
import { DISTRICT_NAMES } from "@/lib/fed-districts";
import { STATE_NAMES } from "@/lib/us-states";
import { BreadcrumbJsonLd } from "@/components/breadcrumb-jsonld";
import { SITE_NAME, SITE_URL } from "@/lib/constants";
import { computeInstitutionRating, generateInterpretation } from "@/lib/institution-rating";
import type { FeePublicationStatus } from "@/lib/institution-quality";
import { buildPublicInstitutionProfileLinks } from "@/lib/institution-profile-links";
import { formatAbsoluteDate } from "@/lib/public-stats";
import { getCharterLabel, getSegmentLabel, toTitleCase } from "./enum-labels";
import { FeeScheduleTable } from "./fee-schedule-table";
import { FinancialContext } from "./financial-context";
import { assetSizeToDollars, formatReportQuarter, normalizeFinancial } from "./financial-units";
import { InstitutionMetricRow, InstitutionOfferBand } from "./institution-metrics";
import { MIN_VERIFIED_FEES_FOR_NARRATIVE } from "./profile-copy";
import {
  buildProfileTitle,
  getPublicInstitutionForPage,
  getVisibleFeesForPage,
  isVerifiedFee,
  pickHeadlineFees,
  toDisplayFees,
  toPipelineDisplayFees,
} from "./profile-data";
import { ProfileHeader } from "./profile-header";
import { ProfileSidebar, type KeyFact } from "./profile-sidebar";
import { FeeProfileSummary, StatusNotice } from "./status-notice";

interface PageProps {
  params: Promise<{ id: string }>;
}

const FINANCIAL_HISTORY_QUARTERS = 4;

function fallbackTo<T>(label: string, fallback: T) {
  return (error: unknown): T => {
    console.error(`Institution page ${label} failed:`, error);
    return fallback;
  };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const instId = parseInt(id, 10);
  if (Number.isNaN(instId)) return { title: "Institution Not Found" };

  const inst = await getPublicInstitutionForPage(instId);
  if (!inst) return { title: "Institution Not Found" };

  const fees = Number(inst.fee_count ?? 0) > 0 ? await getVisibleFeesForPage(instId) : [];
  const headline = pickHeadlineFees(fees.filter(isVerifiedFee));
  const city = toTitleCase(inst.city);
  const place = [city, inst.state_code].filter(Boolean).join(", ");
  const stateName = inst.state_code ? STATE_NAMES[inst.state_code] : null;

  return {
    title: buildProfileTitle(inst.institution_name, headline),
    description: `Published fees for ${inst.institution_name}${place ? ` (${place})` : ""}, verified against its own fee schedule, with peer benchmarks from ${SITE_NAME}.`,
    keywords: [
      inst.institution_name,
      `${inst.institution_name} fees`,
      `${inst.institution_name} overdraft fee`,
      stateName ? `${stateName} ${getCharterLabel(inst.charter_type).toLowerCase()} fees` : "",
    ].filter(Boolean),
  };
}

export default async function InstitutionProfilePage({ params }: PageProps) {
  const { id } = await params;
  const instId = parseInt(id, 10);
  if (Number.isNaN(instId)) notFound();

  const inst = await getPublicInstitutionForPage(instId);
  if (!inst) notFound();

  const catalogVisibleFeeCount = Number(inst.fee_count ?? 0);
  const status: FeePublicationStatus = inst.fee_publication_status ?? "unavailable";
  const shouldLoadPipelineEvidence =
    catalogVisibleFeeCount === 0 &&
    Boolean(inst.fee_schedule_url || inst.latest_source_status || (inst.latest_extracted_fee_count ?? 0) > 0);

  const [visibleFees, evidence, financials, user] = await Promise.all([
    catalogVisibleFeeCount > 0 ? getVisibleFeesForPage(instId) : Promise.resolve([]),
    shouldLoadPipelineEvidence
      ? getInstitutionFeeScheduleEvidence(instId).catch(fallbackTo("fee evidence", null))
      : Promise.resolve(null),
    getFinancialsByInstitution(instId, FINANCIAL_HISTORY_QUARTERS).catch(fallbackTo("financial context", [])),
    getCurrentUser().catch(() => null),
  ]);

  const verifiedFees = visibleFees.filter(isVerifiedFee);
  const catalogRows = toDisplayFees(visibleFees);
  const displayFees = catalogRows.length > 0 ? catalogRows : toPipelineDisplayFees(evidence);
  const pipelineCounts = evidence?.pipeline_counts ?? null;
  const pipelineUnderReview = pipelineCounts
    ? Math.max(0, (pipelineCounts.raw_without_verified_count ?? 0) + (pipelineCounts.verified_without_published_count ?? 0))
    : 0;
  const verifiedCount = inst.published_fee_count ?? verifiedFees.length;
  const underReviewCount = Math.max(
    inst.provisional_fee_count ?? 0,
    visibleFees.length - verifiedFees.length,
    pipelineUnderReview,
  );

  const nationalIndex =
    verifiedFees.length > 0 ? await getNationalIndexCached().catch(fallbackTo("national index", [])) : [];
  const rating = verifiedFees.length > 0 ? computeInstitutionRating(verifiedFees, nationalIndex) : null;
  const showNarrative = rating !== null && verifiedFees.length >= MIN_VERIFIED_FEES_FOR_NARRATIVE;
  const headline = pickHeadlineFees(verifiedFees);
  const interpretation =
    showNarrative && rating
      ? generateInterpretation({
          rating,
          feeCount: verifiedFees.length,
          overdraftAmount: headline.overdraft,
          charterType: inst.charter_type,
        })
      : null;

  const normalizedFinancials = financials.map(normalizeFinancial);
  const latestFinancial = normalizedFinancials[0] ?? null;
  const financialsAsOf = latestFinancial ? formatReportQuarter(latestFinancial.reportDate) : null;
  const assetsDollars = assetSizeToDollars(inst.asset_size) ?? latestFinancial?.totalAssets ?? null;

  const stateName = inst.state_code ? STATE_NAMES[inst.state_code] : null;
  const city = toTitleCase(inst.city);
  const locationLabel = [city, stateName].filter(Boolean).join(", ") || null;
  const charterLabel = getCharterLabel(inst.charter_type);
  const districtName = inst.fed_district ? DISTRICT_NAMES[inst.fed_district] ?? null : null;
  const segmentLabel = getSegmentLabel(inst.asset_size_tier, inst.charter_type);
  const collectedOn = formatAbsoluteDate(inst.latest_source_collected_at ?? null);
  const freshnessLine = [
    collectedOn ? `Fee schedule collected ${collectedOn}` : null,
    financialsAsOf ? `Financials as of ${financialsAsOf}` : null,
  ]
    .filter(Boolean)
    .join(" · ") || null;

  const links = buildPublicInstitutionProfileLinks({
    institutionId: instId,
    institutionName: inst.institution_name,
    isAuthenticated: Boolean(user),
  });
  const needsSource = status === "unavailable" || status === "under_review";

  const facts: KeyFact[] = [
    { label: "Charter", value: charterLabel },
    { label: "Location", value: locationLabel ?? "N/A" },
    { label: "Segment", value: segmentLabel ?? "N/A" },
    { label: "Fed district", value: districtName ?? "N/A" },
    { label: "Fee schedule collected", value: collectedOn ?? "Not yet" },
    { label: "Financials as of", value: financialsAsOf ?? "N/A" },
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
          <ProfileHeader
            name={inst.institution_name}
            status={status}
            segmentLabel={segmentLabel}
            locationLabel={locationLabel}
            charterLabel={charterLabel}
            districtName={districtName}
            websiteUrl={inst.website_url}
            feeScheduleUrl={inst.fee_schedule_url}
            freshnessLine={freshnessLine}
          />

          <InstitutionMetricRow
            verifiedCount={verifiedCount}
            underReviewCount={underReviewCount}
            assetsDollars={assetsDollars}
            scoreLabel={rating?.label ?? null}
            financialsAsOf={financialsAsOf}
          />

          <InstitutionOfferBand
            institutionName={inst.institution_name}
            reportOfferHref={links.reportOfferHref}
            correctSourceHref={links.correctSourceHref}
          />

          <StatusNotice
            status={status}
            needsSource={needsSource}
            correctSourceHref={links.correctSourceHref}
            claimHref={links.claimHref}
          />

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
            <div className="min-w-0 space-y-6">
              {showNarrative && rating && interpretation && (
                <FeeProfileSummary
                  rating={rating}
                  interpretation={interpretation}
                  overdraftAmount={headline.overdraft}
                />
              )}

              <section className="border border-[#E0D7C9] bg-white">
                <div className="border-b border-[#E0D7C9] px-4 py-3 sm:px-5">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#7A7062]">Fee Schedule</p>
                      <h2 className="text-lg font-semibold text-[#1A1815]">Published fees</h2>
                    </div>
                    <p className="text-sm text-[#7A7062]">
                      Verified fees power benchmarks; fees under review do not.
                    </p>
                  </div>
                </div>

                {displayFees.length > 0 ? (
                  <FeeScheduleTable fees={displayFees} disclosureUrl={inst.fee_schedule_url} />
                ) : (
                  <div className="px-4 py-8 sm:px-5">
                    <div className="rounded-lg border border-[#E0D7C9] bg-[#FAF7F2] p-4">
                      <p className="text-sm font-semibold text-[#1A1815]">
                        {underReviewCount > 0
                          ? "Fees for this institution are under review."
                          : "No published schedule found."}
                      </p>
                      <p className="mt-1 text-sm leading-relaxed text-[#7A7062]">
                        {underReviewCount > 0
                          ? "Verified fees will appear here once review is complete."
                          : "Fee comparisons are withheld until a published fee schedule has been reviewed."}
                      </p>
                    </div>
                  </div>
                )}
              </section>

              <FinancialContext latest={latestFinancial} history={normalizedFinancials} />
            </div>

            <ProfileSidebar
              facts={facts}
              links={links}
              isAuthenticated={Boolean(user)}
              showAddSource={needsSource}
            />
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
            description: `Published fees and fee schedule for ${inst.institution_name}`,
            url: `${SITE_URL}/institution/${instId}`,
            address: inst.state_code
              ? { "@type": "PostalAddress", addressLocality: city ?? undefined, addressRegion: inst.state_code }
              : undefined,
          }).replace(/</g, "\\u003c"),
        }}
      />
    </>
  );
}
