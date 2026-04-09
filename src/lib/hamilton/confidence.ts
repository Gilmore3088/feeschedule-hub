/**
 * Hamilton Confidence Tiers — data quality gates for simulation.
 *
 * Confidence tiers are snapshot values stored on hamilton_scenarios at creation
 * time (D-04). They do not auto-update if underlying data improves later.
 *
 * Thresholds are deliberately tighter than the index maturity badges (D-05):
 * simulation results must be defensible for a high-value subscription product.
 * Insufficient tier BLOCKS simulation entirely (D-06).
 */

/** The three confidence tiers for simulation data quality */
export const CONFIDENCE_TIERS = ["strong", "provisional", "insufficient"] as const;
export type ConfidenceTier = (typeof CONFIDENCE_TIERS)[number];

/**
 * Thresholds for simulation confidence tiers (per D-05).
 * Deliberately tighter than index maturity badges:
 * - strong: 20+ approved fees in category
 * - provisional: 10-19 approved fees
 * - insufficient: below 10 approved fees
 */
export const CONFIDENCE_THRESHOLDS = {
  strong: 20,
  provisional: 10,
} as const;

/**
 * Compute the confidence tier for a fee category based on approved fee count.
 * Returns the tier as a snapshot value to store on the scenario row (D-04).
 */
export function computeConfidenceTier(approvedFeeCount: number): ConfidenceTier {
  if (approvedFeeCount >= CONFIDENCE_THRESHOLDS.strong) return "strong";
  if (approvedFeeCount >= CONFIDENCE_THRESHOLDS.provisional) return "provisional";
  return "insufficient";
}

/**
 * Check whether a simulation can proceed for the given tier (D-06).
 * Insufficient tier BLOCKS simulation entirely.
 * Returns { allowed: true } or { allowed: false, reason: string }.
 */
export function canSimulate(
  tier: ConfidenceTier
): { allowed: true } | { allowed: false; reason: string } {
  if (tier === "insufficient") {
    return {
      allowed: false,
      reason: `Simulation blocked: fewer than ${CONFIDENCE_THRESHOLDS.provisional} approved fees in this category. At least ${CONFIDENCE_THRESHOLDS.provisional} approved observations are required for defensible simulation results.`,
    };
  }
  return { allowed: true };
}
