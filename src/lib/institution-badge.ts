import { MIN_VERIFIED_FEES_FOR_OFFER } from "@/app/(public)/institution/[id]/profile-copy";

/**
 * Institution-level verification badge shown on the public profile hero and
 * in metadata copy. Tiered by published (verified) fee count, with
 * "under_review"/"none" split by whether there is any provisional backlog or
 * known source to review at all — never renders provisional fee rows, only
 * counts and copy (per the public read-model rule).
 */
export type BadgeTier = "verified" | "partial" | "under_review" | "none";

export interface InstitutionBadgeInput {
  published: number;
  provisional: number;
  hasSource: boolean;
}

export interface InstitutionBadge {
  tier: BadgeTier;
  label: string;
  detail: string;
}

export function institutionBadge({
  published,
  provisional,
  hasSource,
}: InstitutionBadgeInput): InstitutionBadge {
  if (published >= MIN_VERIFIED_FEES_FOR_OFFER) {
    return {
      tier: "verified",
      label: "Verified",
      detail: `${published.toLocaleString("en-US")} fees verified against the institution's own published fee schedule.`,
    };
  }

  if (published > 0) {
    return {
      tier: "partial",
      label: `Partially verified (${published} of ${MIN_VERIFIED_FEES_FOR_OFFER})`,
      detail: `${published} of ${MIN_VERIFIED_FEES_FOR_OFFER} fees needed for a full verified profile have cleared review.`,
    };
  }

  if (provisional > 0 || hasSource) {
    return {
      tier: "under_review",
      label: "Under review",
      detail:
        provisional > 0
          ? `${provisional.toLocaleString("en-US")} fees have been collected from this institution's schedule and are being verified.`
          : "A fee schedule source is on file for this institution and is being reviewed.",
    };
  }

  return {
    tier: "none",
    label: "No published schedule found",
    detail: "We have not found a published fee schedule for this institution yet.",
  };
}
