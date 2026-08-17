import type { FeePublicationStatus } from "@/lib/institution-quality";
import { PRODUCT_NAME, SITE_NAME } from "@/lib/constants";

/** One name, one price, one turnaround — matches the plan's report offer. */
export const COMPETITIVE_FEE_POSITION_REPORT = {
  name: "Competitive Fee Position report",
  price: "$300",
  turnaround: "48 hours",
} as const;

/** Auto-generated narrative and score bullets are hidden below this many verified fees. */
export const MIN_VERIFIED_FEES_FOR_NARRATIVE = 5;

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
