import type {
  ReviewStats,
  StuckReviewItems,
  CrawlHealth,
  DailyTrend,
  PeerFilteredStats,
  VolatileCategory,
  RiskOutlierData,
  IndexEntry,
} from "@/lib/crawler-db";
import { getDisplayName } from "@/lib/fee-taxonomy";
import { formatAmount } from "@/lib/format";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type InsightSeverity = "critical" | "warning" | "info" | "positive";
export type InsightDomain = "review" | "crawl" | "index" | "risk" | "coverage";

export interface InsightAction {
  label: string;
  href: string;
}

export interface Insight {
  id: string;
  severity: InsightSeverity;
  domain: InsightDomain;
  headline: string;
  body: string;
  metric?: string;
  action?: InsightAction;
  priority: number;
}

export interface DashboardData {
  reviewStats: ReviewStats;
  stuckItems: StuckReviewItems;
  crawlHealth: CrawlHealth;
  dailyTrends: DailyTrend[];
  peerStats: PeerFilteredStats;
  nationalStats: PeerFilteredStats | null;
  indexSnapshot: IndexEntry[];
  volatileCategories: VolatileCategory[];
  riskOutliers: RiskOutlierData;
}

// ---------------------------------------------------------------------------
// Review Insights
// ---------------------------------------------------------------------------

