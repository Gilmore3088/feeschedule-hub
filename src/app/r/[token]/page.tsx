/**
 * /r/[token] — a prepared Competitive Fee Position Report, hosted for one institution.
 * Token map: Reports/studio/hosted-reports.json; HTML: Reports/studio/out/<id>.html.
 * Not indexed; unknown or expired tokens 404.
 */
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ConsumerNav } from "@/components/consumer-nav";
import { CustomerFooter } from "@/components/customer-footer";
import { ReportFrame } from "@/components/public/report-frame";
import { TrackLink } from "@/components/track-link";
import { CONTACT_EMAIL, SITE_NAME } from "@/lib/constants";
import {
  formatReportDate,
  getHostedReport,
  prepareReportForEmbed,
  readHostedReportHtml,
} from "@/lib/hosted-reports";

interface PageProps {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const REFRESH_OFFER = "Refresh this report quarterly — $300";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token } = await params;
  const report = getHostedReport(token);
  return {
    title: report
      ? `Competitive Fee Position Report — ${report.institution_name}`
      : "Report not found",
    robots: { index: false, follow: false, nocache: true },
  };
}

function bookingHref(institutionName: string): string {
  const subject = encodeURIComponent(`Competitive Fee Position Report — ${institutionName}`);
  return `mailto:${CONTACT_EMAIL}?subject=${subject}`;
}

export default async function HostedReportPage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const report = getHostedReport(token);
  if (!report) notFound();

  const query = await searchParams;
  if (query.print === "1") redirect(`/r/${report.token}/print`);

  const rawHtml = readHostedReportHtml(report.institution_id);
  if (!rawHtml) notFound();
  const html = prepareReportForEmbed(rawHtml);
  const preparedOn = formatReportDate(report.prepared_on);

  return (
    <div className="min-h-screen bg-[#FAF7F2]">
      <ConsumerNav />
      <main className="mx-auto max-w-6xl px-6 pb-24 pt-10">
        <section className="flex flex-col gap-5 rounded-xl border border-[#E0D7C9] bg-[#FDFBF8] p-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#C44B2E]">
              Competitive Fee Position Report
            </p>
            <h1
              className="mt-2 text-[1.5rem] leading-tight tracking-[-0.02em] text-[#1A1815] sm:text-[1.85rem]"
              style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
            >
              Prepared for {report.institution_name} by {SITE_NAME} · {preparedOn}
            </h1>
            <p className="mt-2 text-[14px] text-[#5A5347]">
              {REFRESH_OFFER}. Your fee position against the same verified peer set, every quarter.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <TrackLink
              event="book_walkthrough"
              eventProps={{ placement: "hosted_report", institution_id: report.institution_id }}
              href={bookingHref(report.institution_name)}
              className="inline-flex items-center rounded-md bg-[#C44B2E] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#A93D25]"
            >
              Book 15 minutes
            </TrackLink>
            <a
              href={`/r/${report.token}/print`}
              target="_blank"
              rel="noopener"
              className="inline-flex items-center rounded-md border border-[#D5CBBF] px-4 py-2.5 text-sm font-semibold text-[#1A1815] transition-colors hover:border-[#C44B2E] hover:text-[#C44B2E]"
            >
              Download PDF
            </a>
          </div>
        </section>

        <section className="mt-8" aria-label="Report">
          <ReportFrame
            html={html}
            title={`Competitive Fee Position Report — ${report.institution_name}`}
          />
        </section>

        <p className="mt-6 text-[12px] leading-relaxed text-[#7A7062]">
          This link was prepared for {report.institution_name} and is not listed publicly. It
          resolves until {formatReportDate(report.expires_on)}. Questions or a
          quarterly refresh:{" "}
          <a href={bookingHref(report.institution_name)} className="text-[#5A5347] underline">
            {CONTACT_EMAIL}
          </a>
        </p>
      </main>
      <CustomerFooter />
    </div>
  );
}
