"use client";

import { useState } from "react";
import Link from "next/link";

interface CategoryCoverage {
  fee_category: string;
  display_name: string;
  family: string;
  total: number;
  approved: number;
  has_amount: number;
  institutions: number;
  approval_rate: number;
}

interface CategoryCoverageTableProps {
  categories: CategoryCoverage[];
  totalInstitutions: number;
}

export function CategoryCoverageTable({ categories, totalInstitutions }: CategoryCoverageTableProps) {
  const [sortBy, setSortBy] = useState<"total" | "institutions" | "approval_rate" | "coverage">("institutions");
  const [showAll, setShowAll] = useState(false);

  const sorted = [...categories].sort((a, b) => {
    if (sortBy === "coverage") {
      return (b.institutions / totalInstitutions) - (a.institutions / totalInstitutions);
    }
    return (b[sortBy] as number) - (a[sortBy] as number);
  });

  const visible = showAll ? sorted : sorted.slice(0, 15);

  function coveragePct(institutions: number): number {
    return totalInstitutions > 0 ? (institutions / totalInstitutions) * 100 : 0;
  }

  function barColor(pct: number): string {
    if (pct >= 20) return "bg-emerald-500";
    if (pct >= 10) return "bg-amber-500";
    return "bg-red-400";
  }

  function approvalColor(pct: number): string {
    if (pct >= 90) return "text-emerald-600 dark:text-emerald-400";
    if (pct >= 70) return "text-amber-600 dark:text-amber-400";
    return "text-red-500 dark:text-red-400";
  }

  return (
    <div className="admin-card overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 dark:border-white/[0.06] flex items-center justify-between">
        <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
          Category Coverage ({categories.length} categories)
        </h3>
        <div className="flex gap-1">
          {(["institutions", "total", "approval_rate", "coverage"] as const).map((key) => (
            <button
              key={key}
              onClick={() => setSortBy(key)}
              className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                sortBy === key
                  ? "bg-gray-200 text-gray-700 dark:bg-white/[0.1] dark:text-gray-200"
                  : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              }`}
            >
              {key === "institutions" ? "Inst." : key === "total" ? "Obs." : key === "approval_rate" ? "Approval" : "Coverage"}
            </button>
          ))}
        </div>
      </div>

      <table className="w-full text-[12px]">
        <thead>
          <tr className="border-b border-gray-100 dark:border-white/[0.04] bg-gray-50/80 dark:bg-white/[0.02]">
            <th className="px-4 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Category</th>
            <th className="px-3 py-2 text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Obs.</th>
            <th className="px-3 py-2 text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Inst.</th>
            <th className="px-3 py-2 text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Appr.</th>
            <th className="px-4 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider" style={{ width: "140px" }}>Coverage</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((cat) => {
            const cov = coveragePct(cat.institutions);
            return (
              <tr key={cat.fee_category} className="border-b border-gray-50 dark:border-white/[0.03] last:border-0 hover:bg-gray-50/50 dark:hover:bg-white/[0.02] transition-colors">
                <td className="px-4 py-2">
                  <Link
                    href={`/admin/fees/catalog/${cat.fee_category}`}
                    className="text-gray-800 dark:text-gray-200 hover:text-blue-600 dark:hover:text-blue-400 transition-colors font-medium"
                  >
                    {cat.display_name}
                  </Link>
                  <div className="text-[10px] text-gray-400">{cat.family}</div>
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-600 dark:text-gray-400">
                  {cat.total.toLocaleString()}
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-medium text-gray-800 dark:text-gray-200">
                  {cat.institutions.toLocaleString()}
                </td>
                <td className={`px-3 py-2 text-right tabular-nums font-medium ${approvalColor(cat.approval_rate)}`}>
                  {cat.approval_rate.toFixed(0)}%
                </td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-gray-100 dark:bg-white/[0.06] rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${barColor(cov)}`}
                        style={{ width: `${Math.max(cov, 1)}%` }}
                      />
                    </div>
                    <span className="text-[10px] tabular-nums text-gray-400 w-8 text-right">
                      {cov.toFixed(0)}%
                    </span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {categories.length > 15 && (
        <div className="px-4 py-2 border-t border-gray-100 dark:border-white/[0.04]">
          <button
            onClick={() => setShowAll(!showAll)}
            className="text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline"
          >
            {showAll ? "Show top 15" : `Show all ${categories.length} categories`}
          </button>
        </div>
      )}
    </div>
  );
}
