import type { Metadata } from "next";
import Link from "next/link";
import { getFeeCategorySummaries } from "@/lib/crawler-db";
import {
  getDisplayName,
  getFeeFamily,
  getFeeTier,
  FEE_FAMILIES,
  FAMILY_COLORS,
} from "@/lib/fee-taxonomy";
import { formatAmount } from "@/lib/format";
import { BreadcrumbJsonLd } from "@/components/breadcrumb-jsonld";
import { DataFreshness } from "@/components/data-freshness";

export const metadata: Metadata = {
  title: "Fee Index - All 49 Bank Fee Categories",
  description:
    "Compare bank and credit union fees across 49 categories. National medians, ranges, and institution counts for overdraft, NSF, ATM, wire transfer, and more.",
};

const TIER_LABELS: Record<string, string> = {
  spotlight: "Spotlight",
  core: "Core",
  extended: "Extended",
  comprehensive: "Comprehensive",
};

export default function FeeCatalogPage() {
  const summaries = getFeeCategorySummaries();

  const byFamily = new Map<string, typeof summaries>();
  for (const s of summaries) {
    const family = getFeeFamily(s.fee_category) ?? "Other";
    if (!byFamily.has(family)) byFamily.set(family, []);
    byFamily.get(family)!.push(s);
  }

  const familyOrder = Object.keys(FEE_FAMILIES);

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <BreadcrumbJsonLd
        items={[
          { name: "Home", href: "/" },
          { name: "Fee Index", href: "/fees" },
        ]}
      />

      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        Fee Index
      </p>
      <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
        Bank & Credit Union Fee Benchmarks
      </h1>
      <p className="mt-2 max-w-2xl text-[14px] text-slate-600">
        National benchmarking data across 49 fee categories, organized by
        family. Click any fee to see full analysis with breakdowns by charter
        type, asset tier, Fed district, and state.
      </p>
      <div className="mt-1">
        <DataFreshness />
      </div>

      <div className="mt-8 space-y-8">
        {familyOrder.map((familyName) => {
          const cats = byFamily.get(familyName);
          if (!cats || cats.length === 0) return null;
          const colors = FAMILY_COLORS[familyName];

          return (
            <section key={familyName}>
              <h2
                className={`flex items-center gap-2 text-sm font-bold ${colors?.text ?? "text-slate-700"}`}
              >
                <span
                  className={`inline-block h-3 w-1 rounded-full ${colors?.border?.replace("border-l-", "bg-") ?? "bg-slate-400"}`}
                />
                {familyName}
              </h2>
              <div className="mt-3 overflow-hidden rounded-lg border border-slate-200">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/80">
                      <th className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                        Fee
                      </th>
                      <th className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                        Tier
                      </th>
                      <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                        Median
                      </th>
                      <th className="hidden px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400 sm:table-cell">
                        P25
                      </th>
                      <th className="hidden px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400 sm:table-cell">
                        P75
                      </th>
                      <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                        Range
                      </th>
                      <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                        Institutions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {cats.map((cat) => {
                      const tier = getFeeTier(cat.fee_category);
                      return (
                        <tr
                          key={cat.fee_category}
                          className="hover:bg-slate-50/50 transition-colors"
                        >
                          <td className="px-4 py-2.5">
                            <Link
                              href={`/fees/${cat.fee_category}`}
                              className="font-medium text-slate-900 hover:text-blue-600 transition-colors"
                            >
                              {getDisplayName(cat.fee_category)}
                            </Link>
                          </td>
                          <td className="px-4 py-2.5">
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                              {TIER_LABELS[tier]}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums font-medium text-slate-900">
                            {formatAmount(cat.median_amount)}
                          </td>
                          <td className="hidden px-4 py-2.5 text-right tabular-nums text-slate-500 sm:table-cell">
                            {formatAmount(cat.p25_amount)}
                          </td>
                          <td className="hidden px-4 py-2.5 text-right tabular-nums text-slate-500 sm:table-cell">
                            {formatAmount(cat.p75_amount)}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">
                            {formatAmount(cat.min_amount)} &ndash;{" "}
                            {formatAmount(cat.max_amount)}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">
                            {cat.institution_count.toLocaleString()}
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
      </div>

      {/* JSON-LD for the dataset */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Dataset",
            name: "Bank Fee Index - Complete Fee Catalog",
            description:
              "National benchmarking data across 49 bank and credit union fee categories.",
            url: "https://bankfeeindex.com/fees",
          }).replace(/</g, "\\u003c"),
        }}
      />
    </div>
  );
}
