import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { getFeesByInstitution, getAllFees } from "@/lib/crawler-db";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { Pagination } from "@/components/pagination";
import { formatAmount } from "@/lib/format";

function frequencyLabel(freq: string | null): string {
  const labels: Record<string, string> = {
    per_occurrence: "Per occurrence",
    monthly: "Monthly",
    annual: "Annual",
    one_time: "One-time",
    other: "Other",
  };
  return freq ? labels[freq] || freq : "-";
}

function confidenceBadge(conf: number) {
  const cls =
    conf >= 0.9
      ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
      : conf >= 0.7
        ? "bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400"
        : "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400";
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${cls}`}>
      {(conf * 100).toFixed(0)}%
    </span>
  );
}

const STATUS_COLORS: Record<string, string> = {
  approved: "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400",
  rejected: "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400",
  staged: "bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
  flagged: "bg-orange-50 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400",
  pending: "bg-gray-100 text-gray-500 dark:bg-white/[0.08] dark:text-gray-400",
};

const PAGE_SIZE = 100;

export default async function FeesPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; page?: string; q?: string }>;
}) {
  await requireAuth("view");

  const params = await searchParams;
  const targetId = params.id ? parseInt(params.id, 10) : null;
  const currentPage = Math.max(1, parseInt(params.page || "1", 10) || 1);
  const searchQuery = params.q || "";

  // Single institution view: no pagination needed (typically <50 fees)
  if (targetId) {
    const fees = await getFeesByInstitution(targetId);
    const institutionName =
      fees.length > 0 ? fees[0].institution_name : "Institution";

    return (
      <>
        <div className="mb-6">
          <Breadcrumbs
            items={[
              { label: "Dashboard", href: "/admin" },
              { label: "Extracts", href: "/admin/fees" },
              { label: institutionName },
            ]}
          />
          <h1 className="text-xl font-bold tracking-tight text-gray-900">
            {institutionName}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {fees.length} fee{fees.length !== 1 ? "s" : ""} extracted
          </p>
        </div>
        <FeeTable fees={fees} showInstitution={false} />
      </>
    );
  }

  // All fees: paginated
  const { fees, total } = await getAllFees(
    PAGE_SIZE,
    (currentPage - 1) * PAGE_SIZE,
    searchQuery || undefined,
  );
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <>
      <div className="mb-6">
        <Breadcrumbs
          items={[
            { label: "Dashboard", href: "/admin" },
            { label: "Extracts" },
          ]}
        />
        <h1 className="text-xl font-bold tracking-tight text-gray-900">
          All Extracted Fees
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {total.toLocaleString()} fee{total !== 1 ? "s" : ""} extracted
        </p>
      </div>

      <div className="mb-4">
        <form action="/admin/fees" method="GET" className="flex gap-2">
          <input
            type="text"
            name="q"
            defaultValue={searchQuery}
            placeholder="Search fees or institutions..."
            className="rounded-md border px-3 py-1.5 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-gray-300
                       dark:bg-[oklch(0.18_0_0)] dark:border-white/[0.12] dark:text-gray-100 dark:placeholder:text-gray-500"
          />
          <button
            type="submit"
            className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 transition-colors
                       dark:bg-white/[0.15] dark:hover:bg-white/[0.2]"
          >
            Search
          </button>
          {searchQuery && (
            <Link
              href="/admin/fees"
              className="rounded-md border px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors
                         dark:border-white/[0.12] dark:text-gray-400 dark:hover:bg-white/[0.06]"
            >
              Clear
            </Link>
          )}
        </form>
      </div>

      <div className="admin-card overflow-hidden">
        <FeeTable fees={fees} showInstitution />
        <div className="px-4 pb-3">
          <Pagination
            basePath="/admin/fees"
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={total}
            pageSize={PAGE_SIZE}
            params={searchQuery ? { q: searchQuery } : {}}
          />
        </div>
      </div>
    </>
  );
}

function FeeTable({
  fees,
  showInstitution,
}: {
  fees: { id: number; fee_name: string; amount: number | null; frequency: string | null; conditions: string | null; extraction_confidence: number; review_status: string; institution_name: string; crawl_target_id: number }[];
  showInstitution: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-gray-50/80 text-left">
            {showInstitution && (
              <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                Institution
              </th>
            )}
            <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
              Fee Name
            </th>
            <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-right">
              Amount
            </th>
            <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
              Frequency
            </th>
            <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
              Conditions
            </th>
            <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-center">
              Confidence
            </th>
            <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-center">
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {fees.map((fee) => (
            <tr
              key={fee.id}
              className="border-b last:border-0 hover:bg-gray-50/50 transition-colors"
            >
              {showInstitution && (
                <td className="px-4 py-2.5">
                  <Link
                    href={`/admin/peers/${fee.crawl_target_id}`}
                    className="font-medium text-gray-900 hover:text-blue-600 transition-colors text-xs"
                  >
                    {fee.institution_name}
                  </Link>
                </td>
              )}
              <td className="px-4 py-2.5 font-medium text-gray-900">
                {fee.fee_name}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums text-gray-900">
                {formatAmount(fee.amount)}
              </td>
              <td className="px-4 py-2.5 text-gray-600 text-xs">
                {frequencyLabel(fee.frequency)}
              </td>
              <td className="px-4 py-2.5 text-gray-500 max-w-xs truncate text-xs">
                {fee.conditions || "-"}
              </td>
              <td className="px-4 py-2.5 text-center">
                {confidenceBadge(fee.extraction_confidence)}
              </td>
              <td className="px-4 py-2.5 text-center">
                <span
                  className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                    STATUS_COLORS[fee.review_status] || "bg-gray-100 text-gray-500"
                  }`}
                >
                  {fee.review_status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
