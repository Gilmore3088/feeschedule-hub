import Link from "next/link";

interface CompareSectionProps {
  stateCode: string | null;
  charterType: string | null;
  stateName: string | null;
}

/**
 * CompareSection — Spec #8, D-10, D-11.
 *
 * Renders comparison link pills that navigate to the institution search page
 * with pre-applied filters. Per D-11: uses existing /institutions search page,
 * no new comparison tool.
 *
 * Security (T-30.1-05): stateCode and charterType come from the DB (not user
 * input) and are URL-encoded before insertion into hrefs.
 */
export function CompareSection({ stateCode, charterType, stateName }: CompareSectionProps) {
  const encodedState = stateCode ? encodeURIComponent(stateCode) : null;
  const encodedCharter = charterType ? encodeURIComponent(charterType) : null;

  const charterLabel =
    charterType === "credit_union"
      ? "credit unions"
      : charterType === "bank"
        ? "banks"
        : "institutions";

  return (
    <section className="mt-8">
      <h2
        className="text-[16px] font-medium text-[#1A1815]"
        style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
      >
        Compare
      </h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {/* Compare to nearby institutions in state */}
        {encodedState && (
          <Link
            href={`/institutions?state=${encodedState}`}
            className="rounded-full border border-[#E8DFD1] px-4 py-2 text-[13px] font-medium text-[#5A5347] hover:border-[#C44B2E]/30 hover:text-[#C44B2E] transition-colors"
          >
            Compare to nearby institutions
          </Link>
        )}

        {/* Compare to same charter type in state */}
        {encodedState && encodedCharter && (
          <Link
            href={`/institutions?state=${encodedState}&charter=${encodedCharter}`}
            className="rounded-full border border-[#E8DFD1] px-4 py-2 text-[13px] font-medium text-[#5A5347] hover:border-[#C44B2E]/30 hover:text-[#C44B2E] transition-colors"
          >
            Compare to {charterLabel}{stateName ? ` in ${stateName}` : ""}
          </Link>
        )}

        {/* Browse all — always shown */}
        <Link
          href="/institutions"
          className="rounded-full border border-[#E8DFD1] px-4 py-2 text-[13px] font-medium text-[#5A5347] hover:border-[#C44B2E]/30 hover:text-[#C44B2E] transition-colors"
        >
          Browse all institutions
        </Link>
      </div>
    </section>
  );
}
