#!/usr/bin/env node
/**
 * Bank Fee Index - Data Gap Analysis Report
 *
 * Generates a comprehensive gap analysis covering coverage, failures,
 * MSA readiness, and automated recommendations.
 *
 * Usage: DATABASE_URL=... node scripts/gap-analysis.js
 * Output: Console text + docs/gap-analysis-YYYY-MM-DD.md
 */
const fs = require("fs");
const path = require("path");
const postgres = require("postgres");

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL environment variable required");
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { ssl: "require" });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtPct(ratio) {
  return `${(ratio * 100).toFixed(1)}%`;
}

function fmtNum(n) {
  return n.toLocaleString();
}

function fmtDeposits(amount) {
  if (!amount) return "N/A";
  if (amount >= 1_000_000_000) return `$${(amount / 1_000_000_000).toFixed(1)}B`;
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(0)}M`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`;
  return `$${amount}`;
}

function padRight(str, len) {
  return String(str).padEnd(len);
}

function padLeft(str, len) {
  return String(str).padStart(len);
}

const DISTRICT_NAMES = {
  1: "Boston",
  2: "New York",
  3: "Philadelphia",
  4: "Cleveland",
  5: "Richmond",
  6: "Atlanta",
  7: "Chicago",
  8: "St. Louis",
  9: "Minneapolis",
  10: "Kansas City",
  11: "Dallas",
  12: "San Francisco",
};

const TIER_LABELS = {
  community_small: "Community (<$300M)",
  community_mid: "Community ($300M-$1B)",
  community_large: "Community ($1B-$10B)",
  regional: "Regional ($10B-$50B)",
  large_regional: "Large Regional ($50B-$250B)",
  super_regional: "Super Regional ($250B+)",
};

const TIER_ORDER = [
  "community_small",
  "community_mid",
  "community_large",
  "regional",
  "large_regional",
  "super_regional",
];

// ---------------------------------------------------------------------------
// Data queries
// ---------------------------------------------------------------------------

async function getCoverageByState() {
  const rows = await sql`
    SELECT
      ct.state_code,
      COUNT(*) as total,
      COUNT(CASE WHEN ef.id IS NOT NULL THEN 1 END) as with_fees
    FROM crawl_targets ct
    LEFT JOIN (
      SELECT DISTINCT crawl_target_id, id
      FROM extracted_fees
      WHERE review_status != 'rejected'
        AND fee_category IS NOT NULL
        AND amount IS NOT NULL
    ) ef ON ef.crawl_target_id = ct.id
    WHERE ct.state_code IS NOT NULL
      AND ct.status = 'active'
    GROUP BY ct.state_code
    ORDER BY ct.state_code
  `;
  return rows.map((r) => ({
    state: r.state_code,
    total: Number(r.total),
    withFees: Number(r.with_fees),
    coverage: Number(r.total) > 0 ? Number(r.with_fees) / Number(r.total) : 0,
    gap: Number(r.total) - Number(r.with_fees),
  }));
}

async function getCoverageByTier() {
  const rows = await sql`
    SELECT
      ct.asset_size_tier,
      COUNT(*) as total,
      COUNT(CASE WHEN ef.target_id IS NOT NULL THEN 1 END) as with_fees
    FROM crawl_targets ct
    LEFT JOIN (
      SELECT DISTINCT crawl_target_id as target_id
      FROM extracted_fees
      WHERE review_status != 'rejected'
        AND fee_category IS NOT NULL
        AND amount IS NOT NULL
    ) ef ON ef.target_id = ct.id
    WHERE ct.status = 'active'
    GROUP BY ct.asset_size_tier
    ORDER BY ct.asset_size_tier
  `;
  return rows.map((r) => ({
    tier: r.asset_size_tier || "unknown",
    label: TIER_LABELS[r.asset_size_tier] || r.asset_size_tier || "Unknown",
    total: Number(r.total),
    withFees: Number(r.with_fees),
    coverage: Number(r.total) > 0 ? Number(r.with_fees) / Number(r.total) : 0,
    gap: Number(r.total) - Number(r.with_fees),
  }));
}

