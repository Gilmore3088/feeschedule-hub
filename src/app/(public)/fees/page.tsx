import { getNationalIndex } from "@/lib/crawler-db";
import {
  FEE_FAMILIES,
  TAXONOMY_COUNT,
  FEATURED_COUNT,
} from "@/lib/fee-taxonomy";
import { DataFreshness } from "@/components/data-freshness";
import { FeeIndexSearch } from "@/components/fee-index-search";
import type { Metadata } from "next";
import type { IndexEntry } from "@/lib/crawler-db/fee-index";

export const metadata: Metadata = {
  title: "Fee Index - All Banking Fee Categories | Bank Fee Index",
  description: `National benchmark data for ${TAXONOMY_COUNT} banking fee categories across U.S. banks and credit unions. Compare overdraft, NSF, wire transfer, ATM, and maintenance fees.`,
};

export const revalidate = 86400;

export default function FeesIndexPage() {
  const allEntries = getNationalIndex();
  const entryMap: Record<string, IndexEntry> = {};
  for (const e of allEntries) {
    entryMap[e.fee_category] = e;
  }

  const totalInstitutions = Math.max(
    ...allEntries.map((e) => e.institution_count),
    0
  );

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      {/* Header */}
      <div className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          U.S. Banking Fee Index
        </h1>
        <p className="mt-2 text-[15px] text-slate-500">
          National benchmark data for {TAXONOMY_COUNT} fee categories across{" "}
          {totalInstitutions.toLocaleString()} institutions.{" "}
          {FEATURED_COUNT} featured categories shown first.
        </p>
        <DataFreshness />
      </div>

      <FeeIndexSearch families={FEE_FAMILIES} entryMap={entryMap} />

      {/* JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Dataset",
            name: "U.S. Banking Fee Index",
            description: `National benchmark data for ${TAXONOMY_COUNT} banking fee categories across ${totalInstitutions.toLocaleString()} U.S. financial institutions`,
            url: "https://bankfeeindex.com/fees",
            creator: {
              "@type": "Organization",
              name: "Bank Fee Index",
            },
            temporalCoverage: "2024/2026",
            spatialCoverage: {
              "@type": "Place",
              name: "United States",
            },
          }).replace(/</g, "\\u003c"),
        }}
      />
    </div>
  );
}
