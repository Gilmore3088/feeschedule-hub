CREATE TABLE IF NOT EXISTS hamilton_saved_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER NOT NULL,
  institution_id TEXT NOT NULL,
  title TEXT NOT NULL,
  analysis_focus TEXT NOT NULL,
  prompt TEXT,
  response_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hamilton_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER NOT NULL,
  institution_id TEXT NOT NULL,
  scenario_id UUID REFERENCES hamilton_scenarios(id) ON DELETE SET NULL,
  report_type TEXT NOT NULL,
  report_json JSONB NOT NULL,
  exported_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hamilton_watchlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER NOT NULL,
  institution_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  fee_categories JSONB NOT NULL DEFAULT '[]'::jsonb,
  regions JSONB NOT NULL DEFAULT '[]'::jsonb,
  peer_set_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hamilton_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id TEXT NOT NULL,
  signal_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  source_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
