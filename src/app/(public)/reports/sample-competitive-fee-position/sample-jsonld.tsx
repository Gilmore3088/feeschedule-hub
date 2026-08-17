import { RESEARCH_IMPRINT, SITE_NAME, SITE_URL } from "@/lib/constants";
import type { ReportExecutiveSummary } from "@/lib/hosted-reports";

/** Report + Article structured data for the public sample report page. */
export function SampleReportJsonLd({
  title,
  description,
  pagePath,
  pdfPath,
  summary,
}: {
  title: string;
  description: string;
  pagePath: string;
  pdfPath: string;
  summary: ReportExecutiveSummary;
}) {
  const url = `${SITE_URL}${pagePath}`;
  const publisher = { "@type": "Organization", name: SITE_NAME, url: SITE_URL };
  const abstract = summary.narrative ?? summary.findings.map((finding) => finding.headline).join(" ");
  const json = JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Report",
        "@id": `${url}#report`,
        name: title,
        headline: title,
        description,
        abstract,
        url,
        inLanguage: "en-US",
        isAccessibleForFree: true,
        author: { "@type": "Organization", name: RESEARCH_IMPRINT },
        publisher,
        encoding: {
          "@type": "MediaObject",
          contentUrl: `${SITE_URL}${pdfPath}`,
          encodingFormat: "application/pdf",
        },
      },
      {
        "@type": "Article",
        "@id": `${url}#article`,
        headline: title,
        description,
        url,
        mainEntityOfPage: url,
        author: { "@type": "Organization", name: RESEARCH_IMPRINT },
        publisher,
        about: { "@id": `${url}#report` },
        articleSection: "Sample report",
        articleBody: [
          ...summary.findings.map((finding) => `${finding.headline} ${finding.body}`),
          summary.narrative ?? "",
        ]
          .filter(Boolean)
          .join(" "),
      },
    ],
  }).replace(/</g, "\\u003c");

  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
