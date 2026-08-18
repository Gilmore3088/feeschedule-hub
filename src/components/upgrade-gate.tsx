import Link from "next/link";
import { getPublicStatsSummary } from "@/lib/public-stats";
import { REPORT_OFFER, SITE_NAME } from "@/lib/constants";
import { ConsumerNextSteps } from "@/components/public/consumer-next-steps";

interface UpgradeGateProps {
  message?: string;
  compact?: boolean;
  /**
   * How many more categories a Pro seat unlocks. Callers pass a computed value
   * (categories with data minus categories shown); it is capped to the live
   * category count so it can never overstate the index.
   */
  count?: number;
  /**
   * Who is hitting this gate. "professional" (default) is the existing
   * Pro/Hamilton pricing card. "consumer" renders `ConsumerNextSteps`
   * instead — consumer-facing pages (fee categories, guides) should not
   * push every reader at the $499.99/mo Pro price.
   */
  audience?: "professional" | "consumer";
  /** Forwarded to `ConsumerNextSteps` when `audience="consumer"`. */
  stateCode?: string;
  /** Forwarded to `ConsumerNextSteps` when `audience="consumer"`. */
  category?: string;
  /**
   * Adds a one-line bridge to the institutional report offer below the
   * "See pricing" button. For professional-audience gates that a mix of
   * consumers and institutions land on (e.g. the national fee index), so
   * institutional visitors aren't only offered the Pro subscription.
   */
  showReportBridge?: boolean;
}

const REPORT_BRIDGE_HREF = "/for-institutions#report";

const PRO_LABEL = `${SITE_NAME} Pro`;

/**
 * Shown when a free user encounters a premium-only feature.
 * `compact` renders inline (for table rows). Default renders a card.
 * `audience="consumer"` swaps the pricing card for `ConsumerNextSteps`.
 */
export async function UpgradeGate({
  message,
  compact = false,
  count,
  audience = "professional",
  stateCode,
  category,
  showReportBridge = false,
}: UpgradeGateProps) {
  if (audience === "consumer") {
    return <ConsumerNextSteps stateCode={stateCode} category={category} />;
  }

  const summary = await getPublicStatsSummary();
  const moreCount = count && count > 0 ? Math.min(count, summary.categories) : 0;
  if (compact) {
    return (
      <div className="text-center py-6 px-4 border-t border-[#E8DFD1] bg-gradient-to-r from-[#FAF7F2] to-white">
        <div className="text-sm text-[#6B6255]">
          {moreCount ? `${moreCount} more available` : message || "Premium feature"}
          {" "}with {PRO_LABEL}
        </div>
        <Link
          href="/subscribe"
          className="inline-block mt-2 text-sm font-bold text-[#A93D25] hover:underline"
        >
          See pricing &rarr;
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-[#FFFDF9] border border-[#E8DFD1] rounded-xl p-6 text-center">
      <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-[#FFF0ED] mb-3">
        <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 text-[#C44B2E]" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0110 0v4" />
        </svg>
      </div>
      <h3
        className="text-lg font-normal text-[#1A1815] mb-1"
        style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
      >
        {message || "Unlock full access"}
      </h3>
      <p className="text-sm text-[#6B6255] mb-4">
        {moreCount
          ? `${moreCount} more fee categories, peer benchmarks by charter, size and district, CSV exports, and the Hamilton workspace.`
          : `Unlock all ${summary.categoriesLabel} fee categories, peer benchmarks by charter, size and district, CSV exports, and the Hamilton workspace.`}
      </p>
      <div className="text-[12px] text-[#6B6255] mt-2 mb-4">
        Based on {summary.observationsLabel} verified fees from {summary.institutionsLabel} institutions
      </div>
      <Link
        href="/subscribe"
        className="inline-flex items-center gap-1.5 rounded-md bg-[#C44B2E] px-5 py-2.5 text-sm font-medium text-white shadow-sm shadow-[#C44B2E]/15 hover:bg-[#A93D25] hover:shadow-md hover:shadow-[#C44B2E]/25 transition-all"
      >
        See pricing
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
          <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clipRule="evenodd" />
        </svg>
      </Link>
      {showReportBridge && (
        <p className="mt-4 text-[11px] leading-relaxed text-[#6B6255]">
          Work at a bank or credit union?{" "}
          <Link href={REPORT_BRIDGE_HREF} className="font-semibold text-[#A93D25] hover:underline">
            Get a report for your institution — {REPORT_OFFER.priceLabel}
          </Link>
        </p>
      )}
    </div>
  );
}

/** Lock icon badge for quick action tiles. */
export function PremiumBadge() {
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold bg-[#FFF0ED] text-[#A93D25] uppercase tracking-wider ml-1">
      Pro
    </span>
  );
}
