"use client";

import { useState, useTransition } from "react";
import { runQuery } from "./actions";

const EXAMPLE_QUERIES = [
  { label: "Fee status counts", sql: "SELECT review_status, COUNT(*) as cnt FROM extracted_fees GROUP BY review_status ORDER BY cnt DESC" },
  { label: "Top institutions by fees", sql: "SELECT ct.institution_name, ct.state_code, COUNT(*) as fees FROM extracted_fees ef JOIN crawl_targets ct ON ef.crawl_target_id = ct.id WHERE ef.review_status = 'approved' GROUP BY ct.id ORDER BY fees DESC LIMIT 20" },
  { label: "Coverage by state", sql: "SELECT ct.state_code, COUNT(*) as total, SUM(CASE WHEN ct.fee_schedule_url IS NOT NULL THEN 1 ELSE 0 END) as with_url, COUNT(DISTINCT CASE WHEN ef.id IS NOT NULL THEN ct.id END) as with_fees FROM crawl_targets ct LEFT JOIN extracted_fees ef ON ct.id = ef.crawl_target_id AND ef.review_status = 'approved' GROUP BY ct.state_code ORDER BY total DESC" },
  { label: "Recent price changes", sql: "SELECT ct.institution_name, fce.fee_category, fce.previous_amount, fce.new_amount, fce.change_type, fce.detected_at FROM fee_change_events fce JOIN crawl_targets ct ON fce.crawl_target_id = ct.id ORDER BY fce.detected_at DESC LIMIT 20" },
  { label: "Discovery stats", sql: "SELECT discovery_method, result, COUNT(*) as cnt FROM discovery_cache GROUP BY discovery_method, result ORDER BY cnt DESC" },
  { label: "All tables", sql: "SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view') ORDER BY name" },
];

export function QueryClient() {
  const [sql, setSql] = useState("");
  const [result, setResult] = useState<{
    columns?: string[];
    rows?: Record<string, unknown>[];
    count?: number;
    error?: string;
    duration?: number;
  } | null>(null);
  const [pending, startTransition] = useTransition();

  function handleRun() {
    if (!sql.trim()) return;
    startTransition(async () => {
      const res = await runQuery(sql);
      setResult(res);
    });
  }

  function handleExample(query: string) {
    setSql(query);
    startTransition(async () => {
      const res = await runQuery(query);
      setResult(res);
    });
  }

  return (
    <div className="space-y-4">
      {/* Example queries */}
      <div className="flex flex-wrap gap-1.5">
        {EXAMPLE_QUERIES.map((eq) => (
          <button
            key={eq.label}
            onClick={() => handleExample(eq.sql)}
            disabled={pending}
            className="rounded-md border border-gray-200 dark:border-white/[0.1] px-2.5 py-1 text-[11px] font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/[0.06] hover:border-gray-400 dark:hover:border-white/[0.2] disabled:opacity-40 transition-colors"
          >
            {eq.label}
          </button>
        ))}
      </div>

      {/* Query input */}
      <div className="admin-card overflow-hidden">
        <textarea
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          placeholder="SELECT * FROM crawl_targets LIMIT 10"
          rows={4}
          className="w-full px-4 py-3 text-[13px] font-mono bg-gray-900 dark:bg-gray-950 text-emerald-400 border-0 focus:outline-none focus:ring-0 resize-y"
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              handleRun();
            }
          }}
        />
        <div className="px-4 py-2 bg-gray-50 dark:bg-white/[0.02] border-t border-gray-200 dark:border-white/[0.06] flex items-center justify-between">
          <span className="text-[10px] text-gray-400">
            Cmd+Enter to run. Read-only queries only. Max 500 rows.
          </span>
          <button
            onClick={handleRun}
            disabled={pending || !sql.trim()}
            className="rounded-md bg-gray-900 dark:bg-white/[0.1] px-4 py-1.5 text-[11px] font-semibold text-white hover:bg-gray-800 dark:hover:bg-white/[0.15] disabled:opacity-40 transition-colors"
          >
            {pending ? "Running..." : "Run Query"}
          </button>
        </div>
      </div>

      {/* Results */}
      {result && (
        <div className="admin-card overflow-hidden">
          {result.error ? (
            <div className="px-4 py-3 text-[12px] text-red-500 font-mono">
              {result.error}
            </div>
          ) : (
            <>
              <div className="px-4 py-2 bg-gray-50 dark:bg-white/[0.02] border-b border-gray-200 dark:border-white/[0.06] flex items-center justify-between">
                <span className="text-[11px] text-gray-500">
                  {result.count} row{result.count !== 1 ? "s" : ""}
                  {result.count && result.count > 500 && " (showing first 500)"}
                </span>
                <span className="text-[10px] text-gray-400 tabular-nums">
                  {result.duration}ms
                </span>
              </div>
              <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                <table className="w-full text-[12px]">
                  <thead className="sticky top-0 bg-gray-50/95 dark:bg-[oklch(0.16_0_0)]/95 backdrop-blur-sm">
                    <tr className="border-b border-gray-100 dark:border-white/[0.04]">
                      {result.columns?.map((col) => (
                        <th key={col} className="px-3 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows?.map((row, i) => (
                      <tr key={i} className="border-b border-gray-50 dark:border-white/[0.03] hover:bg-gray-50/50 dark:hover:bg-white/[0.02]">
                        {result.columns?.map((col) => (
                          <td key={col} className="px-3 py-1.5 tabular-nums text-gray-700 dark:text-gray-300 whitespace-nowrap max-w-[300px] truncate" title={String(row[col] ?? "")}>
                            {row[col] === null ? <span className="text-gray-300 dark:text-gray-600 italic">null</span> : String(row[col])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