async function getCoverageByCharter() {
  const rows = await sql`
    SELECT
      ct.charter_type,
      COUNT(*) as total,
      COUNT(CASE WHEN ef.target_id IS NOT NULL THEN 1 END) as with_fees
    FROM crawl_targets ct
    LEFT JOIN (
      SELECT DISTINCT crawl_target_id as target_id
      FROM extracted_fees
      WHERE review_status != 'rejected'
        AND fee_category IS NOT NULL
        AND amount IS NOT NULL
    ) ef ON ef.target_id = ct.id
    WHERE ct.status = 'active'
    GROUP BY ct.charter_type
    ORDER BY ct.charter_type
  `;
  return rows.map((r) => ({
    charter: r.charter_type,
    total: Number(r.total),
    withFees: Number(r.with_fees),
    coverage: Number(r.total) > 0 ? Number(r.with_fees) / Number(r.total) : 0,
    gap: Number(r.total) - Number(r.with_fees),
  }));
}

async function getCoverageByDistrict() {
  const rows = await sql`
    SELECT
      ct.fed_district,
      COUNT(*) as total,
      COUNT(CASE WHEN ef.target_id IS NOT NULL THEN 1 END) as with_fees
    FROM crawl_targets ct
    LEFT JOIN (
      SELECT DISTINCT crawl_target_id as target_id
      FROM extracted_fees
      WHERE review_status != 'rejected'
        AND fee_category IS NOT NULL
        AND amount IS NOT NULL
    ) ef ON ef.target_id = ct.id
    WHERE ct.status = 'active'
      AND ct.fed_district IS NOT NULL
    GROUP BY ct.fed_district
    ORDER BY ct.fed_district
  `;
  return rows.map((r) => ({
    district: Number(r.fed_district),
    name: DISTRICT_NAMES[Number(r.fed_district)] || `District ${r.fed_district}`,
    total: Number(r.total),
    withFees: Number(r.with_fees),
    coverage: Number(r.total) > 0 ? Number(r.with_fees) / Number(r.total) : 0,
    gap: Number(r.total) - Number(r.with_fees),
  }));
}

async function getTopGaps() {
  const rows = await sql`
    SELECT ct.id, ct.institution_name, ct.state_code, ct.asset_size,
           ct.asset_size_tier, ct.charter_type, ct.failure_reason
    FROM crawl_targets ct
    LEFT JOIN (
      SELECT DISTINCT crawl_target_id
      FROM extracted_fees
      WHERE review_status != 'rejected'
        AND fee_category IS NOT NULL
        AND amount IS NOT NULL
    ) ef ON ef.crawl_target_id = ct.id
    WHERE ef.crawl_target_id IS NULL
      AND ct.status = 'active'
      AND ct.asset_size IS NOT NULL
    ORDER BY ct.asset_size DESC
    LIMIT 50
  `;
  return rows.map((r) => ({
    id: Number(r.id),
    name: r.institution_name,
    state: r.state_code,
    assetSize: Number(r.asset_size),
    tier: r.asset_size_tier,
    charter: r.charter_type,
    failureReason: r.failure_reason,
  }));
}

async function getSourceTypeDistribution() {
  const rows = await sql`
    SELECT
      COALESCE(ct.document_type, 'unknown') as doc_type,
      COUNT(*) as total,
      COUNT(CASE WHEN ef.target_id IS NOT NULL THEN 1 END) as with_fees
    FROM crawl_targets ct
    LEFT JOIN (
      SELECT DISTINCT crawl_target_id as target_id
      FROM extracted_fees
      WHERE review_status != 'rejected'
        AND fee_category IS NOT NULL
        AND amount IS NOT NULL
    ) ef ON ef.target_id = ct.id
    WHERE ct.status = 'active'
    GROUP BY ct.document_type
    ORDER BY total DESC
  `;
  return rows.map((r) => ({
    docType: r.doc_type,
    total: Number(r.total),
    withFees: Number(r.with_fees),
    successRate:
      Number(r.total) > 0 ? Number(r.with_fees) / Number(r.total) : 0,
  }));
}

async function getFailureAnalysis() {
  const rows = await sql`
    SELECT
      COALESCE(failure_reason, 'none') as reason,
      COUNT(*) as count
    FROM crawl_targets
    WHERE status = 'active'
    GROUP BY failure_reason
    ORDER BY count DESC
  `;
  return rows.map((r) => ({
    reason: r.reason,
    count: Number(r.count),
  }));
}

