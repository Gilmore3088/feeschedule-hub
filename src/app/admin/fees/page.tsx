export const dynamic = "force-dynamic";
import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { getFeeCatalogSummary } from "@/lib/admin-queries";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { FEE_FAMILIES } from "@/lib/fee-taxonomy";

function familyForCategory(cat: string): string {
  for (const [family, categories] of Object.entries(FEE_FAMILIES)) {
    if (categories.includes(cat)) return family;
  }
  return "Other";
}

export default async function FeesPage() {
  await requireAuth("view");

  let categories: Awaited<ReturnType<typeof getFeeCatalogSummary>> = [];

  try {
    categories = await getFeeCatalogSummary();
  } catch (e) {
    console.error("FeesPage load failed:", e);
  }

  const totalFees = categories.reduce((sum, c) => sum + c.count, 0);

  // Group by family
  const byFamily = new Map<string, typeof categories>();
  for (const cat of categories) {
    const family = familyForCategory(cat.fee_category);
    if (!byFamily.has(family)) byFamily.set(family, []);
    byFamily.get(family)!.push(cat);
  }

  return (
    <>
      <div className="mb-6">
        <Breadcrumbs items={[
          { label: "Dashboard", href: "/admin" },
          { label: "Fee Catalog" },
        ]} />
        <h1 className="text-xl font-bold tracking-tight text-gray-900">
          Fee Catalog
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {categories.length} categories across {totalFees.toLocaleString()} extracted fees
        </p>
      </div>

      {categories.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          No categorized fees found.
        </div>
      ) : (
        <div className="space-y-6">
          {Array.from(byFamily.entries()).map(([family, cats]) => (
            <div key={family} className="admin-card overflow-hidden">
              <div className="px-4 py-3 bg-gray-50/80 border-b">
                <h2 className="text-sm font-bold text-gray-800">{family}</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50/80 text-left">
                      <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                        Category
                      </th>
                      <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-right">
                        Count
                      </th>
                      <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-right">
                        P25
                      </th>
                      <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-right">
                        Median
                      </th>
                      <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-right">
                        P75
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {cats.map((cat) => (
                      <tr
                        key={cat.fee_category}
                        className="border-b last:border-0 hover:bg-gray-50/50 transition-colors"
                      >
                        <td className="px-4 py-2.5">
                          <Link
                            href={`/admin/fees/catalog?category=${cat.fee_category}`}
                            className="font-medium text-gray-900 hover:text-blue-600 transition-colors"
                          >
                            {cat.display_name}
                          </Link>
                          <span className="ml-2 text-[10px] text-gray-400">
                            {cat.fee_category}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">
                          {cat.count.toLocaleString()}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">
                          {cat.p25 != null ? `$${cat.p25.toFixed(2)}` : "-"}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-medium text-gray-900">
                          {cat.median != null ? `$${cat.median.toFixed(2)}` : "-"}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">
                          {cat.p75 != null ? `$${cat.p75.toFixed(2)}` : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
