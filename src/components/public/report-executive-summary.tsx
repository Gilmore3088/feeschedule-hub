import type { ReportExecutiveSummary } from "@/lib/hosted-reports";

const SERIF_STYLE = { fontFamily: "var(--font-newsreader), Georgia, serif" } as const;

/**
 * The report's executive summary as native page HTML — readable on phones and by
 * search engines, independent of the letter-size document in the iframe below it.
 */
export function ReportExecutiveSummaryBlock({
  summary,
  heading = "Executive summary",
}: {
  summary: ReportExecutiveSummary;
  heading?: string;
}) {
  if (summary.findings.length === 0 && !summary.narrative) return null;

  return (
    <section className="rounded-xl border border-[#E0D7C9] bg-white p-5 sm:p-6" aria-labelledby="report-exec-summary">
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#A93D25]">In brief</p>
      <h2 id="report-exec-summary" className="mt-1 text-[1.35rem] text-[#1A1815]" style={SERIF_STYLE}>
        {heading}
      </h2>
      {summary.findings.length > 0 && (
        <ol className="mt-4 divide-y divide-[#F0EBE3] border-y border-[#E0D7C9]">
          {summary.findings.map((finding, index) => (
            <li key={`${index}-${finding.headline}`} className="grid gap-3 py-4 sm:grid-cols-[2rem_9.5rem_1fr] sm:gap-4">
              <span className="text-[12px] tabular-nums text-[#6B6255]">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <p className="text-[1.35rem] font-semibold leading-tight text-[#C44B2E]" style={SERIF_STYLE}>
                  {finding.stat}
                </p>
                <p className="mt-1 text-[12px] leading-snug text-[#6B6255]">{finding.statLabel}</p>
              </div>
              <div>
                <p className="text-[15px] font-semibold leading-snug text-[#1A1815]" style={SERIF_STYLE}>
                  {finding.headline}
                </p>
                <p className="mt-1 text-[14px] leading-relaxed text-[#5A5347]">{finding.body}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
      {summary.narrative && (
        <p className="mt-4 text-[15px] leading-relaxed text-[#3D3830]" style={SERIF_STYLE}>
          {summary.narrative}
        </p>
      )}
    </section>
  );
}
