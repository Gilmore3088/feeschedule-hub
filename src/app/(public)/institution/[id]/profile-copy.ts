import type { BadgeTier } from "@/lib/institution-badge";
import type { FeePublicationStatus } from "@/lib/institution-quality";
import { PRODUCT_NAME, REPORT_OFFER, SITE_NAME } from "@/lib/constants";

/** One name, one price, one turnaround — matches the plan's report offer. */
export const COMPETITIVE_FEE_POSITION_REPORT = {
  name: REPORT_OFFER.name,
  price: REPORT_OFFER.priceLabel,
  turnaround: REPORT_OFFER.turnaround.replace(/^delivered in /, ""),
} as const;

/** Auto-generated narrative and score bullets are hidden below this many verified fees. */
export const MIN_VERIFIED_FEES_FOR_NARRATIVE = 5;

/** The report offer band and the sidebar Pro card only show once this many fees are verified. */
export const MIN_VERIFIED_FEES_FOR_OFFER = 5;

export const STATUS_COPY: Record<FeePublicationStatus, string> = {
  verified:
    "Fees on this page were checked against the institution's own published fee schedule. Benchmark scores use verified fees only.",
  provisional:
    "Fees are shown from the institution's published schedule but have not finished review. They are excluded from benchmark scores until they clear.",
  under_review:
    "A fee schedule is on record for this institution and is being reviewed. Verified fees will appear here once review is complete.",
  unavailable:
    "We have not found a published fee schedule for this institution yet. Know where it lives? Send us the link and we will review it.",
};

export const METHODOLOGY_COPY = [
  `Verified fees have cleared review and are used in ${PRODUCT_NAME} benchmarks.`,
  "Fees marked Under review are shown with their source for context, but stay out of benchmark scores until they clear.",
  `Financial figures come from public FDIC and NCUA call reports and are shown in whole dollars by ${SITE_NAME}.`,
] as const;

/**
 * Body copy for the profile's collapsed "What's under review" detail —
 * counts and copy only, never the provisional rows themselves.
 */
export function underReviewDetailsCopy(count: number): string {
  return `${count} more fees have been collected from this institution's schedule and are being verified. Verified fees appear above as they clear review.`;
}

/**
 * Metadata description for the profile page's `<head>`, honest about tier:
 * only a verified profile claims "verified against its own fee schedule."
 */
export function buildProfileDescription({
  tier,
  nameAndPlace,
  provisionalCount,
}: {
  tier: BadgeTier;
  nameAndPlace: string;
  provisionalCount: number;
}): string {
  if (tier === "verified") {
    return `Published fees for ${nameAndPlace}, verified against its own fee schedule, with peer benchmarks from ${SITE_NAME}.`;
  }
  if (tier === "none") {
    return `No published fee schedule on file yet for ${nameAndPlace}. ${SITE_NAME} tracks bank and credit union fees as they are published.`;
  }
  return `Fee schedule under review — ${provisionalCount} fees collected for ${nameAndPlace}. ${SITE_NAME} tracks bank and credit union fees as they clear review.`;
}
