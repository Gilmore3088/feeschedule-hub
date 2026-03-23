export const dynamic = "force-dynamic";

import Link from "next/link";
import { requireAuth, hasPermission } from "@/lib/auth";
import { sql } from "@/lib/crawler-db/connection";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { getCoverageFunnel, getTopUncategorized } from "@/lib/crawler-db/quality";
import {
  getDataQualityReport,
  getUncategorizedFeeCount,
  getNullAmountCount,
  getStaleInstitutionCount,
  getInvalidStateCodes,
  getDuplicateFees,
  getMissingFinancialsCount,
} from "@/lib/crawler-db/hygiene";
import { QuickActions } from "./quick-actions";

// -- Fee amount bounds (mirrored from fee_amount_rules.py) --
const FEE_AMOUNT_RULES: Record<
  string,
  [min: number, max: number, ceiling: number, allowsZero: boolean]
> = {
  monthly_maintenance: [0, 25, 50, true],
  minimum_balance: [0, 25, 50, true],
  early_closure: [5, 50, 100, true],
  dormant_account: [2, 50, 100, false],
  account_research: [5, 50, 100, false],
  paper_statement: [1, 10, 25, true],
  estatement_fee: [0, 5, 10, true],
  overdraft: [5, 40, 75, false],
  nsf: [5, 40, 75, false],
  continuous_od: [1, 15, 30, false],
  od_protection_transfer: [0, 20, 50, true],
  od_line_of_credit: [0, 35, 75, true],
  od_daily_cap: [25, 300, 500, false],
  nsf_daily_cap: [25, 300, 500, false],
  atm_non_network: [0.5, 10, 20, true],
  atm_international: [1, 7, 15, false],
  card_replacement: [0, 35, 60, true],
  rush_card: [10, 50, 75, false],
  card_foreign_txn: [0.5, 10, 15, true],
  card_dispute: [0, 25, 50, true],
  wire_domestic_outgoing: [5, 50, 75, false],
  wire_domestic_incoming: [0, 25, 50, true],
  wire_intl_outgoing: [10, 85, 125, false],
  wire_intl_incoming: [0, 30, 50, true],
  cashiers_check: [3, 25, 50, false],
  money_order: [1, 15, 25, false],
  check_printing: [5, 50, 100, false],
  stop_payment: [10, 40, 75, false],
  counter_check: [0.5, 10, 20, false],
  check_cashing: [2, 50, 75, false],
  check_image: [1, 15, 30, false],
  ach_origination: [0, 30, 50, true],
  ach_return: [2, 35, 50, false],
  bill_pay: [0, 15, 25, true],
  mobile_deposit: [0, 5, 10, true],
  zelle_fee: [0, 5, 10, true],
  coin_counting: [0, 15, 30, true],
  cash_advance: [2, 50, 100, false],
  deposited_item_return: [3, 40, 75, false],
  night_deposit: [0, 25, 50, true],
  notary_fee: [0, 15, 25, true],
  safe_deposit_box: [15, 500, 750, false],
  garnishment_levy: [15, 150, 250, false],
  legal_process: [15, 150, 250, false],
  account_verification: [2, 25, 50, true],
  balance_inquiry: [0, 5, 10, true],
  late_payment: [5, 50, 100, false],
  loan_origination: [0.25, 25, 50, false],
  appraisal_fee: [200, 800, 1500, false],
};

const FALLBACK_RULES: [number, number, number, boolean] = [0, 500, 1000, true];

// -- Data integrity checks --

interface CheckResult {
  name: string;
  status: "pass" | "fail" | "warn";
  detail: string;
  count?: number;
}

