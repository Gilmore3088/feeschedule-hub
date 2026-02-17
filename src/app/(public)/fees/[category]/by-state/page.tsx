import Link from "next/link";
import type { Metadata } from "next";
import { getDisplayName } from "@/lib/fee-taxonomy";
import { STATE_NAMES, STATE_TO_DISTRICT } from "@/lib/fed-districts";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string }>;
}): Promise<Metadata> {
  const { category } = await params;
  const displayName = getDisplayName(category);
  return {
    title: `${displayName} Fees by State | Bank Fee Index`,
    description: `Compare ${displayName.toLowerCase()} fees across all 50 U.S. states. See state-level medians, institution counts, and how each state compares to the national benchmark.`,
  };
}

export const revalidate = 604800;

export default async function ByStatePage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category } = await params;
  const displayName = getDisplayName(category);

  const states = Object.entries(STATE_NAMES)
    .filter(([code]) => code.length === 2 && STATE_TO_DISTRICT[code])
    .sort(([, a], [, b]) => a.localeCompare(b));

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <nav className="mb-6 text-[13px] text-slate-400">
        <Link href="/fees" className="hover:text-slate-600 transition-colors">
          Fee Index
        </Link>
        <span className="mx-2">/</span>
        <Link
          href={`/fees/${category}`}
          className="hover:text-slate-600 transition-colors"
        >
          {displayName}
        </Link>
        <span className="mx-2">/</span>
        <span className="text-slate-600">By State</span>
      </nav>

      <h1 className="mb-2 text-3xl font-bold tracking-tight text-slate-900">
        {displayName} by State
      </h1>
      <p className="mb-8 text-[15px] text-slate-500">
        Select a state to see local {displayName.toLowerCase()} fee benchmarks.
      </p>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {states.map(([code, name]) => (
          <Link
            key={code}
            href={`/fees/${category}/by-state/${code.toLowerCase()}`}
            className="rounded-lg border border-slate-200 px-4 py-3 text-center text-sm text-slate-700 hover:border-blue-300 hover:bg-blue-50/30 hover:text-blue-700 transition-colors"
          >
            {name}
          </Link>
        ))}
      </div>
    </div>
  );
}