async function getMsaReadiness() {
  const rows = await sql`
    SELECT
      mc.msa_code,
      mc.msa_name,
      mc.institution_count as sod_institutions,
      mc.total_deposits,
      mc.hhi,
      COUNT(DISTINCT ef.crawl_target_id) as institutions_with_fees,
      COUNT(DISTINCT ef.fee_category) as fee_categories
    FROM market_concentration mc
    LEFT JOIN branch_deposits bd ON bd.msa_code = mc.msa_code AND bd.year = mc.year
    LEFT JOIN (
      SELECT crawl_target_id, fee_category
      FROM extracted_fees
      WHERE review_status != 'rejected'
        AND fee_category IS NOT NULL
        AND amount IS NOT NULL
    ) ef ON ef.crawl_target_id = bd.crawl_target_id
    WHERE mc.year = (SELECT MAX(year) FROM market_concentration)
    GROUP BY mc.msa_code, mc.msa_name, mc.institution_count, mc.total_deposits, mc.hhi
    ORDER BY mc.total_deposits DESC
  `;
  return rows.map((r) => ({
    msaCode: Number(r.msa_code),
    msaName: r.msa_name,
    sodInstitutions: Number(r.sod_institutions),
    totalDeposits: Number(r.total_deposits),
    hhi: Number(r.hhi),
    institutionsWithFees: Number(r.institutions_with_fees),
    feeCategories: Number(r.fee_categories),
    ready: Number(r.institutions_with_fees) >= 5,
  }));
}

async function getTimeSeriesStatus() {
  const rows = await sql`
    SELECT
      snapshot_date,
      total_institutions,
      with_fee_url,
      with_fees,
      with_approved,
      total_fees,
      approved_fees
    FROM coverage_snapshots
    ORDER BY snapshot_date DESC
    LIMIT 30
  `;
  return rows.map((r) => ({
    date: r.snapshot_date,
    totalInstitutions: Number(r.total_institutions),
    withFeeUrl: Number(r.with_fee_url),
    withFees: Number(r.with_fees),
    withApproved: Number(r.with_approved),
    totalFees: Number(r.total_fees),
    approvedFees: Number(r.approved_fees),
  }));
}

async function getOverallStats() {
  const [total] = await sql`
    SELECT COUNT(*) as cnt FROM crawl_targets WHERE status = 'active'
  `;
  const [withUrl] = await sql`
    SELECT COUNT(*) as cnt FROM crawl_targets
    WHERE status = 'active' AND fee_schedule_url IS NOT NULL
  `;
  const [withFees] = await sql`
    SELECT COUNT(DISTINCT crawl_target_id) as cnt
    FROM extracted_fees
    WHERE review_status != 'rejected'
      AND fee_category IS NOT NULL
      AND amount IS NOT NULL
  `;
  const [totalFees] = await sql`
    SELECT COUNT(*) as cnt FROM extracted_fees
    WHERE review_status != 'rejected'
  `;
  const [approvedFees] = await sql`
    SELECT COUNT(*) as cnt FROM extracted_fees
    WHERE review_status = 'approved'
  `;
  return {
    totalInstitutions: Number(total.cnt),
    withFeeUrl: Number(withUrl.cnt),
    withFees: Number(withFees.cnt),
    totalFees: Number(totalFees.cnt),
    approvedFees: Number(approvedFees.cnt),
  };
}

// ---------------------------------------------------------------------------
// Recommendations engine
// ---------------------------------------------------------------------------

