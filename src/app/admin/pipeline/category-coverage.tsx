"use client";

import { useState, useMemo, Fragment } from "react";
import Link from "next/link";

interface CategoryCoverage {
  fee_category: string;
  display_name: string;
  family: string;
  tier: string;
  total: number;
  approved: number;
  staged: number;
  flagged: number;
  has_amount: number;
  institutions: number;
  approval_rate: number;
  top_states: { state: string; count: number }[];
}

interface CategoryCoverageTableProps {
  categories: CategoryCoverage[];
  totalInstitutions: number;
  families: string[];
}

type SortKey = "total" | "institutions" | "approval_rate" | "coverage";

export function CategoryCoverageTable({ categories, totalInstitutions, families }: CategoryCoverageTableProps) {
  const [sortBy, setSortBy] = useState<SortKey>("institutions");
  const [familyFilter, setFamilyFilter] = useState("");
  const [tierFilter, setTierFilter] = useState("");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [expandedFamily, setExpandedFamily] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [groupByFamily, setGroupByFamily] = useState(true);

  const filtered = useMemo(() => {
    let result = categories;
    if (familyFilter) result = result.filter((c) => c.family === familyFilter);
    if (tierFilter) result = result.filter((c) => c.tier === tierFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((c) => c.display_name.toLowerCase().includes(q) || c.fee_category.includes(q));
    }
    return result;
  }, [categories, familyFilter, tierFilter, searchQuery]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (sortBy === "coverage") return (b.institutions / totalInstitutions) - (a.institutions / totalInstitutions);
      return (b[sortBy] as number) - (a[sortBy] as number);
    });
  }, [filtered, sortBy, totalInstitutions]);

  // Group by family for collapsed view
  const familyGroups = useMemo(() => {
    const groups = new Map<string, { family: string; categories: typeof sorted; total: number; approved: number; institutions: number }>();
    for (const cat of sorted) {
      const existing = groups.get(cat.family);
      if (existing) {
        existing.categories.push(cat);
        existing.total += cat.total;
        existing.approved += cat.approved;
        existing.institutions += cat.institutions;
      } else {
        groups.set(cat.family, {
          family: cat.family,
          categories: [cat],
          total: cat.total,
          approved: cat.approved,
          institutions: cat.institutions,
        });
      }
    }
    return Array.from(groups.values()).sort((a, b) => b.total - a.total);
  }, [sorted]);

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
      {/* Header with filters */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-white/[0.06]">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
            Category Coverage ({filtered.length} of {categories.length})
          </h3>
          <div className="flex gap-2 items-center">
            <button
              onClick={() => setGroupByFamily(!groupByFamily)}
              className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                groupByFamily
                  ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                  : "text-gray-400 hover:text-gray-600"
              }`}
            >
              {groupByFamily ? "Grouped" : "Flat"}
            </button>
            <span className="text-gray-300 dark:text-white/[0.1]">|</span>
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
        <div className="flex gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search categories..."
            className="flex-1 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-[11px] dark:bg-[oklch(0.18_0_0)] dark:border-white/[0.12] dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <select
            value={familyFilter}
            onChange={(e) => setFamilyFilter(e.target.value)}
            className="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] dark:bg-[oklch(0.18_0_0)] dark:border-white/[0.12] dark:text-gray-100"
          >
            <option value="">All Families</option>
            {families.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <select
            value={tierFilter}
            onChange={(e) => setTierFilter(e.target.value)}
            className="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] dark:bg-[oklch(0.18_0_0)] dark:border-white/[0.12] dark:text-gray-100"
          >
            <option value="">All Tiers</option>
            <option value="spotlight">Spotlight</option>
            <option value="core">Core</option>
            <option value="extended">Extended</option>
            <option value="comprehensive">Comprehensive</option>
          </select>
        </div>
      </div>

      <div className="max-h-[500px] overflow-y-auto">
        <table className="w-full text-[12px]">
          <thead className="sticky top-0 bg-gray-50/95 dark:bg-[oklch(0.16_0_0)]/95 backdrop-blur-sm z-10">
            <tr className="border-b border-gray-100 dark:border-white/[0.04]">
              <th className="px-4 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Category</th>
              <th className="px-3 py-2 text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Obs.</th>
              <th className="px-3 py-2 text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Inst.</th>
              <th className="px-3 py-2 text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Appr.</th>
              <th className="px-4 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider" style={{ width: "140px" }}>Coverage</th>
              <th className="px-2 py-2 w-6"></th>
            </tr>
          </thead>
          <tbody>
            {/* Grouped by family view */}
            {groupByFamily && familyGroups.map((group) => {
              const groupApprovalRate = group.total > 0 ? (group.approved / group.total) * 100 : 0;
              const isOpen = expandedFamily === group.family;
              return (
                <Fragment key={group.family}>
                  <tr
                    className="border-b border-gray-100 dark:border-white/[0.04] cursor-pointer hover:bg-gray-50/50 dark:hover:bg-white/[0.02] bg-gray-50/30 dark:bg-white/[0.01]"
                    onClick={() => setExpandedFamily(isOpen ? null : group.family)}
                  >
                    <td className="px-4 py-2.5">
                      <span className="text-[13px] font-semibold text-gray-800 dark:text-gray-200">{group.family}</span>
                      <span className="ml-2 text-[10px] text-gray-400">{group.categories.length} categories</span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-600 dark:text-gray-400 font-medium">{group.total.toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-bold text-gray-800 dark:text-gray-200">{group.institutions.toLocaleString()}</td>
                    <td className={`px-3 py-2.5 text-right tabular-nums font-medium ${approvalColor(groupApprovalRate)}`}>{groupApprovalRate.toFixed(0)}%</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-gray-100 dark:bg-white/[0.06] rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${barColor(coveragePct(group.institutions))}`} style={{ width: `${Math.max(coveragePct(group.institutions), 1)}%` }} />
                        </div>
                        <span className="text-[10px] tabular-nums text-gray-400 w-8 text-right">{coveragePct(group.institutions).toFixed(0)}%</span>
                      </div>
                    </td>
                    <td className="px-2 py-2.5 text-gray-300">
                      <svg className={`w-3 h-3 transition-transform ${isOpen ? "rotate-90" : ""}`} viewBox="0 0 12 12" fill="currentColor">
                        <path d="M4 2l4 4-4 4" />
                      </svg>
                    </td>
                  </tr>
                  {isOpen && group.categories.map((cat) => {
                    const cov = coveragePct(cat.institutions);
                    return (
                      <tr key={cat.fee_category} className="border-b border-gray-50 dark:border-white/[0.02] hover:bg-gray-50/30 dark:hover:bg-white/[0.01]">
                        <td className="pl-8 pr-4 py-1.5 text-[11px] text-gray-600 dark:text-gray-400">
                          <Link href={`/admin/fees/catalog/${cat.fee_category}`} className="hover:text-blue-600 transition-colors">
                            {cat.display_name}
                          </Link>
                          <span className="ml-1 text-[9px] text-gray-300 uppercase">{cat.tier}</span>
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-[11px] text-gray-500">{cat.total.toLocaleString()}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-[11px] text-gray-700 dark:text-gray-300">{cat.institutions.toLocaleString()}</td>
                        <td className={`px-3 py-1.5 text-right tabular-nums text-[11px] ${approvalColor(cat.approval_rate)}`}>{cat.approval_rate.toFixed(0)}%</td>
                        <td className="px-4 py-1.5">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1 bg-gray-100 dark:bg-white/[0.06] rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${barColor(cov)}`} style={{ width: `${Math.max(cov, 1)}%` }} />
                            </div>
                            <span className="text-[9px] tabular-nums text-gray-400 w-7 text-right">{cov.toFixed(0)}%</span>
                          </div>
                        </td>
                        <td></td>
                      </tr>
                    );
                  })}
                </Fragment>
              );
            })}

            {/* Flat view */}
            {!groupByFamily && sorted.map((cat) => {
              const cov = coveragePct(cat.institutions);
              const isExpanded = expandedRow === cat.fee_category;

              return (
                <Fragment key={cat.fee_category}>
                  <tr
                    className={`border-b border-gray-50 dark:border-white/[0.03] hover:bg-gray-50/50 dark:hover:bg-white/[0.02] transition-colors cursor-pointer ${
                      isExpanded ? "bg-gray-50/80 dark:bg-white/[0.04]" : ""
                    }`}
                    onClick={() => setExpandedRow(isExpanded ? null : cat.fee_category)}
                  >
                    <td className="px-4 py-2">
                      <span className="text-gray-800 dark:text-gray-200 font-medium">{cat.display_name}</span>
                      <div className="flex gap-2 mt-0.5">
                        <span className="text-[10px] text-gray-400">{cat.family}</span>
                        <span className="text-[9px] text-gray-300 uppercase">{cat.tier}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-600 dark:text-gray-400">{cat.total.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium text-gray-800 dark:text-gray-200">{cat.institutions.toLocaleString()}</td>
                    <td className={`px-3 py-2 text-right tabular-nums font-medium ${approvalColor(cat.approval_rate)}`}>{cat.approval_rate.toFixed(0)}%</td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-gray-100 dark:bg-white/[0.06] rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${barColor(cov)}`} style={{ width: `${Math.max(cov, 1)}%` }} />
                        </div>
                        <span className="text-[10px] tabular-nums text-gray-400 w-8 text-right">{cov.toFixed(0)}%</span>
                      </div>
                    </td>
                    <td className="px-2 py-2 text-gray-300">
                      <svg className={`w-3 h-3 transition-transform ${isExpanded ? "rotate-90" : ""}`} viewBox="0 0 12 12" fill="currentColor">
                        <path d="M4 2l4 4-4 4" />
                      </svg>
                    </td>
                  </tr>

                  {isExpanded && (
                    <tr className="border-b border-gray-100 dark:border-white/[0.06]">
                      <td colSpan={6} className="px-4 py-3 bg-gray-50/50 dark:bg-white/[0.02]">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                          <div>
                            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Approved</div>
                            <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{cat.approved.toLocaleString()}</div>
                          </div>
                          <div>
                            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Staged</div>
                            <div className="text-sm font-bold text-blue-600 dark:text-blue-400 tabular-nums">{cat.staged.toLocaleString()}</div>
                          </div>
                          <div>
                            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Flagged</div>
                            <div className="text-sm font-bold text-amber-600 dark:text-amber-400 tabular-nums">{cat.flagged.toLocaleString()}</div>
                          </div>
                          <div>
                            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">With Amount</div>
                            <div className="text-sm font-bold text-gray-700 dark:text-gray-300 tabular-nums">{cat.has_amount.toLocaleString()}</div>
                          </div>
                        </div>

                        {cat.top_states.length > 0 && (
                          <div className="mb-3">
                            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Top States</div>
                            <div className="flex flex-wrap gap-1">
                              {cat.top_states.map((s) => (
                                <span key={s.state} className="inline-flex items-center rounded bg-gray-100 dark:bg-white/[0.06] px-1.5 py-0.5 text-[10px] tabular-nums text-gray-600 dark:text-gray-400">
                                  {s.state}: {s.count}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        <Link
                          href={`/admin/fees/catalog/${cat.fee_category}`}
                          className="text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          View in catalog
                        </Link>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="px-4 py-2 border-t border-gray-200 dark:border-white/[0.06] text-[10px] text-gray-400 flex gap-4">
        <span>{filtered.length} categories</span>
        <span>{filtered.reduce((s, c) => s + c.total, 0).toLocaleString()} observations</span>
        <span>{new Set(filtered.map((c) => c.family)).size} families</span>
      </div>
    </div>
  );
}
