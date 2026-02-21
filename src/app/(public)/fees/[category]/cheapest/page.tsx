import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/crawler-db/connection";
import {
  FEE_FAMILIES,
  getDisplayName,
  getFeeFamily,
  getFeaturedCategories,
  FAMILY_COLORS,
} from "@/lib/fee-taxonomy";
import { STATE_NAMES } from "@/lib/fed-districts";
import { formatAmount } from "@/lib/format";
import { BreadcrumbJsonLd } from "@/components/breadcrumb-jsonld";
import { DataQualityBanner, getDataQuality } from "@/components/data-quality-banner";

const ALL_CATEGORIES = new Set(Object.values(FEE_FAMILIES).flat());

export async function generateStaticParams() {
  return getFeaturedCategories().map((cat) => ({ category: cat }));
}
export const dynamicParams = true;
export const revalidate = 86400;

interface CheapestInstitution {
  id: number;
  institution_name: string;
  city: string | null;
  state_code: string | null;
  charter_type: string;
  asset_size_tier: string | null;
  amount: number;
}

function getCheapestForCategory(
  category: string,
  charterFilter?: string,
  limit = 25
): CheapestInstitution[] {
  const db = getDb();
  const conditions = [
    "ef.fee_category = ?",
    "ef.review_status != 'rejected'",
    "ef.amount IS NOT NULL",
    "ef.amount > 0",
  ];
  const params: (string | number)[] = [category];

  if (charterFilter) {
    conditions.push("ct.charter_type = ?");
    params.push(charterFilter);
  }

  params.push(limit);

  return db
    .prepare(
      `SELECT ct.id, ct.institution_name, ct.city, ct.state_code,
              ct.charter_type, ct.asset_size_tier,
              MIN(ef.amount) as amount
       FROM extracted_fees ef
       JOIN crawl_targets ct ON ef.crawl_target_id = ct.id
       WHERE ${conditions.join(" AND ")}
       GROUP BY ct.id
       ORDER BY amount ASC
       LIMIT ?`
    )
    .all(...params) as CheapestInstitution[];
}

