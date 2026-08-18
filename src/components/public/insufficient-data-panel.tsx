const SERIF = { fontFamily: "var(--font-newsreader), Georgia, serif" };

interface InsufficientDataPanelProps {
  /** Display name of the fee category, e.g. "Prepaid Card Reload". */
  feeName: string;
}

/**
 * Shown instead of stat cards + a distribution chart when a fee category
 * has fewer than MIN_N_PUBLISH institutions (see sample-policy.ts). A
 * median/percentile over 1-4 institutions isn't a benchmark; this says so
 * plainly instead of publishing a number that reads as authoritative.
 */
export function InsufficientDataPanel({ feeName }: InsufficientDataPanelProps) {
  return (
    <div className="mt-6 rounded-xl border border-[#E8DFD1]/80 bg-[#FAF7F2]/60 px-6 py-8 text-center">
      <p className="text-[15px]" style={SERIF}>
        Not enough data yet
      </p>
      <p className="mt-2 text-[13px] leading-relaxed text-[#6B6255]">
        We have fewer than 5 institutions with a published {feeName} fee. We list them without a
        benchmark.
      </p>
    </div>
  );
}
