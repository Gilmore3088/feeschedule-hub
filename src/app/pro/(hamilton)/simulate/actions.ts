"use server";

import { sql } from "@/lib/crawler-db/connection";
import { getCurrentUser } from "@/lib/auth";
import { canAccessPremium } from "@/lib/access";
import { getNationalIndex } from "@/lib/crawler-db/fee-index";
import { computeConfidenceTier, canSimulate } from "@/lib/hamilton/confidence";
import type { DistributionData } from "@/lib/hamilton/simulation";
import type { ConfidenceTier } from "@/lib/hamilton/confidence";

/**
 * Fetch distribution data for a fee category.
 * Returns null if category not found or data insufficient for display.
 * Used to hydrate the slider range and compute confidence tier.
 */
export async function getDistributionForCategory(
  feeCategory: string
): Promise<{ distribution: DistributionData; confidenceTier: ConfidenceTier } | { error: string }> {
  try {
    const index = await getNationalIndex(false);
    const entry = index.find((e) => e.fee_category === feeCategory);

    if (!entry) {
      return { error: `No data found for category: ${feeCategory}` };
    }

    if (
      entry.median_amount === null ||
      entry.p25_amount === null ||
      entry.p75_amount === null ||
      entry.min_amount === null ||
      entry.max_amount === null
    ) {
      return { error: "Insufficient distribution data for this category" };
    }

    const distribution: DistributionData = {
      fee_category: entry.fee_category,
      median_amount: entry.median_amount,
      p25_amount: entry.p25_amount,
      p75_amount: entry.p75_amount,
      min_amount: entry.min_amount,
      max_amount: entry.max_amount,
      approved_count: entry.approved_count,
    };

    const confidenceTier = computeConfidenceTier(entry.approved_count);
    return { distribution, confidenceTier };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database error";
    return { error: message };
  }
}

/**
 * Look up the institution's actual fee for a category.
 * Returns the fee amount if found, null if the institution has no fee in this category.
 */
export async function getInstitutionFee(
  institutionId: string,
  feeCategory: string
): Promise<{ amount: number } | null> {
  if (!institutionId) return null;

  try {
    const rows = await sql<{ amount: string }[]>`
      SELECT ef.amount::text
      FROM extracted_fees ef
      JOIN crawl_results cr ON ef.crawl_result_id = cr.id
      JOIN crawl_targets ct ON cr.crawl_target_id = ct.id
      WHERE ct.institution_name ILIKE ${`%${institutionId.replace(/-/g, ' ')}%`}
        AND ef.fee_category = ${feeCategory}
        AND ef.review_status IN ('approved', 'staged', 'pending')
        AND ef.amount IS NOT NULL
      ORDER BY
        CASE ef.review_status WHEN 'approved' THEN 1 WHEN 'staged' THEN 2 ELSE 3 END,
        ef.created_at DESC
      LIMIT 1
    `;

    if (rows.length > 0 && rows[0].amount) {
      return { amount: parseFloat(rows[0].amount) };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Save a scenario to hamilton_scenarios.
 * Requires premium/admin role.
 * Returns the new scenario UUID on success.
 * confidence_tier is snapshotted at save time (D-04 from Phase 39).
 */
export async function saveScenario(params: {
  institutionId: string;
  feeCategory: string;
  currentValue: number;
  proposedValue: number;
  resultJson: object;
  confidenceTier: ConfidenceTier;
}): Promise<{ id: string } | { error: string }> {
  const user = await getCurrentUser();
  if (!user || !canAccessPremium(user)) {
    return { error: "Active subscription required" };
  }

  // Insufficient tier must not be saved — canSimulate enforces the gate
  const check = canSimulate(params.confidenceTier);
  if (!check.allowed) {
    return { error: check.reason };
  }

  try {
    const rows = await sql<{ id: string }[]>`
      INSERT INTO hamilton_scenarios (
        user_id,
        institution_id,
        fee_category,
        current_value,
        proposed_value,
        result_json,
        confidence_tier,
        status
      ) VALUES (
        ${user.id},
        ${params.institutionId ?? ""},
        ${params.feeCategory},
        ${params.currentValue},
        ${params.proposedValue},
        ${JSON.stringify(params.resultJson)},
        ${params.confidenceTier},
        'active'
      )
      RETURNING id::text
    `;

    const id = rows[0]?.id;
    if (!id) return { error: "Failed to save scenario" };
    return { id };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database error";
    return { error: message };
  }
}

/**
 * List saved scenarios for the current user (active only — soft-deleted excluded).
 */
export async function listScenarios(limit = 20): Promise<
  Array<{
    id: string;
    fee_category: string;
    current_value: string;
    proposed_value: string;
    confidence_tier: string;
    created_at: string;
  }>
> {
  const user = await getCurrentUser();
  if (!user) return [];

  try {
    const rows = await sql<
      Array<{
        id: string;
        fee_category: string;
        current_value: string;
        proposed_value: string;
        confidence_tier: string;
        created_at: string;
      }>
    >`
      SELECT
        id::text,
        fee_category,
        current_value::text,
        proposed_value::text,
        confidence_tier,
        created_at::text
      FROM hamilton_scenarios
      WHERE user_id = ${user.id} AND status = 'active'
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
    return rows;
  } catch {
    return [];
  }
}

/**
 * Load the fee categories available for simulation (those with distribution data).
 * Returns array of { fee_category, display_name, approved_count, confidence_tier }.
 * Sorted by approved_count descending so strongest-data categories appear first.
 */
export async function getSimulationCategories(): Promise<
  Array<{
    fee_category: string;
    display_name: string;
    approved_count: number;
    confidence_tier: ConfidenceTier;
  }>
> {
  try {
    const index = await getNationalIndex(false);
    return index
      .filter(
        (e) =>
          e.median_amount !== null &&
          e.p25_amount !== null &&
          e.p75_amount !== null
      )
      .map((e) => ({
        fee_category: e.fee_category,
        display_name: e.fee_category
          .replace(/_/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase()),
        approved_count: e.approved_count,
        confidence_tier: computeConfidenceTier(e.approved_count),
      }))
      .sort((a, b) => b.approved_count - a.approved_count);
  } catch {
    return [];
  }
}
