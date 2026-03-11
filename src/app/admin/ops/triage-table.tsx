"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { formatAssets } from "@/lib/format";
import { classifyFailureReason } from "./actions";
import type { TriageEntry } from "@/lib/crawler-db/coverage";

const FAILURE_REASON_LABELS: Record<string, string> = {
  wrong_url: "Wrong URL",
  account_agreement: "Account Agreement",
  login_required: "Login Required",
  pdf_scanned: "Scanned PDF",
  pdf_complex: "Complex PDF",
  html_dynamic: "Dynamic/JS",
  multiple_links: "Multiple Links",
  no_fees_found: "No Fees Found",
  site_down: "Site Down",
};

const REASON_OPTIONS = [
  { value: "", label: "Classify..." },
  { value: "wrong_url", label: "Wrong URL" },
  { value: "account_agreement", label: "Account Agreement" },
  { value: "login_required", label: "Login Required" },
  { value: "pdf_scanned", label: "Scanned PDF" },
  { value: "pdf_complex", label: "Complex PDF" },
  { value: "html_dynamic", label: "Dynamic/JS" },
  { value: "multiple_links", label: "Multiple Links" },
  { value: "no_fees_found", label: "No Fees Found" },
  { value: "site_down", label: "Site Down" },
];

function ReasonDropdown({ entry }: { entry: TriageEntry }) {
  const [isPending, startTransition] = useTransition();
  const [currentReason, setCurrentReason] = useState(entry.failure_reason ?? "");

  function handleChange(value: string) {
    if (!value) return;
    setCurrentReason(value);
    startTransition(async () => {
      await classifyFailureReason(
        entry.id,
        value as Parameters<typeof classifyFailureReason>[1]
      );
    });
  }

  if (currentReason) {
    return (
      <span
        className={`inline-block rounded-full px-2 py-0.5 text-xs ${
          isPending
            ? "bg-gray-100 dark:bg-gray-800 text-gray-400"
            : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
        }`}
      >
        {isPending ? "..." : FAILURE_REASON_LABELS[currentReason] ?? currentReason}
      </span>
    );
  }

  return (
    <select
      value=""
      onChange={(e) => handleChange(e.target.value)}
      disabled={isPending}
      className="h-7 rounded border border-gray-200 bg-white px-1.5 text-[11px] text-gray-500 dark:bg-gray-900 dark:border-gray-700 dark:text-gray-400 cursor-pointer"
    >
      {REASON_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function TriageTable({ entries }: { entries: TriageEntry[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-gray-50/80 dark:bg-white/[0.03] text-left">
            <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider sticky left-0 bg-gray-50/80 dark:bg-gray-900 z-10 min-w-[200px]">
              Institution
            </th>
            <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-center w-12">
              Type
            </th>
            <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-center w-10">
              St
            </th>
            <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-right">
              Assets
            </th>
            <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-center">
              Doc
            </th>
            <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-center">
              Fails
            </th>
            <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
              Reason
            </th>
            <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
              URL
            </th>
            <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-center">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr
              key={e.id}
              className="border-b last:border-0 hover:bg-blue-50/30 dark:hover:bg-white/[0.02] transition-colors"
            >
              <td className="px-4 py-2.5 sticky left-0 bg-white dark:bg-gray-900 z-10">
                <Link
                  href={`/admin/institutions/${e.id}`}
                  className="text-gray-900 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400 transition-colors font-medium truncate block max-w-[240px]"
                >
                  {e.institution_name}
                </Link>
              </td>
              <td className="px-4 py-2.5 text-center">
                {e.charter_type === "bank" ? (
                  <span className="inline-block rounded-full bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 text-xs font-medium text-blue-600 dark:text-blue-400">
                    Bank
                  </span>
                ) : (
                  <span className="inline-block rounded-full bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    CU
                  </span>
                )}
              </td>
              <td className="px-4 py-2.5 text-center text-gray-500 dark:text-gray-400 text-xs">
                {e.state_code ?? "-"}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums text-gray-600 dark:text-gray-300">
                {formatAssets(e.asset_size)}
              </td>
              <td className="px-4 py-2.5 text-center">
                {e.document_type ? (
                  <span className="text-xs text-gray-500 dark:text-gray-400 uppercase">
                    {e.document_type}
                  </span>
                ) : (
                  <span className="text-gray-300 dark:text-gray-600">-</span>
                )}
              </td>
              <td className="px-4 py-2.5 text-center tabular-nums">
                {e.consecutive_failures > 0 ? (
                  <span className="text-xs font-medium text-red-600 dark:text-red-400">
                    {e.consecutive_failures}
                  </span>
                ) : (
                  <span className="text-gray-300 dark:text-gray-600">0</span>
                )}
              </td>
              <td className="px-4 py-2.5">
                <ReasonDropdown entry={e} />
              </td>
              <td className="px-4 py-2.5">
                {e.fee_schedule_url ? (
                  <a
                    href={e.fee_schedule_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline truncate block max-w-[160px]"
                  >
                    {(() => {
                      try {
                        return new URL(e.fee_schedule_url).hostname;
                      } catch {
                        return e.fee_schedule_url;
                      }
                    })()}
                  </a>
                ) : (
                  <span className="text-gray-300 dark:text-gray-600">-</span>
                )}
              </td>
              <td className="px-4 py-2.5 text-center">
                <div className="flex items-center justify-center gap-1">
                  <Link
                    href={`/admin/ops/entry/${e.id}`}
                    className="h-6 rounded px-2 text-[11px] font-medium bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors inline-flex items-center"
                  >
                    Enter Fees
                  </Link>
                </div>
              </td>
            </tr>
          ))}
          {entries.length === 0 && (
            <tr>
              <td colSpan={9} className="px-4 py-8 text-center text-gray-400 text-sm">
                No institutions match the current filters
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