function getTotalForCategory(category: string): number {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT COUNT(DISTINCT ct.id) as cnt
       FROM extracted_fees ef
       JOIN crawl_targets ct ON ef.crawl_target_id = ct.id
       WHERE ef.fee_category = ?
         AND ef.review_status != 'rejected'
         AND ef.amount IS NOT NULL
         AND ef.amount > 0`
    )
    .get(category) as { cnt: number };
  return row.cnt;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string }>;
}): Promise<Metadata> {
  const { category } = await params;
  const displayName = getDisplayName(category);
  const total = ALL_CATEGORIES.has(category)
    ? getTotalForCategory(category)
    : 0;

  return {
    title: `Cheapest ${displayName} Fees: Top 25 Lowest | Bank Fee Index`,
    description: `Find the 25 banks and credit unions with the lowest ${displayName.toLowerCase()} fees in the U.S. Based on ${total} institutions.`,
    alternates: { canonical: `/fees/${category}/cheapest` },
    ...(total < 5 ? { robots: { index: false } } : {}),
  };
}

export default async function CheapestPage({
  params,
  searchParams,
}: {
  params: Promise<{ category: string }>;
  searchParams: Promise<{ segment?: string }>;
}) {
  const { category } = await params;
  const { segment } = await searchParams;
  if (!ALL_CATEGORIES.has(category)) notFound();

  const displayName = getDisplayName(category);
  const family = getFeeFamily(category);
  const familyColor = family ? FAMILY_COLORS[family] : null;

  const charterFilter =
    segment === "banks"
      ? "bank"
      : segment === "credit-unions"
        ? "credit_union"
        : undefined;

  const institutions = getCheapestForCategory(category, charterFilter);
  const total = getTotalForCategory(category);
  const quality = getDataQuality(total);

  const segments = [
    { key: "all", label: "All", href: `/fees/${category}/cheapest` },
    {
      key: "banks",
      label: "Banks",
      href: `/fees/${category}/cheapest?segment=banks`,
    },
    {
      key: "credit-unions",
      label: "Credit Unions",
      href: `/fees/${category}/cheapest?segment=credit-unions`,
    },
  ];
  const activeSegment = segment ?? "all";

  // JSON-LD ItemList
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Cheapest ${displayName} Fees`,
    numberOfItems: institutions.length,
    itemListElement: institutions.map((inst, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: inst.institution_name,
      url: `https://bankfeeindex.com/institutions/${inst.id}`,
    })),
  };

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <BreadcrumbJsonLd
        items={[
          { name: "Home", href: "/" },
          { name: "Fee Index", href: "/fees" },
          { name: displayName, href: `/fees/${category}` },
          { name: "Cheapest", href: `/fees/${category}/cheapest` },
        ]}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <nav
        aria-label="Breadcrumb"
        className="mb-6 text-[13px] text-slate-400"
      >
        <Link
          href="/fees"
          className="hover:text-slate-600 transition-colors"
        >
          Fee Index
        </Link>
        <span className="mx-2" aria-hidden="true">
          /
        </span>
        <Link
          href={`/fees/${category}`}
          className="hover:text-slate-600 transition-colors"
        >
          {displayName}
        </Link>
        <span className="mx-2" aria-hidden="true">
          /
        </span>
        <span className="text-slate-600" aria-current="page">
          Cheapest
        </span>
      </nav>

      <DataQualityBanner quality={quality} count={total} />

      <div className="mb-10">
        <div className="flex items-center gap-3 mb-2">
          {family && familyColor && (
            <span
              className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${familyColor.bg} ${familyColor.text}`}
            >
              {family}
            </span>
          )}
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Cheapest {displayName} Fees
        </h1>
        <p className="mt-1 text-[15px] text-slate-500">
          Top 25 institutions with the lowest {displayName.toLowerCase()} fees
          {charterFilter
            ? ` among ${charterFilter === "bank" ? "banks" : "credit unions"}`
            : ""}
        </p>
      </div>

      {/* Segment tabs */}
      <div className="mb-6 flex gap-1 rounded-lg bg-slate-100 p-1 w-fit">
        {segments.map((seg) => (
          <Link
            key={seg.key}
            href={seg.href}
            className={`rounded-md px-4 py-1.5 text-[13px] font-medium transition-colors ${
              activeSegment === seg.key
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {seg.label}
          </Link>
        ))}
      </div>

      {institutions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center">
          <p className="text-sm text-slate-500">
            No institutions found for this fee category
            {charterFilter ? " and filter" : ""}.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <table className="w-full text-left">
            <caption className="sr-only">
              Top 25 institutions with the cheapest {displayName.toLowerCase()}{" "}
              fees
            </caption>
            <thead>
              <tr className="bg-slate-50/80">
                <th
                  scope="col"
                  className="w-10 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400"
                >
                  #
                </th>
                <th
                  scope="col"
                  className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400"
                >
                  Institution
                </th>
                <th
                  scope="col"
                  className="hidden px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 sm:table-cell"
                >
                  State
                </th>
                <th
                  scope="col"
                  className="hidden px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 md:table-cell"
                >
                  Type
                </th>
                <th
                  scope="col"
                  className="hidden px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 lg:table-cell"
                >
                  Size
                </th>
                <th
                  scope="col"
                  className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400"
                >
                  Fee
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {institutions.map((inst, i) => (
                <tr
                  key={inst.id}
                  className="hover:bg-slate-50/50 transition-colors"
                >
                  <td className="px-4 py-2.5 text-sm tabular-nums text-slate-400">
                    {i + 1}
                  </td>
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/institutions/${inst.id}`}
                      className="text-sm font-medium text-slate-900 hover:text-blue-600 transition-colors"
                    >
                      {inst.institution_name}
                    </Link>
                    {inst.city && (
                      <span className="ml-1.5 text-[11px] text-slate-400 sm:hidden">
                        {inst.city}
                        {inst.state_code ? `, ${inst.state_code}` : ""}
                      </span>
                    )}
                  </td>
                  <td className="hidden px-4 py-2.5 text-sm text-slate-500 sm:table-cell">
                    {inst.state_code
                      ? STATE_NAMES[inst.state_code] ?? inst.state_code
                      : "--"}
                  </td>
                  <td className="hidden px-4 py-2.5 text-sm text-slate-500 md:table-cell">
                    {inst.charter_type === "bank" ? "Bank" : "CU"}
                  </td>
                  <td className="hidden px-4 py-2.5 text-[11px] text-slate-400 lg:table-cell">
                    {inst.asset_size_tier ?? "--"}
                  </td>
                  <td className="px-4 py-2.5 text-right text-sm font-semibold tabular-nums text-emerald-600">
                    {formatAmount(inst.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 text-[11px] text-slate-400">
        Rankings based on most recent fee schedule. Verify directly with
        institution before making financial decisions.
      </p>

      {/* Cross-links */}
      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href={`/fees/${category}`}
          className="rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:border-blue-300 hover:text-blue-600 transition-colors"
        >
          {displayName} National Benchmark
        </Link>
        <Link
          href="/fees"
          className="rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:border-blue-300 hover:text-blue-600 transition-colors"
        >
          All Fee Categories
        </Link>
      </div>
    </div>
  );
}
