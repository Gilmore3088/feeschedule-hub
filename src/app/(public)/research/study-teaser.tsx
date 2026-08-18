import Link from "next/link";
import type { ReactNode } from "react";

export interface StudyHighlight {
  label: string;
  value: string;
}

interface StudyTeaserProps {
  title: string;
  abstract: string;
  highlights: StudyHighlight[];
  chart?: ReactNode;
}

/**
 * Public, indexable content for an original-research study page: the page's
 * <h1>, a substantive abstract, and a handful of top-line highlights so
 * anonymous visitors and search engines see real research before the
 * paywall. The full dataset (correlation tables, methodology detail) stays
 * behind <UpgradeGate /> below this component.
 */
export function StudyTeaser({ title, abstract, highlights, chart }: StudyTeaserProps) {
  return (
    <div>
      <h1
        className="text-[1.75rem] sm:text-[2.25rem] leading-[1.12] tracking-[-0.02em] font-bold text-[#1A1815]"
        style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
      >
        {title}
      </h1>
      <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-[#6B6255]">
        {abstract}
      </p>

      {chart}

      {highlights.length > 0 && (
        <div className="mt-6 overflow-hidden rounded-xl border border-[#E8DFD1]/80">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[#E8DFD1]/60 bg-[#FAF7F2]/60">
                <th className="px-4 py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-[#6B6255]">
                  Highlight
                </th>
                <th className="px-4 py-2 text-right text-[10px] font-bold uppercase tracking-[0.1em] text-[#6B6255]">
                  Value
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8DFD1]/60">
              {highlights.map((highlight) => (
                <tr key={highlight.label}>
                  <td className="px-4 py-2.5 font-medium text-[#1A1815]">
                    {highlight.label}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-[#5A5347]">
                    {highlight.value}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4">
        <Link
          href="/subscribe"
          className="inline-flex items-center gap-1.5 text-sm font-bold text-[#A93D25] hover:underline"
        >
          See pricing
          <span aria-hidden="true">&rarr;</span>
        </Link>
      </div>
    </div>
  );
}
