import Link from "next/link";
import { InstitutionSearchBar } from "@/app/(public)/institutions/search-bar";
import { EmailSignup } from "@/components/public/email-signup";
import { REPORT_OFFER } from "@/lib/constants";

const REPORT_LANE_HREF = "/for-institutions#report";

/**
 * The three consumer-facing sidebar CTAs on a guide page: find your own
 * bank, sign up for the newsletter, and a one-line (not a B2B card) bridge
 * to the institutional report offer. Split out of page.tsx purely to keep
 * that file's length in check — none of this needs guide-specific data.
 */
export function GuideSidebarCtas() {
  return (
    <>
      <div className="rounded-xl border border-[#E8DFD1] bg-white/80 px-5 py-5">
        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#A93D25]/60">
          Find Your Bank
        </p>
        <p className="mt-2 text-[13px] leading-relaxed text-[#6B6255]">
          See every published fee for your own institution next to the national benchmark.
        </p>
        <div className="mt-3">
          <InstitutionSearchBar
            variant="light"
            ariaLabel="Search institutions"
            placeholder="Search your bank or credit union..."
          />
        </div>
      </div>

      <div className="rounded-xl border border-[#E8DFD1] bg-white/80 px-5 py-5">
        <EmailSignup idPrefix="guide-newsletter" placement="guide_sidebar" />
      </div>

      <p className="px-1 text-[11px] leading-relaxed text-[#6B6255]">
        Work at a bank or credit union?{" "}
        <Link href={REPORT_LANE_HREF} className="font-semibold text-[#A93D25] hover:underline">
          Get the {REPORT_OFFER.priceLabel} {REPORT_OFFER.name}
        </Link>
      </p>
    </>
  );
}