function generateRecommendations(data) {
  const recs = [];

  // 1. Low overall coverage
  const overall = data.overall;
  const coverageRate = overall.withFees / overall.totalInstitutions;
  if (coverageRate < 0.3) {
    recs.push({
      priority: "HIGH",
      area: "Coverage",
      recommendation: `Overall fee coverage is ${fmtPct(coverageRate)} (${fmtNum(overall.withFees)} of ${fmtNum(overall.totalInstitutions)}). Focus crawl efforts on institutions with fee_schedule_url already discovered (${fmtNum(overall.withFeeUrl)} have URLs).`,
    });
  }

  // 2. Large institutions without fees
  if (data.topGaps.length > 0) {
    const top5 = data.topGaps.slice(0, 5);
    const names = top5.map((g) => g.name).join(", ");
    recs.push({
      priority: "HIGH",
      area: "Top Gaps",
      recommendation: `${data.topGaps.length} large institutions lack fee data. Top 5 by assets: ${names}. Prioritize manual extraction for these.`,
    });
  }

  // 3. Tier imbalances
  const tierData = data.byTier;
  const worstTier = tierData
    .filter((t) => t.total >= 10)
    .sort((a, b) => a.coverage - b.coverage)[0];
  if (worstTier && worstTier.coverage < 0.2) {
    recs.push({
      priority: "MEDIUM",
      area: "Tier Balance",
      recommendation: `"${worstTier.label}" tier has only ${fmtPct(worstTier.coverage)} coverage (${fmtNum(worstTier.gap)} institutions without fees). Consider batch crawling this segment.`,
    });
  }

  // 4. Failure reasons
  const failures = data.failures.filter(
    (f) => f.reason !== "none" && f.count > 50,
  );
  if (failures.length > 0) {
    const topFailure = failures[0];
    recs.push({
      priority: "MEDIUM",
      area: "Failures",
      recommendation: `"${topFailure.reason}" affects ${fmtNum(topFailure.count)} institutions. Investigate root cause and consider specialized extraction or discovery strategies.`,
    });
  }

  // 5. Source type success rates
  const lowSuccess = data.sourceTypes.filter(
    (s) => s.total >= 50 && s.successRate < 0.15,
  );
  for (const src of lowSuccess) {
    recs.push({
      priority: "MEDIUM",
      area: "Source Types",
      recommendation: `"${src.docType}" source type has ${fmtPct(src.successRate)} success rate across ${fmtNum(src.total)} institutions. May need specialized extraction pipeline.`,
    });
  }

  // 6. MSA readiness
  const readyMsas = data.msaReadiness.filter((m) => m.ready);
  const totalMsas = data.msaReadiness.length;
  if (totalMsas > 0) {
    const readyPct = readyMsas.length / totalMsas;
    if (readyPct < 0.5) {
      const nearReady = data.msaReadiness
        .filter((m) => !m.ready && m.institutionsWithFees >= 3)
        .sort((a, b) => b.totalDeposits - a.totalDeposits)
        .slice(0, 5);
      if (nearReady.length > 0) {
        const names = nearReady.map((m) => m.msaName).join(", ");
        recs.push({
          priority: "MEDIUM",
          area: "MSA Readiness",
          recommendation: `Only ${fmtNum(readyMsas.length)} of ${fmtNum(totalMsas)} MSAs are report-ready (5+ institutions with fees). Near-ready markets to target: ${names}.`,
        });
      }
    }
  }

  // 7. District coverage
  const worstDistrict = data.byDistrict
    .filter((d) => d.total >= 50)
    .sort((a, b) => a.coverage - b.coverage)[0];
  if (worstDistrict && worstDistrict.coverage < 0.2) {
    recs.push({
      priority: "LOW",
      area: "District Balance",
      recommendation: `Fed District ${worstDistrict.district} (${worstDistrict.name}) has only ${fmtPct(worstDistrict.coverage)} coverage. Geographic balance matters for national index credibility.`,
    });
  }

  // 8. Approval rate
  if (overall.totalFees > 0) {
    const approvalRate = overall.approvedFees / overall.totalFees;
    if (approvalRate < 0.1) {
      recs.push({
        priority: "LOW",
        area: "Review Pipeline",
        recommendation: `Only ${fmtPct(approvalRate)} of extracted fees are approved (${fmtNum(overall.approvedFees)} of ${fmtNum(overall.totalFees)}). Review throughput may be a bottleneck.`,
      });
    }
  }

  return recs.sort((a, b) => {
    const order = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    return (order[a.priority] ?? 3) - (order[b.priority] ?? 3);
  });
}

// ---------------------------------------------------------------------------
// Report formatters
// ---------------------------------------------------------------------------

