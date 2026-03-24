export const dynamic = "force-dynamic";
import { requireAuth } from "@/lib/auth";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { searchInstitutions } from "@/lib/admin-queries";
import Link from "next/link";

const PAGE_SIZE = 50;

function formatAssetSize(val: number | null): string {
  if (val == null) return "-";
  if (val >= 1_000_000_000) return `$${(val / 1_000_000_000).toFixed(1)}B`;
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(0)}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(0)}K`;
  return `$${val}`;
}

export default async function InstitutionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAuth("view");

  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q : undefined;
  const page = Math.max(1, Number(params.page) || 1);

  let result = { institutions: [] as Awaited<ReturnType<typeof searchInstitutions>>["institutions"], total: 0 };
  try {
    result = await searchInstitutions(query, page, PAGE_SIZE);
  } catch {
    // fallback already set
  }

  const { institutions, total } = result;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div>
        <Breadcrumbs
          items={[
            { label: "Admin", href: "/admin" },
            { label: "Institutions" },
          ]}
        />
        <h1 className="text-xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
          Institutions
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {total.toLocaleString()} institution{total !== 1 ? "s" : ""}
          {query ? ` matching "${query}"` : ""}
        </p>
      </div>

      {/* Search */}
      <form method="GET" className="flex gap-2">
        <input
          type="text"
          name="q"
          defaultValue={query || ""}
          placeholder="Search by institution name..."
          className="flex-1 rounded-md border border-gray-200 dark:border-white/[0.1] bg-white dark:bg-white/[0.04] px-3 py-2 text-sm text-gray-900 dark:text-gray-200 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-white/[0.2]"
        />
        <button
          type="submit"
          className="rounded-md bg-gray-900 dark:bg-white/[0.1] px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 dark:hover:bg-white/[0.15] transition-colors"
        >
          Search
        </button>
        {query && (
          <Link
            href="/admin/institutions"
            className="rounded-md border border-gray-200 dark:border-white/[0.1] px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/[0.04] transition-colors"
          >
            Clear
          </Link>
        )}
      </form>

      {/* Table */}
      <div className="admin-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50/80 dark:bg-white/[0.02] border-b border-gray-200 dark:border-white/[0.06]">
                <th className="px-4 py-2 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-4 py-2 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                  State
                </th>
                <th className="px-4 py-2 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                  Charter
                </th>
                <th className="px-4 py-2 text-right text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                  Assets
                </th>
                <th className="px-4 py-2 text-center text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                  Fee URL
                </th>
                <th className="px-4 py-2 text-right text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                  Fees
                </th>
              </tr>
            </thead>
            <tbody>
              {institutions.map((inst) => (
                <tr
                  key={inst.id}
                  className="border-b border-gray-100 dark:border-white/[0.04] hover:bg-gray-50/50 dark:hover:bg-white/[0.02] transition-colors"
                >
                  <td className="px-4 py-2.5 font-medium text-gray-900 dark:text-gray-200">
                    {inst.institution_name}
                  </td>
                  <td className="px-4 py-2.5 text-gray-500">
                    {inst.state_code || "-"}
                  </td>
                  <td className="px-4 py-2.5 text-gray-500 text-xs uppercase">
                    {inst.charter_type || "-"}
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-600 dark:text-gray-400 tabular-nums">
                    {formatAssetSize(inst.asset_size)}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {inst.has_fee_url ? (
                      <span className="text-emerald-600 text-xs font-semibold">Yes</span>
                    ) : (
                      <span className="text-gray-300 dark:text-gray-600 text-xs">No</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-gray-600 dark:text-gray-400">
                    {inst.fee_count || "-"}
                  </td>
                </tr>
              ))}
              {institutions.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                    No institutions found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-400 text-xs">
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={`/admin/institutions?${new URLSearchParams({ ...(query ? { q: query } : {}), page: String(page - 1) })}`}
                className="rounded-md border border-gray-200 dark:border-white/[0.1] px-3 py-1.5 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/[0.04] transition-colors"
              >
                Previous
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={`/admin/institutions?${new URLSearchParams({ ...(query ? { q: query } : {}), page: String(page + 1) })}`}
                className="rounded-md border border-gray-200 dark:border-white/[0.1] px-3 py-1.5 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/[0.04] transition-colors"
              >
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
