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
 */

import { sql } from "@/lib/crawler-db/connection";

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
    await sql`
      CREATE TABLE IF NOT EXISTS hamilton_reports (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id INTEGER NOT NULL,
        institution_id TEXT NOT NULL,
        scenario_id UUID REFERENCES hamilton_scenarios(id) ON DELETE SET NULL,
        report_type TEXT NOT NULL,
        report_json JSONB NOT NULL,
        exported_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
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
  } catch (err) {
    console.error("[hamilton] ensureHamiltonProTables failed:", err);
  }
}
