"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { formatAssets, timeAgo } from "@/lib/format";
import { setFeeScheduleUrl, bulkImportUrls } from "./actions";
import type { CoverageGap } from "@/lib/crawler-db/pipeline";

export function StateFilter({
  states,
  activeState,
  activeStatus,
  activeCharter,
  searchQuery,
}: {
  states: string[];
  activeState: string;
  activeStatus: string;
  activeCharter: string;
  searchQuery: string;
}) {
  const router = useRouter();

  return (
    <select
      value={activeState}
      onChange={(e) => {
        const params = new URLSearchParams();
        if (activeStatus) params.set("status", activeStatus);
        if (activeCharter) params.set("charter", activeCharter);
        if (searchQuery) params.set("q", searchQuery);
        if (e.target.value) params.set("state", e.target.value);
        router.push(`/admin/pipeline?${params.toString()}`);
      }}
      className="rounded border border-gray-200 px-2 py-1 text-[11px] text-gray-600
                 dark:border-white/10 dark:bg-[oklch(0.18_0_0)] dark:text-gray-300"
    >
      <option value="">All States</option>
      {states.map((s) => (
        <option key={s} value={s}>{s}</option>
      ))}
    </select>
  );
}

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  no_url: { label: "No URL", cls: "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400" },
  no_fees: { label: "No Fees", cls: "bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400" },
  failing: { label: "Failing", cls: "bg-orange-50 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400" },
  stale: { label: "Stale", cls: "bg-gray-100 text-gray-500 dark:bg-white/[0.08] dark:text-gray-400" },
};

function SortHeader({
  column,
  label,
  currentSort,
  currentDir,
  className,
}: {
  column: string;
  label: string;
  currentSort: string;
  currentDir: string;
  className?: string;
}) {
  const searchParams = useSearchParams();
  const isActive = currentSort === column;
  const nextDir = isActive && currentDir === "desc" ? "asc" : "desc";

  const params = new URLSearchParams(searchParams.toString());
  params.set("sort", column);
  params.set("dir", nextDir);
  params.delete("page");

  const arrow = isActive ? (currentDir === "asc" ? " \u2191" : " \u2193") : "";

  return (
    <th className={`px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider ${className || ""}`}>
      <Link
        href={`/admin/pipeline?${params.toString()}`}
        className={`inline-flex items-center gap-0.5 transition-colors ${
          isActive
            ? "text-gray-900 dark:text-gray-100"
            : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
        }`}
      >
        {label}{arrow}
      </Link>
    </th>
  );
}

function InlineUrlForm({ institutionId }: { institutionId: number }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-[11px] font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 transition-colors"
      >
        Add URL
      </button>
    );
  }

  return (
    <form
      className="flex items-center gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const result = await setFeeScheduleUrl(institutionId, url);
          if (result.success) {
            setMessage("Saved");
            setOpen(false);
            setUrl("");
            router.refresh();
          } else {
            setMessage(result.error || "Failed");
          }
        });
      }}
    >
      <input
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://..."
        required
        autoFocus
        className="w-48 rounded border border-gray-300 px-2 py-1 text-xs
                   dark:border-white/20 dark:bg-[oklch(0.18_0_0)] dark:text-gray-200
                   focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-blue-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {pending ? "..." : "Save"}
      </button>
      <button
        type="button"
        onClick={() => { setOpen(false); setUrl(""); }}
        className="text-[10px] text-gray-400 hover:text-gray-600 transition-colors"
      >
        Cancel
      </button>
      {message && <span className="text-[10px] text-emerald-600">{message}</span>}
    </form>
  );
}