async function runIntegrityChecks(): Promise<CheckResult[]> {
  const checks: CheckResult[] = [];

  // 1. Orphaned fees (fees without a valid crawl_target)
  const [orphanRow] = await sql`
    SELECT COUNT(*) as cnt
    FROM extracted_fees ef
    LEFT JOIN crawl_targets ct ON ef.crawl_target_id = ct.id
    WHERE ct.id IS NULL
  `;
  const orphanCount = Number(orphanRow.cnt);
  checks.push({
    name: "No orphaned fees",
    status: orphanCount === 0 ? "pass" : "fail",
    detail:
      orphanCount === 0
        ? "All fees linked to valid institutions"
        : `${orphanCount} fees with missing crawl_target`,
    count: orphanCount,
  });

  // 2. Negative amounts
  const [negRow] = await sql`
    SELECT COUNT(*) as cnt
    FROM extracted_fees
    WHERE amount < 0 AND review_status != 'rejected'
  `;
  const negCount = Number(negRow.cnt);
  checks.push({
    name: "No negative amounts",
    status: negCount === 0 ? "pass" : "fail",
    detail:
      negCount === 0
        ? "All fee amounts are non-negative"
        : `${negCount} fees with negative amounts`,
    count: negCount,
  });

  // 3. Extreme amounts (> $10,000)
  const [extremeRow] = await sql`
    SELECT COUNT(*) as cnt
    FROM extracted_fees
    WHERE amount > 10000 AND review_status != 'rejected'
  `;
  const extremeCount = Number(extremeRow.cnt);
  checks.push({
    name: "No extreme amounts (> $10k)",
    status: extremeCount === 0 ? "pass" : "warn",
    detail:
      extremeCount === 0
        ? "No suspiciously large fee amounts"
        : `${extremeCount} fees exceed $10,000`,
    count: extremeCount,
  });

  // 4. Duplicate institution names
  const [dupInstRow] = await sql`
    SELECT COUNT(*) as cnt FROM (
      SELECT institution_name
      FROM crawl_targets
      GROUP BY institution_name
      HAVING COUNT(*) > 1
    ) sub
  `;
  const dupInstCount = Number(dupInstRow.cnt);
  checks.push({
    name: "No duplicate institution names",
    status: dupInstCount === 0 ? "pass" : "warn",
    detail:
      dupInstCount === 0
        ? "All institution names are unique"
        : `${dupInstCount} institution names appear more than once`,
    count: dupInstCount,
  });

  // 5. Null fee_category on non-rejected fees
  const uncatCount = await getUncategorizedFeeCount();
  checks.push({
    name: "All fees categorized",
    status: uncatCount === 0 ? "pass" : uncatCount < 50 ? "warn" : "fail",
    detail:
      uncatCount === 0
        ? "Every non-rejected fee has a category"
        : `${uncatCount} fees missing category`,
    count: uncatCount,
  });

  // 6. Null amounts (excluding free/waived)
  const nullAmtCount = await getNullAmountCount();
  checks.push({
    name: "All fees have amounts",
    status:
      nullAmtCount === 0 ? "pass" : nullAmtCount < 100 ? "warn" : "fail",
    detail:
      nullAmtCount === 0
        ? "Every non-free fee has a dollar amount"
        : `${nullAmtCount} fees missing amount`,
    count: nullAmtCount,
  });

  // 7. Stale institutions (no crawl in 90+ days)
  const staleCount = await getStaleInstitutionCount();
  checks.push({
    name: "Data freshness (90-day threshold)",
    status: staleCount === 0 ? "pass" : "warn",
    detail:
      staleCount === 0
        ? "All institutions crawled within 90 days"
        : `${staleCount} institutions not crawled in 90+ days`,
    count: staleCount,
  });

  // 8. Invalid state codes
  const invalidStates = await getInvalidStateCodes();
  const invalidStateCount = invalidStates.reduce(
    (sum, s) => sum + Number(s.institution_count),
    0,
  );
  checks.push({
    name: "Valid state codes",
    status: invalidStateCount === 0 ? "pass" : "fail",
    detail:
      invalidStateCount === 0
        ? "All state codes are valid US states"
        : `${invalidStateCount} institutions with invalid state codes (${invalidStates.map((s) => s.state_code).join(", ")})`,
    count: invalidStateCount,
  });

  // 9. Missing financials
  const missingFin = await getMissingFinancialsCount();
  checks.push({
    name: "Financial data linked",
    status: missingFin === 0 ? "pass" : "warn",
    detail:
      missingFin === 0
        ? "All institutions have financial data"
        : `${missingFin} institutions missing financials`,
    count: missingFin,
  });

  // 10. Zombie jobs (running > 2 hours)
  const [zombieRow] = await sql`
    SELECT COUNT(*) as cnt
    FROM ops_jobs
    WHERE status = 'running'
      AND started_at < NOW() - INTERVAL '2 hours'
  `;
  const zombieCount = Number(zombieRow.cnt);
  checks.push({
    name: "No zombie jobs",
    status: zombieCount === 0 ? "pass" : "fail",
    detail:
      zombieCount === 0
        ? "No jobs stuck in running state"
        : `${zombieCount} jobs running for 2+ hours`,
    count: zombieCount,
  });

  return checks;
}

