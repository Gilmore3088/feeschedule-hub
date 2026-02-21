import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getComparisonData } from "@/lib/crawler-db";
import { getDisplayName, getFeeTier, isFeaturedFee } from "@/lib/fee-taxonomy";
import { STATE_NAMES } from "@/lib/fed-districts";
import { formatAmount } from "@/lib/format";
import { BreadcrumbJsonLd } from "@/components/breadcrumb-jsonld";

export async function generateStaticParams() {
  return [];
}
export const dynamicParams = true;
export const revalidate = 86400;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ idA: string; idB: string }>;
}): Promise<Metadata> {
  const { idA, idB } = await params;
  const a = Number(idA);
  const b = Number(idB);
  if (!Number.isInteger(a) || !Number.isInteger(b) || a <= 0 || b <= 0) {
    return { title: "Comparison Not Found" };
  }

  const data = getComparisonData(a, b);
  if (!data) return { title: "Comparison Not Found" };

  const nameA = data.institution_a.institution_name;
  const nameB = data.institution_b.institution_name;

  return {
    title: `${nameA} vs ${nameB}: Fee Comparison | Bank Fee Index`,
    description: `Side-by-side fee comparison between ${nameA} and ${nameB}. Compare overdraft, ATM, maintenance, and other banking fees.`,
    alternates: { canonical: `/compare/${idA}/vs/${idB}` },
  };
}

