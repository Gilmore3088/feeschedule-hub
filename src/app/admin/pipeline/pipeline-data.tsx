import { getPipelineStageCounts } from "@/lib/crawler-db/pipeline";
import { UnifiedPipeline } from "./unified-pipeline";

export function PipelineDashboard() {
  const d = getPipelineStageCounts();

  const noWebsite = d.total - d.hasWebsite;
  const needDiscover = d.hasWebsite - d.hasUrl;
  const uncategorized = d.totalFees - d.categorized;

  const stages = [
    {
      id: "discover",
      name: "Discover",
      count: d.hasUrl,
      total: d.total,
      pct: d.total > 0 ? Math.round((d.hasUrl / d.total) * 100) : 0,
      actionLabel: "Run Discover",
      actionHref: "/admin/ops",
      description: `${needDiscover.toLocaleString()} institutions have a website but no fee schedule URL. ${noWebsite.toLocaleString()} have no website at all.`,
      breakdowns: [
        { label: "Has fee URL", count: d.hasUrl, color: "text-emerald-600 dark:text-emerald-400" },
        { label: "Need discover", count: needDiscover, color: "text-amber-600 dark:text-amber-400" },
        { label: "No website", count: noWebsite, color: "text-red-500 dark:text-red-400" },
      ],
    },
    {
      id: "crawl",
      name: "Crawl",
      count: d.withFees,
      total: d.total,
      pct: d.total > 0 ? Math.round((d.withFees / d.total) * 100) : 0,
      actionLabel: "Run Crawl",
      actionHref: "/admin/ops",
      description: `${d.needCrawl.toLocaleString()} institutions have a URL but no extracted fees. ${d.failedCrawl.toLocaleString()} have failed 5+ times.`,
      breakdowns: [
        { label: "With fees", count: d.withFees, color: "text-emerald-600 dark:text-emerald-400" },
        { label: "Ready to crawl", count: d.needCrawl, color: "text-amber-600 dark:text-amber-400", href: "/admin/pipeline?status=no_fees" },
        { label: "Failed (5+ times)", count: d.failedCrawl, color: "text-red-500 dark:text-red-400" },
        ...d.stateGaps.map((s) => ({
          label: `${s.state_code} gaps`,
          count: s.count,
          color: "text-gray-500 dark:text-gray-400",
        })),
      ],
    },
    {
      id: "categorize",
      name: "Categorize",
      count: d.categorized,
      total: d.totalFees,
      pct: d.totalFees > 0 ? Math.round((d.categorized / d.totalFees) * 100) : 0,
      actionLabel: "Run Categorize",
      actionHref: "/admin/ops",
      description: `${uncategorized.toLocaleString()} fees don't match any of the 49 standard categories (long-tail fee names).`,
      breakdowns: [
        { label: "Categorized", count: d.categorized, color: "text-emerald-600 dark:text-emerald-400" },
        { label: "Uncategorized", count: uncategorized, color: "text-amber-600 dark:text-amber-400" },
        { label: "Total fees", count: d.totalFees },
      ],
    },
    {
      id: "review",
      name: "Review",
      count: d.approved,
      total: d.totalFees,
      pct: d.totalFees > 0 ? Math.round((d.approved / d.totalFees) * 100) : 0,
      actionLabel: "Review Queue",
      actionHref: "/admin/review",
      description: `${(d.staged + d.flagged).toLocaleString()} fees need review. ${d.staged.toLocaleString()} staged, ${d.flagged.toLocaleString()} flagged.`,
      breakdowns: [
        { label: "Approved", count: d.approved, color: "text-emerald-600 dark:text-emerald-400" },
        { label: "Staged", count: d.staged, color: "text-blue-600 dark:text-blue-400", href: "/admin/review?status=staged" },
        { label: "Flagged", count: d.flagged, color: "text-amber-600 dark:text-amber-400", href: "/admin/review?status=flagged" },
        { label: "Rejected", count: d.rejected, color: "text-red-500 dark:text-red-400" },
      ],
    },
  ];

  return <UnifiedPipeline stages={stages} />;
}
