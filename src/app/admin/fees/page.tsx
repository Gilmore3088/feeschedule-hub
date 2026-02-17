import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { getFeesByInstitution, getAllFees } from "@/lib/crawler-db";
import { Breadcrumbs } from "@/components/breadcrumbs";
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
  if (conf >= 0.9)
    return (
      <span className="inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-600 tabular-nums">
        {(conf * 100).toFixed(0)}%
      </span>
    );
  if (conf >= 0.7)
    return (
      <span className="inline-block rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-600 tabular-nums">
        {(conf * 100).toFixed(0)}%
      </span>
    );
  return (
    <span className="inline-block rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600 tabular-nums">
      {(conf * 100).toFixed(0)}%
    </span>
  );
}

const STATUS_COLORS: Record<string, string> = {
  approved: "bg-emerald-50 text-emerald-600",
  rejected: "bg-red-50 text-red-600",
  staged: "bg-blue-50 text-blue-600",
  flagged: "bg-orange-50 text-orange-600",
  pending: "bg-gray-100 text-gray-500",
};

export default async function FeesPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  await requireAuth("view");

  const params = await searchParams;
  const targetId = params.id ? parseInt(params.id, 10) : null;

  const fees = targetId ? getFeesByInstitution(targetId) : getAllFees();
  const institutionName = fees.length > 0 ? fees[0].institution_name : "All Institutions";
  const title = targetId ? institutionName : "All Extracted Fees";

  const grouped = new Map<string, typeof fees>();
  for (const fee of fees) {
    const key = fee.institution_name;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(fee);
  }

  return (
    <>
      <div className="mb-6">
        <Breadcrumbs items={[
          { label: "Dashboard", href: "/admin" },
          { label: "Fees" },
        ]} />
        <h1 className="text-xl font-bold tracking-tight text-gray-900">{title}</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {fees.length} fee{fees.length !== 1 ? "s" : ""} extracted
        </p>
      </div>

      {Array.from(grouped.entries()).map(([instName, instFees]) => (
        <div key={instName} className="bg-white rounded-lg border mb-6">
          {!targetId && (
            <div className="px-5 py-3 border-b bg-gray-50/80">
              <Link
                href={`/admin/peers/${instFees[0].crawl_target_id}`}
                className="text-sm font-bold text-gray-800 hover:text-blue-600 transition-colors"
              >
                {instName}
              </Link>
              <p className="text-[11px] text-gray-400">
                {instFees.length} fee{instFees.length !== 1 ? "s" : ""}
              </p>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50/80 text-left">
                  <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Fee Name</th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-right">Amount</th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Frequency</th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Conditions</th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-center">
                    Confidence
                  </th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-center">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {instFees.map((fee) => (
                  <tr
                    key={fee.id}
                    className="border-b last:border-0 hover:bg-gray-50/50 transition-colors"
                  >
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
        </div>
      ))}
    </>
  );
}
