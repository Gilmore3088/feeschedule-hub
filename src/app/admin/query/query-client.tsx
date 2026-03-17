"use client";

import { useState, useTransition } from "react";
import { runQuery } from "./actions";

const QUERY_GROUPS = [
  {
    label: "Overview",
    queries: [
      { label: "Dashboard stats", sql: "SELECT\n  (SELECT COUNT(*) FROM crawl_targets) as institutions,\n  (SELECT COUNT(*) FROM crawl_targets WHERE fee_schedule_url IS NOT NULL) as with_url,\n  (SELECT COUNT(DISTINCT crawl_target_id) FROM extracted_fees WHERE review_status = 'approved') as with_approved_fees,\n  (SELECT COUNT(*) FROM extracted_fees WHERE review_status = 'approved') as approved_fees,\n  (SELECT COUNT(*) FROM extracted_fees WHERE review_status = 'staged') as staged_fees,\n  (SELECT COUNT(*) FROM extracted_fees WHERE review_status = 'flagged') as flagged_fees" },
      { label: "Fee status breakdown", sql: "SELECT review_status, COUNT(*) as cnt FROM extracted_fees GROUP BY review_status ORDER BY cnt DESC" },
      { label: "All tables", sql: "SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view') ORDER BY name" },
    ],
  },
  {
    label: "Coverage",
    queries: [
      { label: "By state", sql: "SELECT ct.state_code, COUNT(*) as total,\n  SUM(CASE WHEN ct.fee_schedule_url IS NOT NULL THEN 1 ELSE 0 END) as with_url,\n  COUNT(DISTINCT CASE WHEN ef.review_status = 'approved' THEN ct.id END) as with_fees\nFROM crawl_targets ct\nLEFT JOIN extracted_fees ef ON ct.id = ef.crawl_target_id\nGROUP BY ct.state_code ORDER BY total DESC" },
      { label: "By charter type", sql: "SELECT charter_type,\n  COUNT(*) as total,\n  SUM(CASE WHEN fee_schedule_url IS NOT NULL THEN 1 ELSE 0 END) as with_url\nFROM crawl_targets GROUP BY charter_type" },
      { label: "Never discovered", sql: "SELECT state_code, COUNT(*) as cnt\nFROM crawl_targets\nWHERE (fee_schedule_url IS NULL OR fee_schedule_url = '')\n  AND website_url IS NOT NULL AND website_url != ''\n  AND id NOT IN (SELECT DISTINCT crawl_target_id FROM discovery_cache)\nGROUP BY state_code ORDER BY cnt DESC" },
      { label: "Have URL, no fees", sql: "SELECT ct.institution_name, ct.state_code, ct.fee_schedule_url\nFROM crawl_targets ct\nWHERE ct.fee_schedule_url IS NOT NULL\n  AND ct.id NOT IN (SELECT DISTINCT crawl_target_id FROM extracted_fees WHERE review_status != 'rejected')\nORDER BY ct.asset_size DESC LIMIT 30" },
    ],
  },
  {
    label: "Fees",
    queries: [
      { label: "Top institutions by fee count", sql: "SELECT ct.institution_name, ct.state_code, ct.charter_type, COUNT(*) as fees\nFROM extracted_fees ef\nJOIN crawl_targets ct ON ef.crawl_target_id = ct.id\nWHERE ef.review_status = 'approved'\nGROUP BY ct.id ORDER BY fees DESC LIMIT 20" },
      { label: "Average overdraft by state", sql: "SELECT ct.state_code, ROUND(AVG(ef.amount), 2) as avg_overdraft, COUNT(*) as institutions\nFROM extracted_fees ef\nJOIN crawl_targets ct ON ef.crawl_target_id = ct.id\nWHERE ef.fee_category = 'overdraft' AND ef.review_status = 'approved' AND ef.amount > 0\nGROUP BY ct.state_code ORDER BY avg_overdraft DESC" },
      { label: "Median fees by category", sql: "SELECT fee_category, COUNT(*) as cnt,\n  ROUND(AVG(amount), 2) as avg_amount,\n  MIN(amount) as min_amount,\n  MAX(amount) as max_amount\nFROM extracted_fees\nWHERE review_status = 'approved' AND amount > 0 AND fee_category IS NOT NULL\nGROUP BY fee_category ORDER BY cnt DESC" },
      { label: "Banks vs CUs (spotlight fees)", sql: "SELECT ef.fee_category, ct.charter_type,\n  COUNT(*) as cnt, ROUND(AVG(ef.amount), 2) as avg_fee\nFROM extracted_fees ef\nJOIN crawl_targets ct ON ef.crawl_target_id = ct.id\nWHERE ef.review_status = 'approved' AND ef.amount > 0\n  AND ef.fee_category IN ('overdraft', 'nsf', 'monthly_maintenance', 'atm_non_network', 'wire_domestic_outgoing')\nGROUP BY ef.fee_category, ct.charter_type\nORDER BY ef.fee_category, ct.charter_type" },
      { label: "Highest overdraft fees", sql: "SELECT ct.institution_name, ct.state_code, ef.amount, ef.fee_name\nFROM extracted_fees ef\nJOIN crawl_targets ct ON ef.crawl_target_id = ct.id\nWHERE ef.fee_category = 'overdraft' AND ef.review_status = 'approved' AND ef.amount > 0\nORDER BY ef.amount DESC LIMIT 20" },
      { label: "Free checking (no monthly fee)", sql: "SELECT ct.institution_name, ct.state_code, ct.charter_type, ef.amount, ef.conditions\nFROM extracted_fees ef\nJOIN crawl_targets ct ON ef.crawl_target_id = ct.id\nWHERE ef.fee_category = 'monthly_maintenance' AND ef.review_status = 'approved'\n  AND (ef.amount = 0 OR ef.amount IS NULL)\nORDER BY ct.asset_size DESC LIMIT 30" },
    ],
  },
  {
    label: "Pipeline",
    queries: [
      { label: "Recent jobs", sql: "SELECT id, command, status, started_at, completed_at, result_summary\nFROM ops_jobs ORDER BY id DESC LIMIT 15" },
      { label: "Discovery hit rate", sql: "SELECT discovery_method, result, COUNT(*) as cnt\nFROM discovery_cache\nGROUP BY discovery_method, result ORDER BY discovery_method, cnt DESC" },
      { label: "Failing institutions", sql: "SELECT institution_name, state_code, consecutive_failures, fee_schedule_url\nFROM crawl_targets\nWHERE consecutive_failures >= 3\nORDER BY consecutive_failures DESC LIMIT 20" },
      { label: "Recent auto-review actions", sql: "SELECT action, COUNT(*) as cnt, MIN(created_at) as earliest, MAX(created_at) as latest\nFROM fee_reviews\nWHERE username = 'system'\nGROUP BY action ORDER BY cnt DESC" },
      { label: "Price changes", sql: "SELECT ct.institution_name, fce.fee_category, fce.previous_amount, fce.new_amount, fce.change_type, fce.detected_at\nFROM fee_change_events fce\nJOIN crawl_targets ct ON fce.crawl_target_id = ct.id\nORDER BY fce.detected_at DESC LIMIT 20" },
      { label: "Data source freshness", sql: "SELECT 'FRED' as source, MAX(fetched_at) as last_refresh, COUNT(*) as rows FROM fed_economic_indicators\nUNION ALL SELECT 'Beige Book', MAX(fetched_at), COUNT(*) FROM fed_beige_book\nUNION ALL SELECT 'Fed Content', MAX(fetched_at), COUNT(*) FROM fed_content\nUNION ALL SELECT 'Complaints', MAX(fetched_at), COUNT(*) FROM institution_complaints\nUNION ALL SELECT 'Financials', MAX(fetched_at), COUNT(*) FROM institution_financials" },
    ],
  },
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
      {/* Query library */}
      <div className="admin-card p-4">
        <div className="space-y-3">
          {QUERY_GROUPS.map((group) => (
            <div key={group.label}>
              <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">{group.label}</div>
              <div className="flex flex-wrap gap-1.5">
                {group.queries.map((eq) => (
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
            </div>
          ))}
        </div>
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
