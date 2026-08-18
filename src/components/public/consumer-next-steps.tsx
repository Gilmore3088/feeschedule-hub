import Link from "next/link";
import { EmailSignup } from "@/components/public/email-signup";
import { REPORT_OFFER } from "@/lib/constants";
import { STATE_NAMES } from "@/lib/us-states";

interface ConsumerNextStepsProps {
  /** Two-letter, uppercase state code. Narrows the state link to that state's report. */
  stateCode?: string;
  /** Fee category slug of the page this renders on. Accepted for callers that have it on hand. */
  category?: string;
}

const NEWSLETTER_ID_PREFIX = "next-steps-newsletter";
const NEWSLETTER_PLACEMENT = "consumer_next_steps";
const REPORT_BRIDGE_HREF = "/for-institutions#report";

const PRIMARY_LINK =
  "inline-flex items-center justify-center rounded-md border border-[#D4C9BA] bg-white px-4 py-2 text-sm font-medium text-[#1A1815] transition-colors hover:border-[#A93D25] hover:text-[#A93D25]";

/**
 * What a consumer who lands on a fee-category, state, or guide page should do
 * next — find their own bank, browse fees by state, and sign up for the
 * newsletter — plus a one-line bridge to the institutional report for anyone
 * who works at a bank or credit union. This never links to /subscribe: that
 * offer is for Hamilton (Pro) seats, not the consumers this component serves.
 */
export function ConsumerNextSteps({ stateCode }: ConsumerNextStepsProps) {
  const stateHref = stateCode ? `/research/state/${stateCode}` : "/research#states";
  const stateName = stateCode ? STATE_NAMES[stateCode.toUpperCase()] : undefined;
  const stateLabel = stateName ? `Fees in ${stateName}` : "Fees by state";

  return (
    <div className="rounded-xl border border-[#E8DFD1] bg-[#FFFDF9] p-6 text-center">
      <h3
        className="text-lg font-normal text-[#1A1815]"
        style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
      >
        Next steps
      </h3>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
        <Link href="/institutions" className={PRIMARY_LINK}>
          Look up your bank
        </Link>
        <Link href={stateHref} className={PRIMARY_LINK}>
          {stateLabel}
        </Link>
      </div>

      <div className="mt-6 border-t border-[#E8DFD1] pt-5">
        <EmailSignup idPrefix={NEWSLETTER_ID_PREFIX} placement={NEWSLETTER_PLACEMENT} />
      </div>

      <p className="mt-5 text-[11px] leading-relaxed text-[#6B6255]">
        Work at a bank or credit union?{" "}
        <Link href={REPORT_BRIDGE_HREF} className="font-semibold text-[#A93D25] hover:underline">
          Get the {REPORT_OFFER.priceLabel} {REPORT_OFFER.name}
        </Link>
      </p>
    </div>
  );
}