// -- Table freshness --

interface TableFreshness {
  table_name: string;
  row_count: number;
  last_updated: string | null;
}

async function getTableFreshness(): Promise<TableFreshness[]> {
  const tables: TableFreshness[] = [];

  const queries: {
    name: string;
    countSql: ReturnType<typeof sql>;
    dateSql: ReturnType<typeof sql>;
  }[] = [
    {
      name: "crawl_targets",
      countSql: sql`SELECT COUNT(*) as cnt FROM crawl_targets`,
      dateSql: sql`SELECT MAX(updated_at) as latest FROM crawl_targets`,
    },
    {
      name: "extracted_fees",
      countSql: sql`SELECT COUNT(*) as cnt FROM extracted_fees`,
      dateSql: sql`SELECT MAX(updated_at) as latest FROM extracted_fees`,
    },
    {
      name: "crawl_runs",
      countSql: sql`SELECT COUNT(*) as cnt FROM crawl_runs`,
      dateSql: sql`SELECT MAX(completed_at) as latest FROM crawl_runs`,
    },
    {
      name: "institution_financials",
      countSql: sql`SELECT COUNT(*) as cnt FROM institution_financials`,
      dateSql: sql`SELECT MAX(created_at) as latest FROM institution_financials`,
    },
    {
      name: "ops_jobs",
      countSql: sql`SELECT COUNT(*) as cnt FROM ops_jobs`,
      dateSql: sql`SELECT MAX(created_at) as latest FROM ops_jobs`,
    },
    {
      name: "fee_index_cache",
      countSql: sql`SELECT COUNT(*) as cnt FROM fee_index_cache`,
      dateSql: sql`SELECT MAX(computed_at) as latest FROM fee_index_cache`,
    },
  ];

  for (const q of queries) {
    try {
      const [countRow] = await q.countSql;
      const [dateRow] = await q.dateSql;
      tables.push({
        table_name: q.name,
        row_count: Number((countRow as any).cnt),
        last_updated: (dateRow as any).latest
          ? new Date((dateRow as any).latest).toISOString()
          : null,
      });
    } catch {
      tables.push({
        table_name: q.name,
        row_count: 0,
        last_updated: null,
      });
    }
  }

  return tables;
}

// -- Outlier detection --

interface OutlierFee {
  id: number;
  institution_name: string;
  fee_category: string;
  fee_name: string;
  amount: number;
  expected_min: number;
  expected_max: number;
  severity: "warning" | "error";
}

async function getOutlierFees(limit = 30): Promise<OutlierFee[]> {
  const categories = Object.keys(FEE_AMOUNT_RULES);
  if (categories.length === 0) return [];

  const rows = await sql`
    SELECT
      ef.id,
      ct.institution_name,
      ef.fee_category,
      ef.fee_name,
      ef.amount
    FROM extracted_fees ef
    JOIN crawl_targets ct ON ef.crawl_target_id = ct.id
    WHERE ef.review_status != 'rejected'
      AND ef.amount IS NOT NULL
      AND ef.fee_category IS NOT NULL
    ORDER BY ef.amount DESC
    LIMIT 5000
  `;

  const outliers: OutlierFee[] = [];

  for (const row of rows) {
    const cat = row.fee_category as string;
    const amount = Number(row.amount);
    const rules = FEE_AMOUNT_RULES[cat] || FALLBACK_RULES;
    const [minAmt, maxAmt, ceiling, allowsZero] = rules;

    if (amount === 0 && allowsZero) continue;

    let severity: "warning" | "error" | null = null;
    if (amount > ceiling) {
      severity = "error";
    } else if (amount > maxAmt || amount < minAmt) {
      severity = "warning";
    }

    if (severity) {
      outliers.push({
        id: Number(row.id),
        institution_name: row.institution_name as string,
        fee_category: cat,
        fee_name: row.fee_name as string,
        amount,
        expected_min: minAmt,
        expected_max: maxAmt,
        severity,
      });
    }

    if (outliers.length >= limit) break;
  }

  return outliers;
}