function reviewInsights(
  stats: ReviewStats,
  stuck: StuckReviewItems
): Insight[] {
  const results: Insight[] = [];
  const total = stats.pending + stats.staged + stats.flagged + stats.approved + stats.rejected;

  if (stuck.flagged_over_14d > 5) {
    results.push({
      id: "review-flagged-aging",
      severity: "critical",
      domain: "review",
      headline: `${stuck.flagged_over_14d} flagged items aging past 14 days`,
      body: "These fees were flagged for manual review but haven't been addressed. Aging items delay index accuracy.",
      metric: `${stuck.flagged_over_14d} items`,
      action: { label: "Review flagged", href: "/admin/review?status=flagged" },
      priority: 90,
    });
  }

  if (stuck.staged_over_30d > 20) {
    results.push({
      id: "review-staged-aging",
      severity: "warning",
      domain: "review",
      headline: `${stuck.staged_over_30d} staged fees waiting over 30 days`,
      body: "Auto-staged fees should be reviewed and approved to strengthen index maturity.",
      metric: `${stuck.staged_over_30d} items`,
      action: { label: "Review staged", href: "/admin/review?status=staged" },
      priority: 55,
    });
  }

  if (total > 0 && stats.approved / total < 0.05) {
    const pct = ((stats.approved / total) * 100).toFixed(1);
    results.push({
      id: "review-low-approval",
      severity: "warning",
      domain: "review",
      headline: `Only ${pct}% of fees are approved`,
      body: `With ${stats.approved} of ${total.toLocaleString()} fees approved, index benchmarks rely heavily on unvalidated data.`,
      metric: `${pct}%`,
      action: { label: "Bulk approve staged", href: "/admin/review?status=staged" },
      priority: 60,
    });
  }

  if (stats.staged > 50) {
    results.push({
      id: "review-staged-ready",
      severity: "info",
      domain: "review",
      headline: `${stats.staged} staged fees ready for review`,
      body: "A batch of auto-staged fees is queued. Bulk approval can quickly improve index maturity.",
      metric: `${stats.staged} fees`,
      action: { label: "Review staged", href: "/admin/review?status=staged" },
      priority: 30,
    });
  }

  if (
    stuck.flagged_over_14d === 0 &&
    stuck.staged_over_30d === 0 &&
    stats.flagged === 0
  ) {
    results.push({
      id: "review-clean",
      severity: "positive",
      domain: "review",
      headline: "Review queue is clear",
      body: "No aging flagged or stuck staged items. The review pipeline is healthy.",
      priority: 5,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Crawl Insights
// ---------------------------------------------------------------------------

function crawlInsights(
  health: CrawlHealth,
  trends: DailyTrend[]
): Insight[] {
  const results: Insight[] = [];

  if (health.total_crawled_24h === 0) {
    results.push({
      id: "crawl-zero",
      severity: "critical",
      domain: "crawl",
      headline: "No crawls completed in the last 24 hours",
      body: "The crawl pipeline appears stalled. Fee data is not being refreshed.",
      metric: "0 crawls",
      priority: 95,
    });
  } else if (health.success_rate_24h < 0.7) {
    const pct = (health.success_rate_24h * 100).toFixed(0);
    results.push({
      id: "crawl-low-success",
      severity: "critical",
      domain: "crawl",
      headline: `Crawl success rate dropped to ${pct}%`,
      body: `Only ${pct}% of ${health.total_crawled_24h} crawls succeeded in the last 24 hours. ${health.institutions_failing} institutions are actively failing.`,
      metric: `${pct}%`,
      priority: 85,
    });
  } else if (health.success_rate_24h >= 0.95 && health.total_crawled_24h >= 10) {
    results.push({
      id: "crawl-healthy",
      severity: "positive",
      domain: "crawl",
      headline: `Crawl pipeline healthy at ${(health.success_rate_24h * 100).toFixed(0)}% success`,
      body: `${health.total_crawled_24h} institutions crawled in the last 24 hours with strong reliability.`,
      metric: `${health.total_crawled_24h} crawled`,
      priority: 5,
    });
  }

  if (health.avg_confidence > 0 && health.avg_confidence < 0.75) {
    results.push({
      id: "crawl-low-confidence",
      severity: "warning",
      domain: "crawl",
      headline: `Average extraction confidence is ${(health.avg_confidence * 100).toFixed(0)}%`,
      body: "Below 75% confidence indicates the extraction model may be struggling with fee schedule formats.",
      metric: `${(health.avg_confidence * 100).toFixed(0)}%`,
      priority: 50,
    });
  }

  // 3-day declining trend
  if (trends.length >= 6) {
    const recent3 = trends.slice(-3);
    const prior3 = trends.slice(-6, -3);
    const recentAvg =
      recent3.reduce((s, d) => s + d.fees_extracted, 0) / 3;
    const priorAvg =
      prior3.reduce((s, d) => s + d.fees_extracted, 0) / 3;
    if (priorAvg > 0 && recentAvg < priorAvg * 0.8) {
      const dropPct = (((priorAvg - recentAvg) / priorAvg) * 100).toFixed(0);
      results.push({
        id: "crawl-declining-trend",
        severity: "warning",
        domain: "crawl",
        headline: `Fee extraction volume down ${dropPct}% over 3 days`,
        body: "Recent extraction volume is declining compared to the prior 3-day window. May indicate site changes or crawl issues.",
        metric: `${dropPct}% drop`,
        priority: 45,
      });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Index Insights
// ---------------------------------------------------------------------------

function indexInsights(
  snapshot: IndexEntry[],
  volatileCategories: VolatileCategory[]
): Insight[] {
  const results: Insight[] = [];

  if (snapshot.length > 0) {
    const insufficient = snapshot.filter(
      (e) => e.maturity_tier === "insufficient"
    ).length;
    if (insufficient > snapshot.length * 0.5) {
      results.push({
        id: "index-low-maturity",
        severity: "warning",
        domain: "index",
        headline: `${insufficient} of ${snapshot.length} top categories lack sufficient data`,
        body: "More than half of your most-tracked categories have fewer than 10 observations. Benchmarks may not be reliable.",
        metric: `${insufficient}/${snapshot.length}`,
        action: { label: "View full index", href: "/admin/index" },
        priority: 50,
      });
    }

    const strong = snapshot.filter((e) => e.maturity_tier === "strong");
    if (strong.length > 0 && strong.length >= snapshot.length * 0.5) {
      results.push({
        id: "index-strong-coverage",
        severity: "positive",
        domain: "index",
        headline: `${strong.length} categories have strong benchmark data`,
        body: `Over half of your top categories are backed by 10+ approved observations.`,
        metric: `${strong.length} strong`,
        priority: 10,
      });
    }
  }

  // High-volatility categories
  for (const vc of volatileCategories.slice(0, 3)) {
    if (
      vc.iqr !== null &&
      vc.median_amount !== null &&
      vc.median_amount > 0 &&
      vc.iqr > vc.median_amount * 0.5
    ) {
      results.push({
        id: `index-volatile-${vc.fee_category}`,
        severity: "warning",
        domain: "index",
        headline: `High pricing dispersion in ${getDisplayName(vc.fee_category)}`,
        body: `IQR of ${formatAmount(vc.iqr)} against a ${formatAmount(vc.median_amount)} median suggests wide variation in how institutions price this fee.`,
        metric: formatAmount(vc.iqr),
        action: {
          label: "View category",
          href: `/admin/fees/catalog/${vc.fee_category}`,
        },
        priority: 40,
      });
      break; // Only report the worst one
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Coverage Insights
// ---------------------------------------------------------------------------

function coverageInsights(
  peerStats: PeerFilteredStats,
  nationalStats: PeerFilteredStats | null
): Insight[] {
  const results: Insight[] = [];

  const coverage =
    peerStats.total_institutions > 0
      ? peerStats.with_fee_url / peerStats.total_institutions
      : 0;

  if (coverage < 0.3 && peerStats.total_institutions > 0) {
    results.push({
      id: "coverage-low",
      severity: "warning",
      domain: "coverage",
      headline: `Only ${(coverage * 100).toFixed(0)}% of institutions have fee URL coverage`,
      body: `${peerStats.with_fee_url} of ${peerStats.total_institutions} institutions have a fee schedule URL. Expanding coverage will improve index reliability.`,
      metric: `${(coverage * 100).toFixed(0)}%`,
      priority: 45,
    });
  }

  if (nationalStats && nationalStats.total_institutions > 0) {
    const peerCov = peerStats.total_institutions > 0
      ? (peerStats.with_fee_url / peerStats.total_institutions) * 100
      : 0;
    const natCov =
      (nationalStats.with_fee_url / nationalStats.total_institutions) * 100;
    const delta = peerCov - natCov;

    if (delta > 10) {
      results.push({
        id: "coverage-peer-above",
        severity: "positive",
        domain: "coverage",
        headline: `Peer group coverage ${delta.toFixed(0)}pp above national average`,
        body: `This peer set has ${peerCov.toFixed(0)}% fee URL coverage vs. ${natCov.toFixed(0)}% nationally.`,
        metric: `+${delta.toFixed(0)}pp`,
        priority: 10,
      });
    } else if (delta < -10) {
      results.push({
        id: "coverage-peer-below",
        severity: "warning",
        domain: "coverage",
        headline: `Peer group coverage trails national by ${Math.abs(delta).toFixed(0)}pp`,
        body: `This peer set has ${peerCov.toFixed(0)}% fee URL coverage vs. ${natCov.toFixed(0)}% nationally.`,
        metric: `${delta.toFixed(0)}pp`,
        priority: 40,
      });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Risk Insights
// ---------------------------------------------------------------------------

function riskInsights(outliers: RiskOutlierData): Insight[] {
  const results: Insight[] = [];

  if (outliers.extreme_outlier_fees.length > 3) {
    results.push({
      id: "risk-extreme-outliers",
      severity: "warning",
      domain: "risk",
      headline: `${outliers.extreme_outlier_fees.length} extreme outlier fees detected`,
      body: "These fees exceed 3x the category median and may indicate extraction errors or genuinely unusual pricing.",
      metric: `${outliers.extreme_outlier_fees.length} outliers`,
      action: { label: "Review outliers", href: "/admin/review?status=flagged" },
      priority: 55,
    });
  }

  const severeFailures = outliers.repeated_failures.filter(
    (f) => f.consecutive_failures >= 10
  );
  if (severeFailures.length > 0) {
    results.push({
      id: "risk-repeated-failures",
      severity: "critical",
      domain: "risk",
      headline: `${severeFailures.length} institution${severeFailures.length > 1 ? "s" : ""} with 10+ consecutive failures`,
      body: `These institutions have failed crawling repeatedly and may need manual URL updates or removal.`,
      metric: `${severeFailures.length}`,
      action: { label: "View failing", href: "/admin/peers" },
      priority: 75,
    });
  }

  // High flag rate in any category
  for (const fc of outliers.top_flagged_categories) {
    const flagRate = fc.total_count > 0 ? fc.flagged_count / fc.total_count : 0;
    if (flagRate > 0.3) {
      results.push({
        id: `risk-high-flag-${fc.fee_category}`,
        severity: "warning",
        domain: "risk",
        headline: `${getDisplayName(fc.fee_category)} has a ${(flagRate * 100).toFixed(0)}% flag rate`,
        body: `${fc.flagged_count} of ${fc.total_count} fees are flagged. This may indicate a systematic extraction issue for this fee type.`,
        metric: `${(flagRate * 100).toFixed(0)}%`,
        action: { label: "Review flagged", href: "/admin/review?status=flagged" },
        priority: 50,
      });
      break; // Only report the worst one
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

const MAX_INSIGHTS = 8;

export function generateAllInsights(data: DashboardData): Insight[] {
  const all: Insight[] = [
    ...reviewInsights(data.reviewStats, data.stuckItems),
    ...crawlInsights(data.crawlHealth, data.dailyTrends),
    ...indexInsights(data.indexSnapshot, data.volatileCategories),
    ...coverageInsights(data.peerStats, data.nationalStats),
    ...riskInsights(data.riskOutliers),
  ];

  all.sort((a, b) => b.priority - a.priority);
  return all.slice(0, MAX_INSIGHTS);
}
