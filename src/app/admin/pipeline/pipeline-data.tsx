import { getDb } from "@/lib/crawler-db/connection";
import { UnifiedPipeline } from "./unified-pipeline";

function getPipelineData() {
  const db = getDb();

  const total = (db.prepare("SELECT COUNT(*) as c FROM crawl_targets").get() as { c: number }).c;

  // Discover stage
  const hasWebsite = (db.prepare("SELECT COUNT(*) as c FROM crawl_targets WHERE website_url IS NOT NULL AND website_url != ''").get() as { c: number }).c;
  const noWebsite = total - hasWebsite;
  const hasUrl = (db.prepare("SELECT COUNT(*) as c FROM crawl_targets WHERE fee_schedule_url IS NOT NULL AND fee_schedule_url != ''").get() as { c: number }).c;
  const needDiscover = hasWebsite - hasUrl;

  // Crawl stage
  const withFees = (db.prepare("SELECT COUNT(DISTINCT crawl_target_id) as c FROM extracted_fees WHERE review_status != 'rejected'").get() as { c: number }).c;
  const needCrawl = (db.prepare(`
    SELECT COUNT(*) as c FROM crawl_targets ct
    WHERE ct.fee_schedule_url IS NOT NULL AND ct.fee_schedule_url != ''
    AND NOT EXISTS (SELECT 1 FROM extracted_fees ef WHERE ef.crawl_target_id = ct.id AND ef.review_status != 'rejected')
    AND ct.consecutive_failures < 5
  `).get() as { c: number }).c;
  const failedCrawl = (db.prepare(`
    SELECT COUNT(*) as c FROM crawl_targets
    WHERE fee_schedule_url IS NOT NULL AND consecutive_failures >= 5
  `).get() as { c: number }).c;

  // Extract stage
  const totalFees = (db.prepare("SELECT COUNT(*) as c FROM extracted_fees WHERE review_status != 'rejected'").get() as { c: number }).c;
  const categorized = (db.prepare("SELECT COUNT(*) as c FROM extracted_fees WHERE fee_category IS NOT NULL AND fee_category != '' AND review_status != 'rejected'").get() as { c: number }).c;
  const uncategorized = totalFees - categorized;

  // Review stage
  const approved = (db.prepare("SELECT COUNT(*) as c FROM extracted_fees WHERE review_status = 'approved'").get() as { c: number }).c;
  const staged = (db.prepare("SELECT COUNT(*) as c FROM extracted_fees WHERE review_status = 'staged'").get() as { c: number }).c;
  const flagged = (db.prepare("SELECT COUNT(*) as c FROM extracted_fees WHERE review_status = 'flagged'").get() as { c: number }).c;
  const rejected = (db.prepare("SELECT COUNT(*) as c FROM extracted_fees WHERE review_status = 'rejected'").get() as { c: number }).c;

  // Top states needing crawl
  const stateGaps = db.prepare(`
    SELECT ct.state_code, COUNT(*) as c FROM crawl_targets ct
    WHERE ct.fee_schedule_url IS NOT NULL AND ct.fee_schedule_url != ''
    AND NOT EXISTS (SELECT 1 FROM extracted_fees ef WHERE ef.crawl_target_id = ct.id AND ef.review_status != 'rejected')
    AND ct.consecutive_failures < 5
    GROUP BY ct.state_code ORDER BY c DESC LIMIT 6
  `).all() as { state_code: string; c: number }[];

  return {
    stages: [
      {
        id: "discover",
        name: "Discover",
        count: hasUrl,
        total,
        pct: total > 0 ? Math.round((hasUrl / total) * 100) : 0,
        actionLabel: "Run Discover",
        actionHref: "/admin/ops",
        description: `${needDiscover.toLocaleString()} institutions have a website but no fee schedule URL. ${noWebsite.toLocaleString()} have no website at all.`,
        breakdowns: [
          { label: "Has fee URL", count: hasUrl, color: "text-emerald-600 dark:text-emerald-400" },
          { label: "Need discover", count: needDiscover, color: "text-amber-600 dark:text-amber-400" },
          { label: "No website", count: noWebsite, color: "text-red-500 dark:text-red-400" },
        ],
      },
      {
        id: "crawl",
        name: "Crawl",
        count: withFees,
        total,
        pct: total > 0 ? Math.round((withFees / total) * 100) : 0,
        actionLabel: "Run Crawl",
        actionHref: "/admin/ops",
        description: `${needCrawl.toLocaleString()} institutions have a URL but no extracted fees. ${failedCrawl.toLocaleString()} have failed 5+ times.`,
        breakdowns: [
          { label: "With fees", count: withFees, color: "text-emerald-600 dark:text-emerald-400" },
          { label: "Ready to crawl", count: needCrawl, color: "text-amber-600 dark:text-amber-400", href: "/admin/pipeline?status=no_fees" },
          { label: "Failed (5+ times)", count: failedCrawl, color: "text-red-500 dark:text-red-400" },
          ...stateGaps.map((s) => ({
            label: `${s.state_code} gaps`,
            count: s.c,
            color: "text-gray-500 dark:text-gray-400",
          })),
        ],
      },
      {
        id: "categorize",
        name: "Categorize",
        count: categorized,
        total: totalFees,
        pct: totalFees > 0 ? Math.round((categorized / totalFees) * 100) : 0,
        actionLabel: "Run Categorize",
        actionHref: "/admin/ops",
        description: `${uncategorized.toLocaleString()} fees don't match any of the 49 standard categories (long-tail fee names).`,
        breakdowns: [
          { label: "Categorized", count: categorized, color: "text-emerald-600 dark:text-emerald-400" },
          { label: "Uncategorized", count: uncategorized, color: "text-amber-600 dark:text-amber-400" },
          { label: "Total fees", count: totalFees },
        ],
      },
      {
        id: "review",
        name: "Review",
        count: approved,
        total: totalFees,
        pct: totalFees > 0 ? Math.round((approved / totalFees) * 100) : 0,
        actionLabel: "Review Queue",
        actionHref: "/admin/review",
        description: `${(staged + flagged).toLocaleString()} fees need review. ${staged.toLocaleString()} staged, ${flagged.toLocaleString()} flagged.`,
        breakdowns: [
          { label: "Approved", count: approved, color: "text-emerald-600 dark:text-emerald-400" },
          { label: "Staged", count: staged, color: "text-blue-600 dark:text-blue-400", href: "/admin/review?status=staged" },
          { label: "Flagged", count: flagged, color: "text-amber-600 dark:text-amber-400", href: "/admin/review?status=flagged" },
          { label: "Rejected", count: rejected, color: "text-red-500 dark:text-red-400" },
        ],
      },
    ],
  };
}

export function PipelineDashboard() {
  const data = getPipelineData();
  return <UnifiedPipeline stages={data.stages} />;
}
