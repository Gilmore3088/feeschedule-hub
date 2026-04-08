import Link from "next/link";

/**
 * MidPageCTA — Spec #7, D-15.
 *
 * Appears after the visual comparison section for non-pro users.
 * Copy is LOCKED per D-15 — do not alter without an explicit decision.
 * Per D-17: no gated component — simple static card with a CTA link.
 */
export function MidPageCTA() {
  return (
    <div className="rounded-xl border border-[#E8DFD1] bg-[#FAF7F2]/80 px-6 py-8 text-center">
      <p
        className="text-[16px] font-normal leading-snug text-[#1A1815]"
        style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
      >
        Want a deeper breakdown of how this institution generates fee revenue?
      </p>
      <div className="mt-5">
        <Link
          href="/for-institutions"
          className="inline-flex items-center rounded-full bg-[#C44B2E] px-6 py-2.5 text-[14px] font-bold text-white hover:bg-[#A93D25] transition-colors"
        >
          Unlock full analysis
        </Link>
      </div>
    </div>
  );
}
