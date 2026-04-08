import { User } from "./auth";
import { STATE_TO_DISTRICT, DISTRICT_NAMES, FDIC_TIER_LABELS } from "./fed-districts";

export interface PersonalizationContext {
  institutionName: string | null;
  fedDistrictLabel: string | null;
  assetTier: string | null;
  peerGroupLabel: string | null;
}

/**
 * Derive personalization context from a user's profile.
 * This is a pure function with no DB calls or side effects.
 *
 * @param user - The authenticated User object
 * @returns PersonalizationContext with institution, district, tier, and peer group info
 */
export function derivePersonalizationContext(user: User): PersonalizationContext {
  // institutionName: pass through directly
  const institutionName = user.institution_name ?? null;

  // fedDistrictLabel: look up state_code -> district number -> district name
  let fedDistrictLabel: string | null = null;
  if (user.state_code) {
    const districtNum = STATE_TO_DISTRICT[user.state_code];
    if (districtNum !== undefined) {
      fedDistrictLabel = DISTRICT_NAMES[districtNum] ?? null;
    }
  }

  // assetTier: look up asset_tier in FDIC_TIER_LABELS
  let assetTier: string | null = null;
  if (user.asset_tier) {
    assetTier = FDIC_TIER_LABELS[user.asset_tier] ?? null;
  }

  // peerGroupLabel: combine institution_type and asset_tier
  let peerGroupLabel: string | null = null;
  if (user.institution_type) {
    // Map institution_type to label
    const typeLabel =
      user.institution_type === "credit_union" ? "Credit Unions" : "Banks";

    // If asset_tier is available, append tier label
    if (user.asset_tier && FDIC_TIER_LABELS[user.asset_tier]) {
      // Get the tier name prefix (e.g., "Community" from "Community ($100M-$1B)")
      const fullTierLabel = FDIC_TIER_LABELS[user.asset_tier];
      const tierNameMatch = fullTierLabel.match(/^([^(]+)/);
      const tierName = tierNameMatch ? tierNameMatch[1].trim() : user.asset_tier;

      // Extract the range portion (e.g., "$100M-$1B" from "Community ($100M-$1B)")
      const rangeMatch = fullTierLabel.match(/\(([^)]+)\)/);
      const rangeLabel = rangeMatch ? rangeMatch[1] : fullTierLabel;

      peerGroupLabel = `${tierName} ${typeLabel} (${rangeLabel})`;
    } else {
      // Just type label if no asset_tier
      peerGroupLabel = typeLabel;
    }
  }

  return {
    institutionName,
    fedDistrictLabel,
    assetTier,
    peerGroupLabel,
  };
}
