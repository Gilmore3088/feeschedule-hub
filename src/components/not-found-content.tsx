import Link from "next/link";
import { REPORT_OFFER } from "@/lib/constants";

const SERIF_STACK = "var(--font-newsreader), Georgia, serif";

const PRIMARY_LINK_CLASS =
  "rounded-full bg-[#C44B2E] px-5 py-2.5 text-[13px] font-medium text-white shadow-sm shadow-[#C44B2E]/15 hover:shadow-md hover:shadow-[#C44B2E]/25 transition-all no-underline";
const SECONDARY_CTA_CLASS =
  "rounded-full border border-[#E8DFD1] bg-white/80 px-5 py-2.5 text-[13px] font-medium text-[#5A5347] hover:border-[#C44B2E]/30 hover:text-[#A93D25] transition-all no-underline";

const FOOTER_LINKS = [
  { label: "Research", href: "/research" },
  { label: "Consumer Guides", href: "/guides" },
  { label: "API Docs", href: "/api-docs" },
  { label: "Home", href: "/" },
] as const;

/**
 * Shared 404 body — used by both the root not-found.tsx (unwrapped by any
 * layout) and the (public) route group's not-found.tsx (already wrapped by
 * ConsumerNav/CustomerFooter via (public)/layout.tsx), so nav/footer are
 * rendered exactly once regardless of which segment triggers the 404.
 */
export function NotFoundContent() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-24 text-center">
      <div className="flex items-center justify-center gap-2 mb-6">
        <span className="h-px w-8 bg-[#C44B2E]/40" />
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#A93D25]/60">
          Page Not Found
        </span>
        <span className="h-px w-8 bg-[#C44B2E]/40" />
      </div>

      <h1
        className="text-[2.5rem] leading-[1.1] tracking-[-0.03em] text-[#1A1815]"
        style={{ fontFamily: SERIF_STACK }}
      >
        404
      </h1>

      <p className="mt-4 text-[15px] leading-relaxed text-[#6B6255]">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link href="/fees" className={PRIMARY_LINK_CLASS}>
          Browse the Bank Fee Index
        </Link>
        <Link href="/institutions" className={SECONDARY_CTA_CLASS}>
          Find Your Bank
        </Link>
        <Link href="/for-institutions#report" className={SECONDARY_CTA_CLASS}>
          Request your report — {REPORT_OFFER.priceLabel}
        </Link>
        <Link href="/submit-fees" className={SECONDARY_CTA_CLASS}>
          Submit a fee source
        </Link>
      </div>

      <div className="mt-10 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[12px]">
        {FOOTER_LINKS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="text-[#6B6255] hover:text-[#C44B2E] transition-colors"
          >
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
