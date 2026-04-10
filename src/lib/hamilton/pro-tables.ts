/**
 * Hamilton Pro Tables — Supabase PostgreSQL schema for Hamilton Pro screens.
 *
 * Tables:
 *   hamilton_saved_analyses  — Analyze screen: saved AI analysis responses per institution
 *   hamilton_scenarios       — Simulate screen: fee change scenarios with confidence tiers
 *   hamilton_reports         — Report screen: generated PDF-ready reports
 *   hamilton_watchlists      — Monitor screen: per-user watchlist configuration
 *   hamilton_signals         — Monitor screen: detected fee change signals
 *   hamilton_priority_alerts — Monitor screen: user-specific alert instances from signals
 *
 * All queries use the shared postgres sql client from crawler-db/connection.
 * UUID primary keys match Supabase gen_random_uuid() convention.
 *
 * Soft-delete: analyses and scenarios have archived_at + status columns (D-07, D-08).
 * Reports, watchlists, signals, and alerts have NO soft-delete (D-09).
 *
 * Report status: 'generated' (user-created, private) | 'published' (BFI-authored, public to all pro users)
 */

import { sql } from "@/lib/crawler-db/connection";
import type { ReportSummaryResponse } from "@/lib/hamilton/types";

/**
 * Create Hamilton Pro tables if they do not already exist.
 * Safe to call repeatedly (IF NOT EXISTS).
 * Called once from the Hamilton Pro layout (Phase 40).
 * Errors are swallowed to keep the app alive during cold start.
 */