function formatConsole(data) {
  const lines = [];
  const hr = "=".repeat(80);
  const hr2 = "-".repeat(80);

  lines.push(hr);
  lines.push("  BANK FEE INDEX - DATA GAP ANALYSIS REPORT");
  lines.push(`  Generated: ${new Date().toISOString().split("T")[0]}`);
  lines.push(hr);
  lines.push("");

  // Overall
  const o = data.overall;
  lines.push("OVERALL SUMMARY");
  lines.push(hr2);
  lines.push(`  Total Institutions:  ${fmtNum(o.totalInstitutions)}`);
  lines.push(`  With Fee URL:        ${fmtNum(o.withFeeUrl)} (${fmtPct(o.withFeeUrl / o.totalInstitutions)})`);
  lines.push(`  With Extracted Fees: ${fmtNum(o.withFees)} (${fmtPct(o.withFees / o.totalInstitutions)})`);
  lines.push(`  Total Fee Records:   ${fmtNum(o.totalFees)}`);
  lines.push(`  Approved Fees:       ${fmtNum(o.approvedFees)} (${o.totalFees > 0 ? fmtPct(o.approvedFees / o.totalFees) : "0%"})`);
  lines.push("");

  // Coverage by state
  lines.push("COVERAGE BY STATE");
  lines.push(hr2);
  lines.push(
    `  ${padRight("State", 7)}${padLeft("Total", 8)}${padLeft("w/ Fees", 8)}${padLeft("Coverage", 10)}${padLeft("Gap", 8)}`,
  );
  for (const s of data.byState) {
    lines.push(
      `  ${padRight(s.state, 7)}${padLeft(fmtNum(s.total), 8)}${padLeft(fmtNum(s.withFees), 8)}${padLeft(fmtPct(s.coverage), 10)}${padLeft(fmtNum(s.gap), 8)}`,
    );
  }
  lines.push("");

  // Coverage by tier
  lines.push("COVERAGE BY ASSET TIER");
  lines.push(hr2);
  lines.push(
    `  ${padRight("Tier", 28)}${padLeft("Total", 8)}${padLeft("w/ Fees", 8)}${padLeft("Coverage", 10)}${padLeft("Gap", 8)}`,
  );
  for (const t of data.byTier) {
    lines.push(
      `  ${padRight(t.label, 28)}${padLeft(fmtNum(t.total), 8)}${padLeft(fmtNum(t.withFees), 8)}${padLeft(fmtPct(t.coverage), 10)}${padLeft(fmtNum(t.gap), 8)}`,
    );
  }
  lines.push("");

  // Coverage by charter
  lines.push("COVERAGE BY CHARTER TYPE");
  lines.push(hr2);
  lines.push(
    `  ${padRight("Charter", 16)}${padLeft("Total", 8)}${padLeft("w/ Fees", 8)}${padLeft("Coverage", 10)}${padLeft("Gap", 8)}`,
  );
  for (const c of data.byCharter) {
    lines.push(
      `  ${padRight(c.charter, 16)}${padLeft(fmtNum(c.total), 8)}${padLeft(fmtNum(c.withFees), 8)}${padLeft(fmtPct(c.coverage), 10)}${padLeft(fmtNum(c.gap), 8)}`,
    );
  }
  lines.push("");

  // Coverage by district
  lines.push("COVERAGE BY FED DISTRICT");
  lines.push(hr2);
  lines.push(
    `  ${padRight("District", 22)}${padLeft("Total", 8)}${padLeft("w/ Fees", 8)}${padLeft("Coverage", 10)}${padLeft("Gap", 8)}`,
  );
  for (const d of data.byDistrict) {
    const label = `${d.district}. ${d.name}`;
    lines.push(
      `  ${padRight(label, 22)}${padLeft(fmtNum(d.total), 8)}${padLeft(fmtNum(d.withFees), 8)}${padLeft(fmtPct(d.coverage), 10)}${padLeft(fmtNum(d.gap), 8)}`,
    );
  }
  lines.push("");

  // Top gaps
  lines.push("TOP 20 GAPS (LARGEST INSTITUTIONS WITHOUT FEE DATA)");
  lines.push(hr2);
  lines.push(
    `  ${padRight("#", 4)}${padRight("Institution", 40)}${padLeft("State", 6)}${padLeft("Assets", 12)}${padLeft("Tier", 20)}${padLeft("Failure", 16)}`,
  );
  for (let i = 0; i < Math.min(20, data.topGaps.length); i++) {
    const g = data.topGaps[i];
    lines.push(
      `  ${padRight(i + 1, 4)}${padRight(g.name.slice(0, 38), 40)}${padLeft(g.state || "-", 6)}${padLeft(fmtDeposits(g.assetSize * 1000), 12)}${padLeft(TIER_LABELS[g.tier] || g.tier || "-", 20)}${padLeft(g.failureReason || "-", 16)}`,
    );
  }
  lines.push("");

  // Source type distribution
  lines.push("SOURCE TYPE DISTRIBUTION");
  lines.push(hr2);
  lines.push(
    `  ${padRight("Type", 16)}${padLeft("Total", 8)}${padLeft("w/ Fees", 8)}${padLeft("Success", 10)}`,
  );
  for (const s of data.sourceTypes) {
    lines.push(
      `  ${padRight(s.docType, 16)}${padLeft(fmtNum(s.total), 8)}${padLeft(fmtNum(s.withFees), 8)}${padLeft(fmtPct(s.successRate), 10)}`,
    );
  }
  lines.push("");

  // Failure analysis
  lines.push("FAILURE ANALYSIS");
  lines.push(hr2);
  lines.push(`  ${padRight("Reason", 36)}${padLeft("Count", 8)}`);
  for (const f of data.failures) {
    lines.push(`  ${padRight(f.reason, 36)}${padLeft(fmtNum(f.count), 8)}`);
  }
  lines.push("");

  // MSA readiness
  const readyMsas = data.msaReadiness.filter((m) => m.ready);
  const notReady = data.msaReadiness.filter((m) => !m.ready);
  lines.push("MSA READINESS (5+ institutions with fee data)");
  lines.push(hr2);
  lines.push(`  Ready:     ${fmtNum(readyMsas.length)} MSAs`);
  lines.push(`  Not Ready: ${fmtNum(notReady.length)} MSAs`);
  lines.push(`  Total:     ${fmtNum(data.msaReadiness.length)} MSAs`);
  lines.push("");
  if (readyMsas.length > 0) {
    lines.push("  Top 10 Ready MSAs:");
    const topReady = readyMsas
      .sort((a, b) => b.totalDeposits - a.totalDeposits)
      .slice(0, 10);
    lines.push(
      `  ${padRight("MSA", 40)}${padLeft("Deposits", 14)}${padLeft("Inst w/ Fees", 14)}${padLeft("Categories", 12)}`,
    );
    for (const m of topReady) {
      lines.push(
        `  ${padRight(m.msaName.slice(0, 38), 40)}${padLeft(fmtDeposits(m.totalDeposits), 14)}${padLeft(fmtNum(m.institutionsWithFees), 14)}${padLeft(fmtNum(m.feeCategories), 12)}`,
      );
    }
  }
  lines.push("");

  // Time series
  if (data.timeSeries.length > 0) {
    lines.push("COVERAGE TREND (last 10 snapshots)");
    lines.push(hr2);
    lines.push(
      `  ${padRight("Date", 14)}${padLeft("Total", 8)}${padLeft("w/ URL", 8)}${padLeft("w/ Fees", 8)}${padLeft("Approved", 10)}${padLeft("Total Fees", 12)}`,
    );
    for (const t of data.timeSeries.slice(0, 10)) {
      lines.push(
        `  ${padRight(t.date, 14)}${padLeft(fmtNum(t.totalInstitutions), 8)}${padLeft(fmtNum(t.withFeeUrl), 8)}${padLeft(fmtNum(t.withFees), 8)}${padLeft(fmtNum(t.withApproved), 10)}${padLeft(fmtNum(t.totalFees), 12)}`,
      );
    }
  }
  lines.push("");

  // Recommendations
  lines.push("RECOMMENDATIONS");
  lines.push(hr2);
  for (const r of data.recommendations) {
    lines.push(`  [${r.priority}] ${r.area}`);
    lines.push(`    ${r.recommendation}`);
    lines.push("");
  }

  lines.push(hr);
  lines.push("  Report complete.");
  lines.push(hr);

  return lines.join("\n");
}

