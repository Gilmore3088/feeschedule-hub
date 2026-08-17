/**
 * /reports/sample-competitive-fee-position — the one public, anonymized
 * Competitive Fee Position Report. Committed source in Reports/studio/sample/,
 * embedded in a script-free iframe so its print styles stay isolated.
 * Site chrome (nav + footer) comes from the (public) layout.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { TrackLink } from "@/components/track-link";
import { ReportFrame } from "@/components/public/report-frame";
import { CONTACT_EMAIL, RESEARCH_IMPRINT, SITE_NAME, SITE_URL } from "@/lib/constants";
import { prepareReportForEmbed, readSampleReportHtml } from "@/lib/hosted-reports";

const SAMPLE_PATH = "/reports/sample-competitive-fee-position";
const REPORT_OFFER = "Competitive Fee Position Report — $300, delivered in 48 hours";
const REQUEST_HREF = "/for-institutions#report";

export const metadata: Metadata = {
  title: "Sample Competitive Fee Position Report",
  description: `See what a $300 Competitive Fee Position Report from ${SITE_NAME} contains: your fees against a verified peer set, the outliers that matter, the revenue lens, and a named peer comparison. Delivered in 48 hours.`,
  alternates: { canonical: SAMPLE_PATH },
  robots: { index: true, follow: true },
  openGraph: {
    type: "article",
    title: "Sample Competitive Fee Position Report",
    description: `An anonymized report for a ~$400M community bank. ${REPORT_OFFER}.`,
    url: `${SITE_URL}${SAMPLE_PATH}`,
    siteName: SITE_NAME,
  },
};

const SECTIONS = [
  "Executive summary — three findings that matter",
  "Position map — every fee against the peer cohort",
  "Divergences — where you sit above or below the market",
  "Revenue lens — posted price against Call Report income",
  "Named peer comparison on the headline fees",
  "Methodology, provenance, and the full published schedule",
];

export default function SampleReportPage() {
  const html = prepareReportForEmbed(readSampleReportHtml());

  return (
    <div className="mx-auto max-w-6xl px-6 pb-24 pt-14">
      <nav className="mb-6 flex items-center gap-2 text-[12px] text-[#7A7062]">
        <Link href="/reports" className="transition-colors hover:text-[#1A1815]">
          Reports
        </Link>
        <span className="text-[#D4C9BA]">/</span>
        <span className="text-[#5A5347]">Sample</span>
      </nav>

      <header className="grid gap-8 border-b border-[#E0D7C9] pb-10 md:grid-cols-[1.4fr_1fr]">
        <div>
          <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.12em] text-[#C44B2E]">
            Sample — Competitive Fee Position Report
          </p>
          <h1
            className="text-[2rem] leading-[1.15] tracking-[-0.02em] text-[#1A1815] sm:text-[2.5rem]"
            style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
          >
            This is what a $300 report looks like.
          </h1>
          <p className="mt-4 max-w-[560px] text-[16px] leading-relaxed text-[#5A5347]">
            Yours is built for your institution and your peer set, delivered in 48 hours. The report
            below was prepared for a real ~$400M community bank and anonymized — the institution is
            shown as Sample Community Bank and named peers are withheld. Every figure is real,
            drawn from published fee schedules and public Call Reports.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <TrackLink
              event="request_report"
              eventProps={{ placement: "sample_report_header" }}
              href={REQUEST_HREF}
              className="inline-flex items-center rounded-md bg-[#C44B2E] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#A93D25]"
            >
              Get yours
            </TrackLink>
            <span className="text-[13px] text-[#7A7062]">{REPORT_OFFER}</span>
          </div>
        </div>

        <aside className="rounded-xl border border-[#E0D7C9] bg-[#FDFBF8] p-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#7A7062]">
            What the report contains
          </p>
          <ol className="mt-3 space-y-2 text-[13px] leading-relaxed text-[#3D3830]">
            {SECTIONS.map((section, index) => (
              <li key={section} className="flex gap-3">
                <span className="tabular-nums text-[#C44B2E]">{String(index + 1).padStart(2, "0")}</span>
                <span>{section}</span>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-[12px] leading-relaxed text-[#7A7062]">
            Prepared by {RESEARCH_IMPRINT}. Quarterly refresh $300. Questions:{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-[#5A5347] underline">
              {CONTACT_EMAIL}
            </a>
          </p>
        </aside>
      </header>

      <section className="pt-10" aria-label="Sample report">
        <ReportFrame html={html} title="Sample Competitive Fee Position Report" />
      </section>

      <section className="mt-10 flex flex-col items-start gap-4 rounded-xl border border-[#E0D7C9] bg-[#FDFBF8] p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p
            className="text-[20px] text-[#1A1815]"
            style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
          >
            Get this report for your institution.
          </p>
          <p className="mt-1 text-[13px] text-[#7A7062]">{REPORT_OFFER}. Quarterly refresh $300.</p>
        </div>
        <TrackLink
          event="request_report"
          eventProps={{ placement: "sample_report_footer" }}
          href={REQUEST_HREF}
          className="inline-flex items-center rounded-md bg-[#C44B2E] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#A93D25]"
        >
          Get yours
        </TrackLink>
      </section>
    </div>
  );
}