export function BulkImportForm() {
  const [open, setOpen] = useState(false);
  const [csv, setCsv] = useState("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ updated: number; errors: string[] } | null>(null);
  const router = useRouter();

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-[12px] font-medium text-gray-600 hover:bg-gray-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-300 dark:hover:bg-white/[0.06] transition-colors"
      >
        Bulk Import
      </button>
    );
  }

  return (
    <div className="admin-card p-4 mb-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">Bulk URL Import</p>
        <button onClick={() => { setOpen(false); setResult(null); }} className="text-xs text-gray-400 hover:text-gray-600 transition-colors">Close</button>
      </div>
      <p className="text-[11px] text-gray-400 mb-2">
        Paste CSV with columns: institution_id, fee_schedule_url
      </p>
      <textarea
        value={csv}
        onChange={(e) => setCsv(e.target.value)}
        rows={5}
        placeholder={"institution_id, fee_schedule_url\n8109, https://www.sccu.com/fee-schedule"}
        className="w-full rounded border border-gray-300 px-3 py-2 text-xs font-mono
                   dark:border-white/20 dark:bg-[oklch(0.18_0_0)] dark:text-gray-200
                   focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
      />
      <div className="mt-2 flex items-center gap-3">
        <button
          disabled={pending || !csv.trim()}
          onClick={() => {
            startTransition(async () => {
              const r = await bulkImportUrls(csv);
              setResult({ updated: r.updated, errors: r.errors });
              if (r.success) router.refresh();
            });
          }}
          className="rounded bg-blue-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {pending ? "Importing..." : "Import"}
        </button>
        {result && (
          <span className="text-[11px] text-gray-500">
            Updated {result.updated} rows
            {result.errors.length > 0 && ` (${result.errors.length} errors)`}
          </span>
        )}
      </div>
      {result && result.errors.length > 0 && (
        <div className="mt-2 max-h-24 overflow-y-auto rounded bg-red-50 dark:bg-red-900/20 px-3 py-2">
          {result.errors.map((e, i) => (
            <p key={i} className="text-[10px] text-red-600 dark:text-red-400">{e}</p>
          ))}
        </div>
      )}
    </div>
  );
}

interface CoverageTableProps {
  institutions: CoverageGap[];
  total: number;
  currentPage: number;
  totalPages: number;
  sortColumn: string;
  sortDir: string;
  states: string[];
}

export function CoverageTable({
  institutions,
  total,
  sortColumn,
  sortDir,
}: CoverageTableProps) {
  return (
    <div className="admin-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50/80 dark:bg-white/[0.03] text-left">
              <SortHeader column="institution" label="Institution" currentSort={sortColumn} currentDir={sortDir} />
              <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">State</th>
              <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Charter</th>
              <SortHeader column="asset_size" label="Assets" currentSort={sortColumn} currentDir={sortDir} className="text-right" />
              <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Status</th>
              <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Website</th>
              <SortHeader column="last_crawl" label="Last Crawl" currentSort={sortColumn} currentDir={sortDir} />
              <SortHeader column="failures" label="Failures" currentSort={sortColumn} currentDir={sortDir} className="text-right" />
              <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Action</th>
            </tr>
          </thead>
          <tbody>
            {institutions.map((inst) => {
              const st = STATUS_LABELS[inst.status] || STATUS_LABELS.no_url;
              return (
                <tr
                  key={inst.id}
                  className="border-b last:border-0 hover:bg-gray-50/50 dark:hover:bg-white/[0.02] transition-colors"
                >
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/admin/peers/${inst.id}`}
                      className="font-medium text-gray-900 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400 transition-colors text-xs"
                    >
                      {inst.institution_name}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-500">{inst.state_code || "-"}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-500">
                    {inst.charter_type === "bank" ? "Bank" : "CU"}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-xs text-gray-700 dark:text-gray-300">
                    {inst.asset_size ? formatAssets(inst.asset_size) : "-"}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${st.cls}`}>
                      {st.label}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    {inst.website_url ? (
                      <a
                        href={inst.website_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-blue-500 hover:text-blue-700 dark:text-blue-400 transition-colors truncate block max-w-[140px]"
                        title={inst.website_url}
                      >
                        {new URL(inst.website_url).hostname.replace("www.", "")}
                      </a>
                    ) : (
                      <span className="text-[11px] text-gray-300">-</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-500">
                    {inst.last_crawl_at ? timeAgo(inst.last_crawl_at) : "Never"}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-xs">
                    {inst.consecutive_failures > 0 ? (
                      <span className="text-red-600 dark:text-red-400 font-medium">{inst.consecutive_failures}</span>
                    ) : (
                      <span className="text-gray-300">0</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {inst.fee_schedule_url ? (
                      <a
                        href={inst.fee_schedule_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-emerald-600 hover:text-emerald-800 dark:text-emerald-400 transition-colors"
                      >
                        View URL
                      </a>
                    ) : (
                      <InlineUrlForm institutionId={inst.id} />
                    )}
                  </td>
                </tr>
              );
            })}
            {institutions.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-gray-500">
                  No institutions match the current filters
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