function formatMarkdown(data) {
  const lines = [];
  const today = new Date().toISOString().split("T")[0];

  lines.push("# Bank Fee Index - Data Gap Analysis Report");
  lines.push("");
  lines.push(`**Generated:** ${today}`);
  lines.push("");

  // Overall
  const o = data.overall;
  lines.push("## Overall Summary");
  lines.push("");
  lines.push("| Metric | Count | Percentage |");
  lines.push("|--------|------:|------------|");
  lines.push(`| Total Institutions | ${fmtNum(o.totalInstitutions)} | - |`);
  lines.push(`| With Fee URL | ${fmtNum(o.withFeeUrl)} | ${fmtPct(o.withFeeUrl / o.totalInstitutions)} |`);
  lines.push(`| With Extracted Fees | ${fmtNum(o.withFees)} | ${fmtPct(o.withFees / o.totalInstitutions)} |`);
  lines.push(`| Total Fee Records | ${fmtNum(o.totalFees)} | - |`);
  lines.push(`| Approved Fees | ${fmtNum(o.approvedFees)} | ${o.totalFees > 0 ? fmtPct(o.approvedFees / o.totalFees) : "0%"} |`);
  lines.push("");

  // Coverage by state
  lines.push("## Coverage by State");
  lines.push("");
  lines.push("| State | Total | With Fees | Coverage | Gap |");
  lines.push("|-------|------:|----------:|---------:|----:|");
  for (const s of data.byState) {
    lines.push(`| ${s.state} | ${fmtNum(s.total)} | ${fmtNum(s.withFees)} | ${fmtPct(s.coverage)} | ${fmtNum(s.gap)} |`);
  }
  lines.push("");

  // Coverage by tier
  lines.push("## Coverage by Asset Tier");
  lines.push("");
  lines.push("| Tier | Total | With Fees | Coverage | Gap |");
  lines.push("|------|------:|----------:|---------:|----:|");
  for (const t of data.byTier) {
    lines.push(`| ${t.label} | ${fmtNum(t.total)} | ${fmtNum(t.withFees)} | ${fmtPct(t.coverage)} | ${fmtNum(t.gap)} |`);
  }
  lines.push("");

  // Coverage by charter
  lines.push("## Coverage by Charter Type");
  lines.push("");
  lines.push("| Charter | Total | With Fees | Coverage | Gap |");
  lines.push("|---------|------:|----------:|---------:|----:|");
  for (const c of data.byCharter) {
    lines.push(`| ${c.charter} | ${fmtNum(c.total)} | ${fmtNum(c.withFees)} | ${fmtPct(c.coverage)} | ${fmtNum(c.gap)} |`);
  }
  lines.push("");

  // Coverage by district
  lines.push("## Coverage by Fed District");
  lines.push("");
  lines.push("| District | Total | With Fees | Coverage | Gap |");
  lines.push("|----------|------:|----------:|---------:|----:|");
  for (const d of data.byDistrict) {
    lines.push(`| ${d.district}. ${d.name} | ${fmtNum(d.total)} | ${fmtNum(d.withFees)} | ${fmtPct(d.coverage)} | ${fmtNum(d.gap)} |`);
  }
  lines.push("");

  // Top gaps
  lines.push("## Top 50 Gaps (Largest Institutions Without Fee Data)");
  lines.push("");
  lines.push("| # | Institution | State | Assets | Tier | Failure Reason |");
  lines.push("|---|-------------|-------|-------:|------|----------------|");
  for (let i = 0; i < data.topGaps.length; i++) {
    const g = data.topGaps[i];
    lines.push(`| ${i + 1} | ${g.name} | ${g.state || "-"} | ${fmtDeposits(g.assetSize * 1000)} | ${TIER_LABELS[g.tier] || g.tier || "-"} | ${g.failureReason || "-"} |`);
  }
  lines.push("");

  // Source types
  lines.push("## Source Type Distribution");
  lines.push("");
  lines.push("| Type | Total | With Fees | Success Rate |");
  lines.push("|------|------:|----------:|-------------:|");
  for (const s of data.sourceTypes) {
    lines.push(`| ${s.docType} | ${fmtNum(s.total)} | ${fmtNum(s.withFees)} | ${fmtPct(s.successRate)} |`);
  }
  lines.push("");

  // Failures
  lines.push("## Failure Analysis");
  lines.push("");
  lines.push("| Reason | Count |");
  lines.push("|--------|------:|");
  for (const f of data.failures) {
    lines.push(`| ${f.reason} | ${fmtNum(f.count)} |`);
  }
  lines.push("");

  // MSA readiness
  const readyMsas = data.msaReadiness.filter((m) => m.ready);
  const notReady = data.msaReadiness.filter((m) => !m.ready);
  lines.push("## MSA Readiness");
  lines.push("");
  lines.push(`- **Ready (5+ institutions with fees):** ${fmtNum(readyMsas.length)} MSAs`);
  lines.push(`- **Not Ready:** ${fmtNum(notReady.length)} MSAs`);
  lines.push(`- **Total:** ${fmtNum(data.msaReadiness.length)} MSAs`);
  lines.push("");

  if (readyMsas.length > 0) {
    lines.push("### Top Ready MSAs by Deposits");
    lines.push("");
    lines.push("| MSA | Deposits | Institutions w/ Fees | Fee Categories |");
    lines.push("|-----|----------:|---------------------:|---------------:|");
    const topReady = readyMsas
      .sort((a, b) => b.totalDeposits - a.totalDeposits)
      .slice(0, 20);
    for (const m of topReady) {
      lines.push(`| ${m.msaName} | ${fmtDeposits(m.totalDeposits)} | ${m.institutionsWithFees} | ${m.feeCategories} |`);
    }
    lines.push("");
  }

  if (notReady.length > 0) {
    const nearReady = notReady
      .filter((m) => m.institutionsWithFees >= 3)
      .sort((a, b) => b.totalDeposits - a.totalDeposits)
      .slice(0, 10);
    if (nearReady.length > 0) {
      lines.push("### Near-Ready MSAs (3-4 institutions with fees)");
      lines.push("");
      lines.push("| MSA | Deposits | Institutions w/ Fees | Need |");
      lines.push("|-----|----------:|---------------------:|-----:|");
      for (const m of nearReady) {
        lines.push(`| ${m.msaName} | ${fmtDeposits(m.totalDeposits)} | ${m.institutionsWithFees} | ${5 - m.institutionsWithFees} more |`);
      }
      lines.push("");
    }
  }

  // Time series
  if (data.timeSeries.length > 0) {
    lines.push("## Coverage Trend");
    lines.push("");
    lines.push("| Date | Total | w/ URL | w/ Fees | Approved | Total Fees |");
    lines.push("|------|------:|-------:|--------:|---------:|-----------:|");
    for (const t of data.timeSeries.slice(0, 15)) {
      lines.push(`| ${t.date} | ${fmtNum(t.totalInstitutions)} | ${fmtNum(t.withFeeUrl)} | ${fmtNum(t.withFees)} | ${fmtNum(t.withApproved)} | ${fmtNum(t.totalFees)} |`);
    }
    lines.push("");
  }

  // Recommendations
  lines.push("## Recommendations");
  lines.push("");
  for (const r of data.recommendations) {
    const icon =
      r.priority === "HIGH"
        ? "[HIGH]"
        : r.priority === "MEDIUM"
          ? "[MEDIUM]"
          : "[LOW]";
    lines.push(`### ${icon} ${r.area}`);
    lines.push("");
    lines.push(r.recommendation);
    lines.push("");
  }

  lines.push("---");
  lines.push(`*Report generated by Bank Fee Index gap-analysis.js on ${today}.*`);

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("Bank Fee Index - Data Gap Analysis");
  console.log("Querying database...\n");

  const [
    overall,
    byState,
    byTier,
    byCharter,
    byDistrict,
    topGaps,
    sourceTypes,
    failures,
    msaReadiness,
    timeSeries,
  ] = await Promise.all([
    getOverallStats(),
    getCoverageByState(),
    getCoverageByTier(),
    getCoverageByCharter(),
    getCoverageByDistrict(),
    getTopGaps(),
    getSourceTypeDistribution(),
    getFailureAnalysis(),
    getMsaReadiness(),
    getTimeSeriesStatus(),
  ]);

  const data = {
    overall,
    byState,
    byTier,
    byCharter,
    byDistrict,
    topGaps,
    sourceTypes,
    failures,
    msaReadiness,
    timeSeries,
    recommendations: [],
  };

  data.recommendations = generateRecommendations(data);

  // Console output
  const consoleText = formatConsole(data);
  console.log(consoleText);

  // Markdown file
  const today = new Date().toISOString().split("T")[0];
  const docsDir = path.join(__dirname, "..", "docs");
  if (!fs.existsSync(docsDir)) {
    fs.mkdirSync(docsDir, { recursive: true });
  }

  const mdPath = path.join(docsDir, `gap-analysis-${today}.md`);
  const md = formatMarkdown(data);
  fs.writeFileSync(mdPath, md, "utf8");
  console.log(`\nMarkdown report saved to: ${mdPath}`);

  await sql.end();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  sql.end().then(() => process.exit(1));
});
