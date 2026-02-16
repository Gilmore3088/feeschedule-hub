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
      <span className="inline-block rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
        {(conf * 100).toFixed(0)}%
      </span>
    );
  if (conf >= 0.7)
    return (
      <span className="inline-block rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700">
        {(conf * 100).toFixed(0)}%
      </span>
    );
  return (
    <span className="inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
      {(conf * 100).toFixed(0)}%
    </span>
  );
}

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
        <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {fees.length} fee{fees.length !== 1 ? "s" : ""} extracted
        </p>
      </div>

      {Array.from(grouped.entries()).map(([instName, instFees]) => (
        <div key={instName} className="bg-white rounded-lg border mb-6">
          {!targetId && (
            <div className="px-6 py-3 border-b bg-gray-50">
              <Link
                href={`/admin/peers/${instFees[0].crawl_target_id}`}
                className="font-semibold text-blue-600 hover:underline"
              >
                {instName}
              </Link>
              <p className="text-xs text-gray-500">
                {instFees.length} fee{instFees.length !== 1 ? "s" : ""}
              </p>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left text-gray-500">
                  <th className="px-6 py-3 font-medium">Fee Name</th>
                  <th className="px-6 py-3 font-medium text-right">Amount</th>
                  <th className="px-6 py-3 font-medium">Frequency</th>
                  <th className="px-6 py-3 font-medium">Conditions</th>
                  <th className="px-6 py-3 font-medium text-center">
                    Confidence
                  </th>
                  <th className="px-6 py-3 font-medium text-center">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {instFees.map((fee) => (
                  <tr
                    key={fee.id}
                    className="border-b last:border-0 hover:bg-gray-50"
                  >
                    <td className="px-6 py-3 font-medium text-gray-900">
                      {fee.fee_name}
                    </td>
                    <td className="px-6 py-3 text-right font-mono text-gray-900">
                      {formatAmount(fee.amount)}
                    </td>
                    <td className="px-6 py-3 text-gray-600">
                      {frequencyLabel(fee.frequency)}
                    </td>
                    <td className="px-6 py-3 text-gray-500 max-w-xs truncate">
                      {fee.conditions || "-"}
                    </td>
                    <td className="px-6 py-3 text-center">
                      {confidenceBadge(fee.extraction_confidence)}
                    </td>
                    <td className="px-6 py-3 text-center">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                          fee.review_status === "approved"
                            ? "bg-green-100 text-green-700"
                            : fee.review_status === "rejected"
                              ? "bg-red-100 text-red-700"
                              : fee.review_status === "staged"
                                ? "bg-blue-100 text-blue-700"
                                : fee.review_status === "flagged"
                                  ? "bg-orange-100 text-orange-700"
                                  : "bg-gray-100 text-gray-600"
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