export default async function CompareResultPage({
  params,
}: {
  params: Promise<{ idA: string; idB: string }>;
}) {
  const { idA, idB } = await params;
  const a = Number(idA);
  const b = Number(idB);
  if (!Number.isInteger(a) || !Number.isInteger(b) || a <= 0 || b <= 0) {
    notFound();
  }

  const data = getComparisonData(a, b);
  if (!data) notFound();

  const { institution_a, institution_b, fees, shared_count, a_cheaper_count, b_cheaper_count, tied_count } = data;

  const stateA = STATE_NAMES[institution_a.state_code ?? ""] ?? institution_a.state_code;
  const stateB = STATE_NAMES[institution_b.state_code ?? ""] ?? institution_b.state_code;

  const featuredFees = fees.filter((f) => isFeaturedFee(f.fee_category));
  const extendedFees = fees.filter((f) => !isFeaturedFee(f.fee_category));

  const tierOrder = { spotlight: 0, core: 1, extended: 2, comprehensive: 3 };
  const sortFn = (x: (typeof fees)[0], y: (typeof fees)[0]) => {
    const both_x = x.amount_a !== null && x.amount_b !== null;
    const both_y = y.amount_a !== null && y.amount_b !== null;
    if (both_x !== both_y) return both_x ? -1 : 1;
    const tx = tierOrder[getFeeTier(x.fee_category)] ?? 4;
    const ty = tierOrder[getFeeTier(y.fee_category)] ?? 4;
    return tx - ty;
  };
  featuredFees.sort(sortFn);
  extendedFees.sort(sortFn);

  const winner =
    a_cheaper_count > b_cheaper_count
      ? institution_a.institution_name
      : b_cheaper_count > a_cheaper_count
        ? institution_b.institution_name
        : null;

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <BreadcrumbJsonLd
        items={[
          { name: "Home", href: "/" },
          { name: "Compare", href: "/compare" },
          {
            name: `${institution_a.institution_name} vs ${institution_b.institution_name}`,
            href: `/compare/${idA}/vs/${idB}`,
          },
        ]}
      />

      <nav
        aria-label="Breadcrumb"
        className="mb-6 text-[13px] text-slate-400"
      >
        <Link
          href="/compare"
          className="hover:text-slate-600 transition-colors"
        >
          Compare
        </Link>
        <span className="mx-2" aria-hidden="true">
          /
        </span>
        <span className="text-slate-600" aria-current="page">
          {institution_a.institution_name} vs {institution_b.institution_name}
        </span>
      </nav>

      <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
        {institution_a.institution_name}{" "}
        <span className="text-slate-400">vs</span>{" "}
        {institution_b.institution_name}
      </h1>
      <p className="mt-1 text-[15px] text-slate-500">
        Side-by-side fee comparison across {fees.length} fee categories
      </p>

      {/* Institution cards */}
      <div className="mt-8 mb-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <InstitutionCard
          inst={institution_a}
          stateName={stateA}
          label="A"
        />
        <InstitutionCard
          inst={institution_b}
          stateName={stateB}
          label="B"
        />
      </div>

      {/* Summary */}
      {shared_count > 0 && (
        <div className="mb-10 rounded-lg border border-slate-200 bg-white p-5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Summary
          </p>
          <p className="mt-2 text-sm text-slate-700">
            Of <strong>{shared_count}</strong> shared fee categories,{" "}
            <strong className="text-emerald-600">
              {institution_a.institution_name}
            </strong>{" "}
            is cheaper in <strong>{a_cheaper_count}</strong>,{" "}
            <strong className="text-blue-600">
              {institution_b.institution_name}
            </strong>{" "}
            is cheaper in <strong>{b_cheaper_count}</strong>
            {tied_count > 0 && (
              <>
                , and <strong>{tied_count}</strong> are tied
              </>
            )}
            .
          </p>
          {winner && (
            <p className="mt-1 text-[13px] text-slate-500">
              Overall, <strong>{winner}</strong> has lower fees in the majority
              of shared categories.
            </p>
          )}
        </div>
      )}

      {/* Comparison table */}
      {featuredFees.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-4 text-lg font-bold tracking-tight text-slate-900">
            Fee Comparison
          </h2>
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <caption className="sr-only">
                  Fee comparison between {institution_a.institution_name} and{" "}
                  {institution_b.institution_name}
                </caption>
                <thead>
                  <tr className="bg-slate-50/80">
                    <th
                      scope="col"
                      className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400"
                    >
                      Category
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-emerald-600"
                    >
                      {truncateName(institution_a.institution_name)}
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-blue-600"
                    >
                      {truncateName(institution_b.institution_name)}
                    </th>
                    <th
                      scope="col"
                      className="hidden px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400 sm:table-cell"
                    >
                      National
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-400"
                    >
                      Diff
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {featuredFees.map((f) => (
                    <CompareRow
                      key={f.fee_category}
                      fee={f}
                      nameA={institution_a.institution_name}
                      nameB={institution_b.institution_name}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {extendedFees.length > 0 && (
            <details className="mt-4">
              <summary className="cursor-pointer text-sm text-slate-500 hover:text-slate-700 transition-colors">
                Show {extendedFees.length} more fee categories
              </summary>
              <div className="mt-2 overflow-hidden rounded-lg border border-slate-200">
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <tbody className="divide-y divide-slate-100">
                      {extendedFees.map((f) => (
                        <CompareRow
                          key={f.fee_category}
                          fee={f}
                          nameA={institution_a.institution_name}
                          nameB={institution_b.institution_name}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </details>
          )}
        </section>
      )}

      {fees.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center">
          <p className="text-sm text-slate-500">
            No overlapping fee data available for these two institutions.
          </p>
        </div>
      )}

      {/* Cross-links */}
      <div className="flex flex-wrap gap-3">
        <Link
          href={`/institutions/${institution_a.id}`}
          className="rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:border-blue-300 hover:text-blue-600 transition-colors"
        >
          {institution_a.institution_name} Profile
        </Link>
        <Link
          href={`/institutions/${institution_b.id}`}
          className="rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:border-blue-300 hover:text-blue-600 transition-colors"
        >
          {institution_b.institution_name} Profile
        </Link>
        <Link
          href="/compare"
          className="rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:border-blue-300 hover:text-blue-600 transition-colors"
        >
          New Comparison
        </Link>
      </div>
    </div>
  );
}

function truncateName(name: string, max = 20): string {
  return name.length > max ? name.slice(0, max - 1) + "\u2026" : name;
}

function InstitutionCard({
  inst,
  stateName,
  label,
}: {
  inst: {
    id: number;
    institution_name: string;
    city: string | null;
    charter_type: string;
    asset_size_tier: string | null;
  };
  stateName: string | null;
  label: string;
}) {
  const color = label === "A" ? "emerald" : "blue";
  return (
    <Link
      href={`/institutions/${inst.id}`}
      className="rounded-lg border border-slate-200 bg-white p-5 hover:border-blue-300 transition-colors"
    >
      <div className="flex items-center gap-2 mb-2">
        <span
          className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white ${
            color === "emerald" ? "bg-emerald-500" : "bg-blue-500"
          }`}
        >
          {label}
        </span>
        <span className="text-[11px] font-semibold text-slate-400">
          {inst.charter_type === "bank" ? "Bank" : "Credit Union"}
        </span>
      </div>
      <p className="text-sm font-bold text-slate-900">
        {inst.institution_name}
      </p>
      <p className="mt-0.5 text-[12px] text-slate-400">
        {[inst.city, stateName].filter(Boolean).join(", ")}
      </p>
      {inst.asset_size_tier && (
        <p className="mt-1 text-[11px] text-slate-400">
          {inst.asset_size_tier}
        </p>
      )}
    </Link>
  );
}

function CompareRow({
  fee,
  nameA,
  nameB,
}: {
  fee: {
    fee_category: string;
    amount_a: number | null;
    amount_b: number | null;
    national_median: number | null;
  };
  nameA: string;
  nameB: string;
}) {
  const hasA = fee.amount_a !== null && fee.amount_a > 0;
  const hasB = fee.amount_b !== null && fee.amount_b > 0;
  const diff =
    hasA && hasB ? (fee.amount_a! - fee.amount_b!).toFixed(2) : null;
  const diffNum = diff ? parseFloat(diff) : null;

  let winner: string | null = null;
  if (diffNum !== null && diffNum !== 0) {
    winner = diffNum < 0 ? "a" : "b";
  }

  return (
    <tr className="hover:bg-slate-50/50 transition-colors">
      <td className="px-4 py-2.5">
        <Link
          href={`/fees/${fee.fee_category}`}
          className="text-sm font-medium text-slate-900 hover:text-blue-600 transition-colors"
        >
          {getDisplayName(fee.fee_category)}
        </Link>
      </td>
      <td
        className={`px-4 py-2.5 text-right text-sm tabular-nums ${
          winner === "a"
            ? "font-semibold text-emerald-600"
            : "text-slate-700"
        }`}
      >
        {hasA ? formatAmount(fee.amount_a) : <Na />}
      </td>
      <td
        className={`px-4 py-2.5 text-right text-sm tabular-nums ${
          winner === "b"
            ? "font-semibold text-blue-600"
            : "text-slate-700"
        }`}
      >
        {hasB ? formatAmount(fee.amount_b) : <Na />}
      </td>
      <td className="hidden px-4 py-2.5 text-right text-sm tabular-nums text-slate-400 sm:table-cell">
        {formatAmount(fee.national_median)}
      </td>
      <td className="px-4 py-2.5 text-center">
        {diffNum !== null && diffNum !== 0 ? (
          <span
            className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${
              diffNum < 0
                ? "bg-emerald-50 text-emerald-600"
                : "bg-blue-50 text-blue-600"
            }`}
            title={`${diffNum < 0 ? truncateName(nameA, 30) : truncateName(nameB, 30)} is $${Math.abs(diffNum).toFixed(2)} cheaper`}
          >
            {diffNum < 0 ? truncateName(nameA, 12) : truncateName(nameB, 12)}{" "}
            -${Math.abs(diffNum).toFixed(2)}
          </span>
        ) : diffNum === 0 ? (
          <span className="text-[11px] text-slate-400">Tied</span>
        ) : (
          <span className="text-[11px] text-slate-300">--</span>
        )}
      </td>
    </tr>
  );
}

function Na() {
  return (
    <span className="text-[11px] italic text-slate-300">N/A</span>
  );
}
