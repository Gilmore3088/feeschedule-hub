import { SITE_URL } from "@/lib/constants";

/** FinancialService structured data for the public institution profile. */
export function InstitutionJsonLd({
  institutionId,
  institutionName,
  city,
  stateCode,
}: {
  institutionId: number;
  institutionName: string;
  city: string | null;
  stateCode: string | null;
}) {
  const json = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "FinancialService",
    name: institutionName,
    description: `Published fees and fee schedule for ${institutionName}`,
    url: `${SITE_URL}/institution/${institutionId}`,
    address: stateCode
      ? { "@type": "PostalAddress", addressLocality: city ?? undefined, addressRegion: stateCode }
      : undefined,
  }).replace(/</g, "\\u003c");

  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
