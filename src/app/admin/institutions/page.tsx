export const dynamic = "force-dynamic";
import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { searchInstitutions } from "@/lib/admin-queries";
import {
  ServerSortableTable,
  type ServerColumn,
} from "@/components/server-sortable-table";

const PAGE_SIZE = 50;

type InstitutionRow = Awaited<
  ReturnType<typeof searchInstitutions>
>["institutions"][number];

function formatAssetSize(val: number | null): string {
  if (val == null) return "-";
  if (val >= 1_000_000_000) return `$${(val / 1_000_000_000).toFixed(1)}B`;
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(0)}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(0)}K`;
  return `$${val}`;
}

const VALID_SORTS = new Set([
  "institution_name",
  "state_code",
  "charter_type",
  "asset_size",
  "has_fee_url",
  "fee_count",
]);

const COLUMNS: ServerColumn<InstitutionRow>[] = [
  {
    key: "institution_name",
    label: "Name",
    sortable: true,
    render: (r) => (
      <span className="font-medium text-gray-900 dark:text-gray-200">
        {r.institution_name}
      </span>
    ),
  },
  {
    key: "state_code",
    label: "State",
    sortable: true,
    render: (r) => (
      <span className="text-gray-500">{r.state_code || "-"}</span>
    ),
  },
  {
    key: "charter_type",
    label: "Charter",
    sortable: true,
    render: (r) => (
      <span className="text-gray-500 text-xs uppercase">
        {r.charter_type || "-"}
      </span>
    ),
  },
  {
    key: "asset_size",
    label: "Assets",
    sortable: true,
    align: "right",
    render: (r) => (
      <span className="text-gray-600 dark:text-gray-400">
        {formatAssetSize(r.asset_size)}
      </span>
    ),
  },
  {
    key: "has_fee_url",
    label: "Fee URL",
    sortable: true,
    align: "center",
    render: (r) =>
      r.has_fee_url ? (
        <span className="text-emerald-600 text-xs font-semibold">Yes</span>
      ) : (
        <span className="text-gray-300 dark:text-gray-600 text-xs">No</span>
      ),
  },
  {
    key: "fee_count",
    label: "Fees",
    sortable: true,
    align: "right",
    render: (r) => (
      <span className="text-gray-600 dark:text-gray-400">
        {r.fee_count || "-"}
      </span>
    ),
  },
];

export default async function InstitutionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAuth("view");

  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q : undefined;
  const page = Math.max(1, Number(params.page) || 1);
  const sortParam = typeof params.sort === "string" ? params.sort : "";
  const sort = VALID_SORTS.has(sortParam) ? sortParam : "asset_size";
  const dir: "asc" | "desc" = params.dir === "asc" ? "asc" : "desc";
  const perParam = Number(params.per);
  const perPage = [25, 50, 100].includes(perParam) ? perParam : PAGE_SIZE;

  let result = {
    institutions: [] as InstitutionRow[],
    total: 0,
  };
  try {
    result = await searchInstitutions(query, page, perPage, sort, dir);
  } catch {
    // fallback already set
  }

  const { institutions, total } = result;
  const baseParams: Record<string, string> = {};
  if (query) baseParams.q = query;

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

      {/* Sortable table */}
      <div className="admin-card overflow-hidden">
        <ServerSortableTable
          columns={COLUMNS}
          rows={institutions}
          rowKey={(r) => String(r.id)}
          basePath="/admin/institutions"
          sort={sort}
          dir={dir}
          page={page}
          perPage={perPage}
          totalItems={total}
          params={baseParams}
          caption="Institutions sorted server-side; change columns or page size to refresh."
        />
      </div>
    </div>
  );
}