// -- Compute integrity score --

function computeIntegrityScore(checks: CheckResult[]): number {
  if (checks.length === 0) return 100;
  const weights = { pass: 1, warn: 0.5, fail: 0 };
  const total = checks.reduce(
    (sum, c) => sum + weights[c.status],
    0,
  );
  return Math.round((total / checks.length) * 100);
}

// -- Helpers --

function timeAgo(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  if (isNaN(diff) || diff < 0) return "Just now";
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

function scoreColor(score: number): string {
  if (score >= 90) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 70) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function scoreBg(score: number): string {
  if (score >= 90) return "bg-emerald-50 dark:bg-emerald-900/20";
  if (score >= 70) return "bg-amber-50 dark:bg-amber-900/20";
  return "bg-red-50 dark:bg-red-900/20";
}

function statusIcon(status: "pass" | "fail" | "warn"): string {
  if (status === "pass") return "PASS";
  if (status === "warn") return "WARN";
  return "FAIL";
}

function statusColor(status: "pass" | "fail" | "warn"): string {
  if (status === "pass")
    return "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400";
  if (status === "warn")
    return "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
  return "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400";
}

// -- Page --

export default async function DataQualityPage() {
  const user = await requireAuth("view");
  const canTrigger = hasPermission(user, "trigger_jobs");

  const [checks, funnel, uncategorized, duplicates, freshness, outliers] =
    await Promise.all([
      runIntegrityChecks(),
      getCoverageFunnel(),
      getTopUncategorized(20),
      getDuplicateFees(),
      getTableFreshness(),
      getOutlierFees(30),
    ]);

  const score = computeIntegrityScore(checks);
  const passCount = checks.filter((c) => c.status === "pass").length;
  const warnCount = checks.filter((c) => c.status === "warn").length;
  const failCount = checks.filter((c) => c.status === "fail").length;

  // Coverage funnel percentages
  const funnelSteps = [
    {
      label: "Institutions",
      value: funnel.total_institutions,
      pct: 100,
    },
    {
      label: "With Website",
      value: funnel.with_website,
      pct:
        funnel.total_institutions > 0
          ? Math.round(
              (funnel.with_website / funnel.total_institutions) * 100,
            )
          : 0,
    },
    {
      label: "With Fee URL",
      value: funnel.with_fee_url,
      pct:
        funnel.total_institutions > 0
          ? Math.round(
              (funnel.with_fee_url / funnel.total_institutions) * 100,
            )
          : 0,
    },
    {
      label: "With Fees",
      value: funnel.with_fees,
      pct:
        funnel.total_institutions > 0
          ? Math.round(
              (funnel.with_fees / funnel.total_institutions) * 100,
            )
          : 0,
    },
    {
      label: "With Approved",
      value: funnel.with_approved,
      pct:
        funnel.total_institutions > 0
          ? Math.round(
              (funnel.with_approved / funnel.total_institutions) * 100,
            )
          : 0,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Breadcrumbs
          items={[
            { label: "Admin", href: "/admin" },
            { label: "Data Quality" },
          ]}
        />
        <h1 className="text-xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
          Data Quality Dashboard
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Integrity checks, coverage analysis, and outlier detection
        </p>
      </div>

      {/* Row 1: Integrity Score + Check Summary */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        {/* Score Card */}
        <div
          className={`admin-card flex flex-col items-center justify-center rounded-lg p-6 ${scoreBg(score)}`}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
            Integrity Score
          </p>
          <p
            className={`mt-1 text-5xl font-bold tabular-nums ${scoreColor(score)}`}
          >
            {score}
          </p>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            {passCount} pass / {warnCount} warn / {failCount} fail
          </p>
        </div>

        {/* Check Results Table */}
        <div className="admin-card col-span-1 overflow-hidden rounded-lg lg:col-span-3">
          <div className="bg-gray-50/80 px-4 py-2.5 dark:bg-white/[0.04]">
            <h2 className="text-sm font-bold text-gray-800 dark:text-gray-200">
              Integrity Checks
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/80 dark:border-white/[0.06] dark:bg-white/[0.02]">
                  <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                    Status
                  </th>
                  <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                    Check
                  </th>
                  <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                    Detail
                  </th>
                  <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                    Count
                  </th>
                </tr>
              </thead>
              <tbody>
                {checks.map((check, i) => (
                  <tr
                    key={i}
                    className="border-b border-gray-50 transition-colors hover:bg-gray-50/50 dark:border-white/[0.04] dark:hover:bg-white/[0.04]"
                  >
                    <td className="px-4 py-2">
                      <span
                        className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${statusColor(check.status)}`}
                      >
                        {statusIcon(check.status)}
                      </span>
                    </td>
                    <td className="px-4 py-2 font-medium text-gray-900 dark:text-gray-100">
                      {check.name}
                    </td>
                    <td className="px-4 py-2 text-gray-500 dark:text-gray-400">
                      {check.detail}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-gray-600 dark:text-gray-300">
                      {check.count !== undefined
                        ? formatNumber(check.count)
                        : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Row 2: Data Freshness + Coverage Funnel */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Data Freshness */}
        <div className="admin-card overflow-hidden rounded-lg">
          <div className="bg-gray-50/80 px-4 py-2.5 dark:bg-white/[0.04]">
            <h2 className="text-sm font-bold text-gray-800 dark:text-gray-200">
              Data Freshness
            </h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/80 dark:border-white/[0.06] dark:bg-white/[0.02]">
                <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                  Table
                </th>
                <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                  Rows
                </th>
                <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                  Last Updated
                </th>
              </tr>
            </thead>
            <tbody>
              {freshness.map((t) => (
                <tr
                  key={t.table_name}
                  className="border-b border-gray-50 transition-colors hover:bg-gray-50/50 dark:border-white/[0.04] dark:hover:bg-white/[0.04]"
                >
                  <td className="px-4 py-2 font-medium text-gray-900 dark:text-gray-100">
                    {t.table_name}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-gray-600 dark:text-gray-300">
                    {formatNumber(t.row_count)}
                  </td>
                  <td className="px-4 py-2 text-right text-gray-500 dark:text-gray-400">
                    {timeAgo(t.last_updated)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Coverage Funnel */}
        <div className="admin-card overflow-hidden rounded-lg">
          <div className="bg-gray-50/80 px-4 py-2.5 dark:bg-white/[0.04]">
            <h2 className="text-sm font-bold text-gray-800 dark:text-gray-200">
              Coverage Funnel
            </h2>
          </div>
          <div className="space-y-3 p-4">
            {funnelSteps.map((step, i) => (
              <div key={step.label}>
                <div className="mb-1 flex items-baseline justify-between">
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                    {step.label}
                  </span>
                  <span className="text-xs tabular-nums text-gray-500 dark:text-gray-400">
                    {formatNumber(step.value)}{" "}
                    <span className="text-[10px] text-gray-400">
                      ({step.pct}%)
                    </span>
                  </span>
                </div>
                <div className="h-5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-white/[0.06]">
                  <div
                    className={`h-full rounded-full transition-all ${
                      i === 0
                        ? "bg-gray-400 dark:bg-gray-500"
                        : i === funnelSteps.length - 1
                          ? "bg-emerald-500 dark:bg-emerald-600"
                          : "bg-blue-400 dark:bg-blue-500"
                    }`}
                    style={{ width: `${step.pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Row 3: Uncategorized Fees + Duplicate Detection */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Uncategorized Fees */}
        <div className="admin-card overflow-hidden rounded-lg">
          <div className="bg-gray-50/80 px-4 py-2.5 dark:bg-white/[0.04]">
            <h2 className="text-sm font-bold text-gray-800 dark:text-gray-200">
              Top Uncategorized Fees
            </h2>
          </div>
          {uncategorized.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-gray-400">
              All fees are categorized
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/80 dark:border-white/[0.06] dark:bg-white/[0.02]">
                  <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                    Fee Name
                  </th>
                  <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                    Count
                  </th>
                </tr>
              </thead>
              <tbody>
                {uncategorized.map((fee) => (
                  <tr
                    key={fee.fee_name}
                    className="border-b border-gray-50 transition-colors hover:bg-gray-50/50 dark:border-white/[0.04] dark:hover:bg-white/[0.04]"
                  >
                    <td className="max-w-[280px] truncate px-4 py-2 text-gray-900 dark:text-gray-100">
                      {fee.fee_name}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-gray-600 dark:text-gray-300">
                      {formatNumber(Number(fee.count))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Duplicate Detection */}
        <div className="admin-card overflow-hidden rounded-lg">
          <div className="bg-gray-50/80 px-4 py-2.5 dark:bg-white/[0.04]">
            <h2 className="text-sm font-bold text-gray-800 dark:text-gray-200">
              Duplicate Fees
            </h2>
            <p className="text-[10px] text-gray-400">
              Same fee name appearing multiple times at one institution
            </p>
          </div>
          {duplicates.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-gray-400">
              No duplicate fees detected
            </p>
          ) : (
            <div className="max-h-[400px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0">
                  <tr className="border-b border-gray-100 bg-gray-50/80 dark:border-white/[0.06] dark:bg-white/[0.02]">
                    <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                      Institution
                    </th>
                    <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                      Fee
                    </th>
                    <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                      Dupes
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {duplicates.slice(0, 25).map((d, i) => (
                    <tr
                      key={i}
                      className="border-b border-gray-50 transition-colors hover:bg-gray-50/50 dark:border-white/[0.04] dark:hover:bg-white/[0.04]"
                    >
                      <td className="max-w-[180px] truncate px-4 py-2">
                        <Link
                          href={`/admin/institutions/${d.institution_id}`}
                          className="text-gray-900 transition-colors hover:text-blue-600 dark:text-gray-100"
                        >
                          {d.institution_name}
                        </Link>
                      </td>
                      <td className="max-w-[180px] truncate px-4 py-2 text-gray-500 dark:text-gray-400">
                        {d.fee_name}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-gray-600 dark:text-gray-300">
                        {Number(d.count)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Row 4: Outlier Detection */}
      <div className="admin-card overflow-hidden rounded-lg">
        <div className="bg-gray-50/80 px-4 py-2.5 dark:bg-white/[0.04]">
          <h2 className="text-sm font-bold text-gray-800 dark:text-gray-200">
            Outlier Detection
          </h2>
          <p className="text-[10px] text-gray-400">
            Fees outside expected bounds per fee_amount_rules
          </p>
        </div>
        {outliers.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-gray-400">
            No outliers detected
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/80 dark:border-white/[0.06] dark:bg-white/[0.02]">
                  <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                    Severity
                  </th>
                  <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                    Institution
                  </th>
                  <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                    Category
                  </th>
                  <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                    Fee Name
                  </th>
                  <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                    Amount
                  </th>
                  <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                    Expected Range
                  </th>
                </tr>
              </thead>
              <tbody>
                {outliers.map((o) => (
                  <tr
                    key={o.id}
                    className="border-b border-gray-50 transition-colors hover:bg-gray-50/50 dark:border-white/[0.04] dark:hover:bg-white/[0.04]"
                  >
                    <td className="px-4 py-2">
                      <span
                        className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                          o.severity === "error"
                            ? "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                            : "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                        }`}
                      >
                        {o.severity}
                      </span>
                    </td>
                    <td className="max-w-[160px] truncate px-4 py-2 text-gray-900 dark:text-gray-100">
                      {o.institution_name}
                    </td>
                    <td className="px-4 py-2 text-gray-500 dark:text-gray-400">
                      {o.fee_category}
                    </td>
                    <td className="max-w-[180px] truncate px-4 py-2 text-gray-500 dark:text-gray-400">
                      {o.fee_name}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium text-gray-900 dark:text-gray-100">
                      ${o.amount.toFixed(2)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-gray-400">
                      ${o.expected_min.toFixed(2)} - $
                      {o.expected_max.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Row 5: Quick Actions */}
      <div className="admin-card overflow-hidden rounded-lg">
        <div className="bg-gray-50/80 px-4 py-2.5 dark:bg-white/[0.04]">
          <h2 className="text-sm font-bold text-gray-800 dark:text-gray-200">
            Quick Actions
          </h2>
        </div>
        <div className="p-4">
          <QuickActions canTrigger={canTrigger} />
        </div>
      </div>
    </div>
  );
}
