import { Suspense } from "react";
import { requireAuth, getCurrentUser, hasPermission } from "@/lib/auth";
import { getPipelineStats, getCoverageGaps, getDistinctStates } from "@/lib/crawler-db";
import { getDataQualityReport } from "@/lib/crawler-db";
import { getOpsJobSummary, getRecentJobs, getActiveJobs } from "@/lib/crawler-db/ops";
import { getStats } from "@/lib/crawler-db/core";
import { getAllowedCommands } from "@/lib/job-validation";
import { getTierCoverage, getDistrictCoverage } from "@/lib/crawler-db/quality";
import { sql } from "@/lib/crawler-db/connection";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { AddInstitutionForm } from "./add-institution";
import { BulkImportForm } from "./coverage-table";
import { PipelineTabs } from "./pipeline-tabs";
import { HealthTab } from "./health-tab";
import { OperationsTab } from "./operations-tab";
import { CoverageTab } from "./coverage-tab";

const PAGE_SIZE = 50;

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    status?: string;
    charter?: string;
    state?: string;
    q?: string;
    sort?: string;
    dir?: string;
    page?: string;
  }>;
}) {
  const user = await requireAuth("view");
  const canTrigger = hasPermission(user, "trigger_jobs");

  const params = await searchParams;
  const activeTab = (params.tab === "ops" || params.tab === "coverage") ? params.tab : "health";
  const activeStatus = params.status || "";
  const activeCharter = params.charter || "";
  const activeState = params.state || "";
  const searchQuery = params.q || "";
  const sortColumn = params.sort || "asset_size";
  const sortDir = params.dir || "desc";
  const currentPage = Math.max(1, parseInt(params.page || "1", 10) || 1);

  // Data for all tabs (lightweight queries)
  const stats = await getPipelineStats();
  const quality = await getDataQualityReport();

  // Health tab data
  const activeJobs = await getActiveJobs();
  let pendingReview = 0;
  try {
    const [row] = await sql`SELECT COUNT(*) as cnt FROM extracted_fees WHERE review_status IN ('pending', 'staged', 'flagged')`;
    pendingReview = Number(row.cnt);
  } catch { /* ignore */ }
  let lastCrawl: string | null = null;
  try {
    const rows = await sql`SELECT completed_at FROM crawl_runs WHERE status='completed' ORDER BY completed_at DESC LIMIT 1`;
    lastCrawl = rows[0]?.completed_at || null;
  } catch { /* ignore */ }

  // Operations tab data (only fetch if needed or canTrigger)
  const opsSummary = canTrigger ? await getOpsJobSummary() : { total: 0, running: 0, queued: 0, completed: 0, failed: 0, cancelled: 0 };
  const recentJobs = canTrigger ? await getRecentJobs(20) : [];
  const crawlStats = canTrigger ? await getStats() : { total_institutions: 0, banks: 0, credit_unions: 0, with_website: 0, with_fee_url: 0, total_fees: 0, crawl_runs: 0 } as Awaited<ReturnType<typeof getStats>>;
  const commands = canTrigger ? getAllowedCommands() : [];

  // Coverage tab data
  const states = await getDistinctStates();
  const { institutions, total } = await getCoverageGaps({
    status: activeStatus || undefined,
    charter: activeCharter || undefined,
    state: activeState || undefined,
    search: searchQuery || undefined,
    sort: sortColumn,
    dir: sortDir,
    limit: PAGE_SIZE,
    offset: (currentPage - 1) * PAGE_SIZE,
  });
  const totalPages = Math.ceil(total / PAGE_SIZE);

  // Tier/district coverage (for coverage tab)
  let tierCoverage: { tier: string; total: number; with_fees: number; pct: number }[] = [];
  let districtCoverage: { district: number; total: number; with_fees: number; pct: number }[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  try {
    const tierRows = await getTierCoverage();
    tierCoverage = (tierRows as any[]).map((r) => ({
      tier: r.asset_size_tier ?? r.tier, total: r.total, with_fees: r.with_fees,
      pct: r.total > 0 ? Math.round((r.with_fees / r.total) * 100) : 0,
    }));
    const districtRows = await getDistrictCoverage();
    districtCoverage = (districtRows as any[]).map((r) => ({
      district: r.fed_district ?? r.district, total: r.total, with_fees: r.with_fees,
      pct: r.total > 0 ? Math.round((r.with_fees / r.total) * 100) : 0,
    }));
  } catch { /* quality functions may not exist */ }

  return (
    <>
      <div className="mb-5">
        <Breadcrumbs items={[{ label: "Dashboard", href: "/admin" }, { label: "Pipeline" }]} />
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Data Pipeline</h1>
            <p className="text-[11px] text-gray-400 mt-0.5">Health, operations, and coverage</p>
          </div>
          <div className="flex items-center gap-2">
            <AddInstitutionForm />
            <BulkImportForm />
          </div>
        </div>
      </div>

      <Suspense fallback={<div className="h-64 flex items-center justify-center text-gray-400 text-sm">Loading...</div>}>
        <PipelineTabs activeTab={activeTab as "health" | "ops" | "coverage"}>
          {{
            health: (
              <HealthTab
                stats={stats}
                quality={quality}
                lastCrawlAt={lastCrawl}
                activeJobCount={activeJobs.length}
                pendingReviewCount={pendingReview}
              />
            ),
            ops: (
              <OperationsTab
                summary={opsSummary}
                activeJobs={activeJobs}
                recentJobs={recentJobs}
                crawlStats={crawlStats}
                commands={commands}
                username={user.username}
                canTrigger={canTrigger}
              />
            ),
            coverage: (
              <CoverageTab
                institutions={institutions}
                total={total}
                totalPages={totalPages}
                currentPage={currentPage}
                activeStatus={activeStatus}
                activeCharter={activeCharter}
                activeState={activeState}
                searchQuery={searchQuery}
                sortColumn={sortColumn}
                sortDir={sortDir}
                states={states}
                tierCoverage={tierCoverage}
                districtCoverage={districtCoverage}
              />
            ),
          }}
        </PipelineTabs>
      </Suspense>
    </>
  );
}