export async function ensureHamiltonProTables(): Promise<void> {
  try {
    // 1. hamilton_saved_analyses — Analyze screen persistence
    await sql`
      CREATE TABLE IF NOT EXISTS hamilton_saved_analyses (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id INTEGER NOT NULL,
        institution_id TEXT NOT NULL,
        title TEXT NOT NULL,
        analysis_focus TEXT NOT NULL,
        prompt TEXT,
        response_json JSONB NOT NULL,
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
        archived_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    // 2. hamilton_scenarios — Simulate screen persistence
    await sql`
      CREATE TABLE IF NOT EXISTS hamilton_scenarios (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id INTEGER NOT NULL,
        institution_id TEXT NOT NULL,
        fee_category TEXT NOT NULL,
        peer_set_id TEXT,
        horizon TEXT,
        current_value NUMERIC NOT NULL,
        proposed_value NUMERIC NOT NULL,
        result_json JSONB NOT NULL,
        confidence_tier TEXT NOT NULL CHECK (confidence_tier IN ('strong', 'provisional', 'insufficient')),
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
        archived_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    // 3. hamilton_reports — Report screen persistence (no soft-delete per D-09)
    // status column: 'generated' = user-created private report, 'published' = BFI-authored public report
    await sql`
      CREATE TABLE IF NOT EXISTS hamilton_reports (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id INTEGER NOT NULL,
        institution_id TEXT NOT NULL,
        scenario_id UUID REFERENCES hamilton_scenarios(id) ON DELETE SET NULL,
        report_type TEXT NOT NULL,
        report_json JSONB NOT NULL,
        status TEXT NOT NULL DEFAULT 'generated',
        exported_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    // Migration guard: add status column to existing hamilton_reports tables that lack it
    await sql`
      ALTER TABLE hamilton_reports
      ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'generated'
    `;

    // 4. hamilton_watchlists — Monitor screen configuration (no soft-delete per D-09)
    await sql`
      CREATE TABLE IF NOT EXISTS hamilton_watchlists (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id INTEGER NOT NULL,
        institution_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
        fee_categories JSONB NOT NULL DEFAULT '[]'::jsonb,
        regions JSONB NOT NULL DEFAULT '[]'::jsonb,
        peer_set_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    // 5. hamilton_signals — Detected fee change signals (immutable records, no soft-delete per D-09)
    await sql`
      CREATE TABLE IF NOT EXISTS hamilton_signals (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        institution_id TEXT NOT NULL,
        signal_type TEXT NOT NULL,
        severity TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        source_json JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    // 6. hamilton_priority_alerts — User alert instances from signals (alert lifecycle, not soft-delete per D-09)
    await sql`
      CREATE TABLE IF NOT EXISTS hamilton_priority_alerts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id INTEGER NOT NULL,
        signal_id UUID NOT NULL REFERENCES hamilton_signals(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'acknowledged', 'dismissed')),
        acknowledged_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    // Indexes for hamilton_saved_analyses
    await sql`
      CREATE INDEX IF NOT EXISTS idx_hamilton_analysis_user
        ON hamilton_saved_analyses(user_id, updated_at DESC)
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_hamilton_analysis_inst
        ON hamilton_saved_analyses(institution_id)
    `;

    // Indexes for hamilton_scenarios
    await sql`
      CREATE INDEX IF NOT EXISTS idx_hamilton_scenario_user
        ON hamilton_scenarios(user_id, updated_at DESC)
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_hamilton_scenario_inst
        ON hamilton_scenarios(institution_id)
    `;

    // Indexes for hamilton_reports
    await sql`
      CREATE INDEX IF NOT EXISTS idx_hamilton_report_user
        ON hamilton_reports(user_id, created_at DESC)
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_hamilton_report_scenario
        ON hamilton_reports(scenario_id)
    `;

    // Index for status + created_at (used by getPublishedReports query)
    await sql`
      CREATE INDEX IF NOT EXISTS idx_hamilton_report_status
        ON hamilton_reports(status, created_at DESC)
    `;

    // Index for hamilton_watchlists
    await sql`
      CREATE INDEX IF NOT EXISTS idx_hamilton_watchlist_user
        ON hamilton_watchlists(user_id)
    `;

    // Indexes for hamilton_signals
    await sql`
      CREATE INDEX IF NOT EXISTS idx_hamilton_signal_inst
        ON hamilton_signals(institution_id, created_at DESC)
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_hamilton_signal_type
        ON hamilton_signals(signal_type)
    `;

    // Indexes for hamilton_priority_alerts
    await sql`
      CREATE INDEX IF NOT EXISTS idx_hamilton_alert_user
        ON hamilton_priority_alerts(user_id, created_at DESC)
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_hamilton_alert_signal
        ON hamilton_priority_alerts(signal_id)
    `;

    // Seed BFI-authored published reports (idempotent — ON CONFLICT DO NOTHING)
    await seedPublishedReports();
  } catch (err) {
    console.error("[hamilton] ensureHamiltonProTables failed:", err);
  }
}

/**
 * Seed BFI-authored published reports into hamilton_reports.
 * These use sentinel user_id = 0 and are visible to all authenticated pro users.
 * Idempotent: ON CONFLICT DO NOTHING prevents duplicate inserts.
 */
export async function seedPublishedReports(): Promise<void> {
  const q1Report: ReportSummaryResponse = {
    title: "Q1 2026 National Fee Landscape — Hamilton Intelligence",
    executiveSummary: [
      "Median monthly maintenance fees held at $12.00 across 4,200+ institutions tracked by Bank Fee Index as of Q1 2026. Banks priced at a median of $14.00 while credit unions maintained a significant cost advantage at $5.50, a gap that has widened from 18% to 23% over the past four quarters.",
      "Overdraft fees stabilized at $30.00 nationally after two years of pressure-driven reductions. NSF fees show convergence with overdraft at $30.00, suggesting institutions are simplifying their penalty fee structures. ATM non-network fees held at $3.00, with digital-first institutions increasingly eliminating the fee entirely as a retention lever.",
    ],
    snapshot: [],
    strategicRationale:
      "The fee landscape reflects a bifurcated market: traditional banks holding on premium-priced services while credit unions and digital challengers undercut on everyday fees. Institutions in the $100M–$500M asset tier face the greatest competitive pressure, caught between cost structures that require fee revenue and market expectations shaped by digital-native competitors. Monthly maintenance and overdraft represent 68% of consumer fee perception — concentration risk that boards should address in pricing reviews.",
    tradeoffs: [
      { label: "Monthly Maintenance", value: "$12.00 national median" },
      { label: "Overdraft Fee", value: "$30.00 national median" },
      { label: "NSF Fee", value: "$30.00 national median" },
    ],
    recommendation:
      "Institutions pricing above the $12.00 monthly maintenance median should conduct a retention impact analysis before the next pricing cycle. The overdraft window is closing — institutions that have not introduced low-balance alerts or grace periods are measurably behind peer benchmarks. Credit unions have a structural advantage here; banks must compete on value delivery rather than fee elimination.",
    implementationNotes: [
      "Data covers 4,200+ institutions across all 50 states and 12 Federal Reserve districts",
      "Pipeline-verified from published fee schedules as of Q1 2026",
      "All figures reflect approved and staged extractions with maturity tier 'provisional' or above",
      "Hamilton Intelligence — Bank Fee Index Q1 2026",
    ],
    exportControls: { pdfEnabled: true, shareEnabled: false },
  };

  const marchPulseReport: ReportSummaryResponse = {
    title: "Monthly Pulse: March 2026 — Fee Movement Intelligence",
    executiveSummary: [
      "ATM non-network fees showed notable convergence in March 2026, with the P25–P75 range compressing from $2.50–$4.00 to $2.75–$3.50. This is the tightest spread in 18 months, driven by a cluster of mid-tier community banks standardizing at $3.00 to match regional peer benchmarks.",
      "Wire transfer fees for domestic outgoing transactions remained at $25.00–$35.00 nationally, but a meaningful 12% of institutions reduced fees by $5.00 or more in Q1, signaling price competition in the small business banking segment. International wire pricing held firm at $45.00 median, with virtually no movement.",
    ],
    snapshot: [],
    strategicRationale:
      "The March pulse signals that fee standardization is accelerating across commodity categories — ATM fees are becoming table stakes rather than differentiators. Institutions that still price ATM access above $3.50 face an increasing perception gap. Wire transfer reductions are concentrated in institutions competing for small business primary banking relationships, where treasury services are the anchor product.",
    tradeoffs: [
      { label: "ATM Non-Network Fee", value: "$3.00 national median" },
      { label: "Domestic Wire Outgoing", value: "$28.00 national median" },
      { label: "Foreign Transaction Fee", value: "3.0% national median" },
    ],
    recommendation:
      "Institutions with ATM fees above $3.50 should benchmark against their specific peer set before the next review cycle. Wire fee reductions are a low-risk competitive signal for institutions actively pursuing small business growth — the revenue impact is modest but the perception value is measurable in onboarding surveys.",
    implementationNotes: [
      "Pulse data reflects fee schedule changes detected by the BFI crawler pipeline in March 2026",
      "Movement figures represent institutions with confirmed fee schedule updates, not the full 4,200+ universe",
      "Hamilton Intelligence — Bank Fee Index Monthly Pulse, March 2026",
    ],
    exportControls: { pdfEnabled: true, shareEnabled: false },
  };

  const fedDistrictReport: ReportSummaryResponse = {
    title: "Fed District Fee Comparison — Regional Intelligence Report",
    executiveSummary: [
      "Fee levels vary meaningfully across Federal Reserve districts, with institutions in the New York (District 2) and San Francisco (District 12) districts pricing 8–14% above the national median on core consumer fees. Community banks in the Kansas City (District 10) and Minneapolis (District 9) districts hold the strongest cost advantage, pricing monthly maintenance fees at $9.50 and $10.00 respectively — well below the $12.00 national median.",
      "The Southeast districts (Atlanta, District 6) show the widest overdraft fee dispersion, with a P25 of $25.00 and P75 of $35.00, reflecting a mix of fee-forward community banks and competitive credit union markets. Credit unions in District 6 are pricing overdraft at $20.00 median — a $10.00 gap that presents both a competitive threat and a consumer harm signal.",
    ],
    snapshot: [],
    strategicRationale:
      "District-level fee variation is driven by local competitive dynamics, charter mix, and regulatory environment. Institutions competing against a dense credit union market (Districts 8, 9, 10) face sustained downward pressure on consumer fees. Conversely, institutions in supply-constrained metro markets (Districts 1, 2, 12) maintain pricing power but face increasing scrutiny from CFPB supervisory priorities.",
    tradeoffs: [
      { label: "District 2 (New York) Median", value: "$13.50 monthly maintenance" },
      { label: "District 10 (Kansas City) Median", value: "$9.50 monthly maintenance" },
      { label: "District 6 (Atlanta) Overdraft Range", value: "$25.00 – $35.00" },
    ],
    recommendation:
      "Institutions should benchmark their fee structure against district-level peers rather than national medians alone. A bank pricing at $12.00 in a district where the median is $9.50 carries meaningful competitive risk that national benchmarks obscure. The Hamilton Fee Benchmarking tool provides district-filtered peer comparison for precise positioning analysis.",
    implementationNotes: [
      "District classifications follow Federal Reserve district boundaries (12 districts)",
      "Figures reflect institutions with at least 10 approved fee observations in the relevant category",
      "Hamilton Intelligence — Bank Fee Index Regional Analysis, Q1 2026",
    ],
    exportControls: { pdfEnabled: true, shareEnabled: false },
  };

  const communityBankReport: ReportSummaryResponse = {
    title: "Peer Benchmarking: Community Banks (Tier D/E) — Hamilton Intelligence",
    executiveSummary: [
      "Community banks in the $100M–$1B asset range (Tiers D and E) are pricing core consumer fees 6% above the national median on average, driven by higher operational cost structures and limited digital channel offset. Monthly maintenance fees average $13.50 for Tier D institutions vs. the $12.00 national median — a $1.50 gap that is directionally increasing as digital-first competitors push the median lower.",
      "Overdraft revenue remains disproportionately important for community banks: 34% of Tier D institutions price overdraft at $35.00 or above, compared to 18% nationally. This overdraft dependency creates regulatory exposure and consumer perception risk, particularly as CFPB guidance on non-sufficient funds treatment continues to evolve.",
    ],
    snapshot: [],
    strategicRationale:
      "The community bank segment is caught between cost structures that require fee revenue and a market landscape where consumers increasingly compare fees across institutions. The institutions showing the strongest retention metrics are those that have repositioned overdraft as a service (with grace periods, alerts, and waiver policies) rather than a revenue line. Fee revenue is not disappearing — it is shifting to institutions that deliver visible value in exchange.",
    tradeoffs: [
      { label: "Monthly Maintenance (Tier D/E)", value: "$13.50 avg vs $12.00 national" },
      { label: "Overdraft Fee (Tier D/E)", value: "$32.00 avg vs $30.00 national" },
      { label: "ATM Non-Network (Tier D/E)", value: "$3.00 avg — at national median" },
    ],
    recommendation:
      "Community banks in the $100M–$500M range should prioritize overdraft policy modernization over fee elimination. Introducing grace periods, real-time balance alerts, and one-free-per-year waiver policies reduces consumer harm signals without material revenue impact in most peer studies. Monthly maintenance fees at or below $12.00 with bundled benefits (free checks, notary, safe deposit discount) test well with community banking core demographics.",
    implementationNotes: [
      "Tier D: $100M–$500M total assets; Tier E: $500M–$1B total assets (FDIC asset tier classification)",
      "Peer data covers 1,200+ community banks with verified fee schedules in the BFI pipeline",
      "Hamilton Intelligence — Bank Fee Index Peer Benchmarking Report, Q1 2026",
    ],
    exportControls: { pdfEnabled: true, shareEnabled: false },
  };

  // Deterministic UUIDs for idempotent seeding (sentinel user_id = 0 for BFI-authored content)
  await sql`
    INSERT INTO hamilton_reports
      (id, user_id, institution_id, report_type, report_json, status, created_at)
    VALUES
      (
        '00000000-0000-4000-8000-000000000001',
        0,
        'bfi-hamilton',
        'quarterly_strategy',
        ${JSON.stringify(q1Report)},
        'published',
        '2026-04-01T00:00:00Z'
      )
    ON CONFLICT (id) DO NOTHING
  `;

  await sql`
    INSERT INTO hamilton_reports
      (id, user_id, institution_id, report_type, report_json, status, created_at)
    VALUES
      (
        '00000000-0000-4000-8000-000000000002',
        0,
        'bfi-hamilton',
        'monthly_pulse',
        ${JSON.stringify(marchPulseReport)},
        'published',
        '2026-04-01T01:00:00Z'
      )
    ON CONFLICT (id) DO NOTHING
  `;

  await sql`
    INSERT INTO hamilton_reports
      (id, user_id, institution_id, report_type, report_json, status, created_at)
    VALUES
      (
        '00000000-0000-4000-8000-000000000003',
        0,
        'bfi-hamilton',
        'state_index',
        ${JSON.stringify(fedDistrictReport)},
        'published',
        '2026-04-01T02:00:00Z'
      )
    ON CONFLICT (id) DO NOTHING
  `;

  await sql`
    INSERT INTO hamilton_reports
      (id, user_id, institution_id, report_type, report_json, status, created_at)
    VALUES
      (
        '00000000-0000-4000-8000-000000000004',
        0,
        'bfi-hamilton',
        'peer_brief',
        ${JSON.stringify(communityBankReport)},
        'published',
        '2026-04-01T03:00:00Z'
      )
    ON CONFLICT (id) DO NOTHING
  `;
}

/**
 * Get all published BFI-authored reports (visible to all authenticated pro users).
 * Published reports use sentinel user_id = 0 and status = 'published'.
 * Returns newest first, limited to 20.
 */
export async function getPublishedReports(): Promise<Array<{
  id: string;
  report_type: string;
  title: string;
  created_at: string;
  report_json: ReportSummaryResponse;
}>> {
  const rows = await sql`
    SELECT id, report_type, created_at,
           report_json->>'title' AS title,
           report_json
    FROM hamilton_reports
    WHERE status = 'published'
    ORDER BY created_at DESC
    LIMIT 20
  `;
  return rows as unknown as Array<{
    id: string;
    report_type: string;
    title: string;
    created_at: string;
    report_json: ReportSummaryResponse;
  }>;
}

/**
 * Get a single scenario by ID, filtered by userId to prevent IDOR.
 * Used by the Reports page when arriving from Simulate with ?scenario_id=X.
 */
export async function getHamiltonScenarioById(
  scenarioId: string,
  userId: number
): Promise<{
  id: string;
  fee_category: string;
  current_value: number;
  proposed_value: number;
  confidence_tier: string;
  peer_set_id: string | null;
  created_at: string;
} | null> {
  const rows = await sql`
    SELECT id, fee_category, current_value, proposed_value,
           confidence_tier, peer_set_id, created_at
    FROM hamilton_scenarios
    WHERE id = ${scenarioId}
      AND user_id = ${userId}
    LIMIT 1
  `;
  if (!rows[0]) return null;
  return {
    id: rows[0].id as string,
    fee_category: rows[0].fee_category as string,
    current_value: Number(rows[0].current_value),
    proposed_value: Number(rows[0].proposed_value),
    confidence_tier: rows[0].confidence_tier as string,
    peer_set_id: rows[0].peer_set_id as string | null,
    created_at: rows[0].created_at as string,
  };
}

/**
 * Save a generated report to hamilton_reports.
 * Returns the new report's UUID.
 * status defaults to 'generated' — user-created reports are always private.
 */
export async function saveHamiltonReport(params: {
  userId: number;
  institutionId: string;
  reportType: string;
  reportJson: ReportSummaryResponse;
  scenarioId?: string | null;
}): Promise<string> {
  const rows = await sql`
    INSERT INTO hamilton_reports
      (user_id, institution_id, report_type, report_json, scenario_id, status)
    VALUES
      (${params.userId}, ${params.institutionId}, ${params.reportType},
       ${JSON.stringify(params.reportJson)}, ${params.scenarioId ?? null}, 'generated')
    RETURNING id
  `;
  return rows[0].id as string;
}

/**
 * Get recent reports for a user (for left rail Report History).
 * Returns newest first, limited to 10.
 */
export async function getRecentHamiltonReports(userId: number): Promise<Array<{
  id: string;
  report_type: string;
  created_at: string;
  title: string;
}>> {
  const rows = await sql`
    SELECT id, report_type, created_at,
           report_json->>'title' AS title
    FROM hamilton_reports
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
    LIMIT 10
  `;
  return rows as unknown as Array<{ id: string; report_type: string; created_at: string; title: string; }>;
}

/**
 * Get active scenarios for a user (for scenario selector in ConfigSidebar).
 * Returns newest first, limited to 20.
 */
export async function getActiveScenarios(userId: number): Promise<Array<{
  id: string;
  fee_category: string;
  current_value: number;
  proposed_value: number;
  confidence_tier: string;
  created_at: string;
}>> {
  const rows = await sql`
    SELECT id, fee_category, current_value, proposed_value, confidence_tier, created_at
    FROM hamilton_scenarios
    WHERE user_id = ${userId}
      AND status = 'active'
    ORDER BY created_at DESC
    LIMIT 20
  `;
  return rows as unknown as Array<{
    id: string;
    fee_category: string;
    current_value: number;
    proposed_value: number;
    confidence_tier: string;
    created_at: string;
  }>;
}

/**
 * Get a single report by ID (for report output display after generation).
 */
export async function getHamiltonReportById(reportId: string, userId: number): Promise<{
  id: string;
  report_type: string;
  report_json: ReportSummaryResponse;
  scenario_id: string | null;
  created_at: string;
} | null> {
  const rows = await sql`
    SELECT id, report_type, report_json, scenario_id, created_at
    FROM hamilton_reports
    WHERE id = ${reportId}
      AND user_id = ${userId}
    LIMIT 1
  `;
  if (!rows[0]) return null;
  return {
    id: rows[0].id as string,
    report_type: rows[0].report_type as string,
    report_json: rows[0].report_json as ReportSummaryResponse,
    scenario_id: rows[0].scenario_id as string | null,
    created_at: rows[0].created_at as string,
  };
}
