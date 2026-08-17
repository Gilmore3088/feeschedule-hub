import { cache } from "react";
import { getFeesByInstitution, getPublicInstitutionById } from "@/lib/data-store";
import type { ExtractedFee } from "@/lib/data-store/types";
import type { InstitutionFeeScheduleEvidence } from "@/lib/data-store/institution";
import { formatFeeAmount } from "@/lib/format";
import { NON_PAID_ITEM_OVERDRAFT_PATTERN } from "@/lib/institution-rating";
import type { DisplayFee } from "./fee-schedule-table";

export const getPublicInstitutionForPage = cache(getPublicInstitutionById);

/** Published catalog fees, minus rejected rows. Cached so metadata and page share one query. */
export const getVisibleFeesForPage = cache(async (institutionId: number): Promise<ExtractedFee[]> => {
  try {
    const fees = await getFeesByInstitution(institutionId);
    return fees.filter((fee) => fee.review_status !== "rejected");
  } catch (error) {
    console.error("Institution page published fees failed:", error);
    return [];
  }
});

export function isVerifiedFee(fee: ExtractedFee): boolean {
  return fee.review_status === "approved";
}

export function toDisplayFees(fees: ExtractedFee[]): DisplayFee[] {
  return fees.map((fee) => ({
    id: `catalog-${fee.id}`,
    feeName: fee.fee_name,
    feeCategory: fee.fee_category ?? null,
    amount: fee.amount,
    frequency: fee.frequency,
    conditions: fee.conditions,
    status: isVerifiedFee(fee) ? "verified" : "provisional",
    sourceUrl: fee.source_url ?? null,
  }));
}

const PIPELINE_PREVIEW_LIMIT = 18;

/** Under-review rows from the collection pipeline, used only when the catalog is empty. */
export function toPipelineDisplayFees(evidence: InstitutionFeeScheduleEvidence | null): DisplayFee[] {
  if (!evidence) return [];
  const verified: DisplayFee[] = evidence.verified_fee_preview
    .filter((fee) => fee.review_status !== "rejected")
    .map((fee) => ({
      id: `verified-${fee.fee_verified_id}`,
      feeName: fee.fee_name,
      feeCategory: fee.canonical_fee_key,
      amount: fee.amount,
      frequency: fee.frequency,
      conditions: null,
      status: "provisional",
      sourceUrl: fee.source_url,
    }));
  const raw: DisplayFee[] = evidence.raw_fee_preview.map((fee) => ({
    id: `raw-${fee.fee_raw_id}`,
    feeName: fee.fee_name,
    feeCategory: null,
    amount: fee.amount,
    frequency: fee.frequency,
    conditions: fee.conditions,
    status: "provisional",
    sourceUrl: fee.source_url,
  }));
  return [...verified, ...raw].slice(0, PIPELINE_PREVIEW_LIMIT);
}

export interface HeadlineFees {
  overdraft: number | null;
  nsf: number | null;
  monthly: number | null;
}

function pickAmount(fees: ExtractedFee[], category: string, exclude?: RegExp): number | null {
  const match = fees.find(
    (fee) =>
      fee.fee_category === category &&
      fee.amount !== null &&
      fee.amount > 0 &&
      !(exclude && exclude.test(fee.fee_name)),
  );
  return match?.amount ?? null;
}

/**
 * Top verified amounts for the page title: overdraft, NSF, monthly maintenance.
 * Exact fee_category only — no name matching, so "Overdraft Fee - Per Transfer"
 * can never stand in for the paid-item overdraft charge.
 */
export function pickHeadlineFees(verifiedFees: ExtractedFee[]): HeadlineFees {
  return {
    overdraft: pickAmount(verifiedFees, "overdraft", NON_PAID_ITEM_OVERDRAFT_PATTERN),
    nsf: pickAmount(verifiedFees, "nsf"),
    monthly: pickAmount(verifiedFees, "monthly_maintenance"),
  };
}

export function buildProfileTitle(institutionName: string, headline: HeadlineFees): string {
  const parts = [
    headline.overdraft !== null ? `Overdraft ${formatFeeAmount(headline.overdraft)}` : null,
    headline.nsf !== null ? `NSF ${formatFeeAmount(headline.nsf)}` : null,
    headline.monthly !== null ? `Monthly ${formatFeeAmount(headline.monthly)}` : null,
  ].filter((part): part is string => Boolean(part));
  if (parts.length === 0) return `${institutionName} Fees and Fee Schedule`;
  return `${institutionName} Fees: ${parts.join(", ")} (${new Date().getFullYear()})`;
}
