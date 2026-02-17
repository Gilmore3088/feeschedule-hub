import Link from "next/link";
import { getNationalIndex } from "@/lib/crawler-db";
import {
  FEE_FAMILIES,
  FAMILY_COLORS,
  getDisplayName,
  getFeeTier,
  isFeaturedFee,
  TAXONOMY_COUNT,
  FEATURED_COUNT,
} from "@/lib/fee-taxonomy";
import { formatAmount } from "@/lib/format";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Fee Index - All Banking Fee Categories | Bank Fee Index",
  description: `National benchmark data for ${TAXONOMY_COUNT} banking fee categories across U.S. banks and credit unions. Compare overdraft, NSF, wire transfer, ATM, and maintenance fees.`,
};

export const revalidate = 86400;

export default function FeesIndexPage() {
  const allEntries = getNationalIndex();
  const entryMap = new Map(allEntries.map((e) => [e.fee_category, e]));

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
      </div>

      {/* Families */}
      {Object.entries(FEE_FAMILIES).map(([family, categories]) => {
        const colors = FAMILY_COLORS[family] ?? {
          border: "border-l-gray-400",
          bg: "bg-gray-50",
          text: "text-gray-700",
        };
        return (
          <section key={family} className="mb-10">
            <h2
              className={`mb-4 flex items-center gap-2 text-sm font-bold ${colors.text}`}
            >
              <span
                className={`inline-block h-3 w-1 rounded-full ${colors.border.replace("border-l-", "bg-")}`}
              />
              {family}
              <span className="text-xs font-normal text-slate-400">
                ({categories.length})
              </span>
            </h2>

            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50/80">
                    <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      Fee Category
                    </th>
                    <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      Median
                    </th>
                    <th className="hidden px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400 sm:table-cell">
                      P25-P75
                    </th>
                    <th className="hidden px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400 md:table-cell">
                      Institutions
                    </th>
                    <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      Tier
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {categories.map((cat) => {
                    const entry = entryMap.get(cat);
                    const tier = getFeeTier(cat);
                    const featured = isFeaturedFee(cat);
                    return (
                      <tr
                        key={cat}
                        className="hover:bg-slate-50/50 transition-colors"
                      >
                        <td className="px-4 py-2.5">
                          <Link
                            href={`/fees/${cat}`}
                            className="text-sm font-medium text-slate-900 hover:text-blue-600 transition-colors"
                          >
                            {getDisplayName(cat)}
                          </Link>
                        </td>
                        <td className="px-4 py-2.5 text-right text-sm tabular-nums text-slate-700">
                          {entry
                            ? formatAmount(entry.median_amount)
                            : "-"}
                        </td>
                        <td className="hidden px-4 py-2.5 text-right text-sm tabular-nums text-slate-500 sm:table-cell">
                          {entry?.p25_amount != null && entry?.p75_amount != null
                            ? `${formatAmount(entry.p25_amount)} - ${formatAmount(entry.p75_amount)}`
                            : "-"}
                        </td>
                        <td className="hidden px-4 py-2.5 text-right text-sm tabular-nums text-slate-500 md:table-cell">
                          {entry?.institution_count?.toLocaleString() ?? "-"}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {featured ? (
                            <span className="inline-block rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-600">
                              {tier === "spotlight" ? "Spotlight" : "Core"}
                            </span>
                          ) : (
                            <span className="text-[10px] uppercase tracking-wider text-slate-300">
                              {tier}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}

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
