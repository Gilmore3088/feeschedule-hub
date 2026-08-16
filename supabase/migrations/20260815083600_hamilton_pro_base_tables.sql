SET lock_timeout = '10s';
SET statement_timeout = '120s';

BEGIN;

CREATE TABLE IF NOT EXISTS public.hamilton_saved_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id integer NOT NULL,
  institution_id text NOT NULL,
  title text NOT NULL,
  analysis_focus text NOT NULL,
  prompt text,
  response_json jsonb NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.hamilton_scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id integer NOT NULL,
  institution_id text NOT NULL,
  fee_category text NOT NULL,
  peer_set_id text,
  horizon text,
  current_value numeric NOT NULL,
  proposed_value numeric NOT NULL,
  result_json jsonb NOT NULL,
  confidence_tier text NOT NULL CHECK (confidence_tier IN ('strong', 'provisional', 'insufficient')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.hamilton_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id integer NOT NULL,
  institution_id text NOT NULL,
  scenario_id uuid REFERENCES public.hamilton_scenarios(id) ON DELETE SET NULL,
  report_type text NOT NULL,
  report_json jsonb NOT NULL,
  status text NOT NULL DEFAULT 'generated',
  exported_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.hamilton_watchlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id integer NOT NULL,
  institution_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  fee_categories jsonb NOT NULL DEFAULT '[]'::jsonb,
  regions jsonb NOT NULL DEFAULT '[]'::jsonb,
  peer_set_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.hamilton_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id text NOT NULL,
  signal_type text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
  title text NOT NULL,
  body text NOT NULL,
  source_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.hamilton_priority_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id integer NOT NULL,
  signal_id uuid NOT NULL REFERENCES public.hamilton_signals(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'acknowledged', 'dismissed')),
  acknowledged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.hamilton_saved_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hamilton_scenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hamilton_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hamilton_watchlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hamilton_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hamilton_priority_alerts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.hamilton_saved_analyses FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.hamilton_scenarios FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.hamilton_reports FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.hamilton_watchlists FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.hamilton_signals FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.hamilton_priority_alerts FROM PUBLIC, anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_hamilton_analysis_user
  ON public.hamilton_saved_analyses(user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_hamilton_analysis_inst
  ON public.hamilton_saved_analyses(institution_id);

CREATE INDEX IF NOT EXISTS idx_hamilton_scenario_user
  ON public.hamilton_scenarios(user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_hamilton_scenario_inst
  ON public.hamilton_scenarios(institution_id);

CREATE INDEX IF NOT EXISTS idx_hamilton_report_user
  ON public.hamilton_reports(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_hamilton_report_scenario
  ON public.hamilton_reports(scenario_id);

CREATE INDEX IF NOT EXISTS idx_hamilton_report_status
  ON public.hamilton_reports(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_hamilton_watchlist_user
  ON public.hamilton_watchlists(user_id);

CREATE INDEX IF NOT EXISTS idx_hamilton_signal_inst
  ON public.hamilton_signals(institution_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_hamilton_signal_type
  ON public.hamilton_signals(signal_type);

CREATE INDEX IF NOT EXISTS idx_hamilton_alert_user
  ON public.hamilton_priority_alerts(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_hamilton_alert_signal
  ON public.hamilton_priority_alerts(signal_id);

COMMENT ON TABLE public.hamilton_saved_analyses IS
  'Hamilton Analyze saved responses scoped to a user and institution.';
COMMENT ON TABLE public.hamilton_scenarios IS
  'Hamilton Simulate saved fee-change scenarios scoped to a user and institution.';
COMMENT ON TABLE public.hamilton_reports IS
  'Hamilton generated and published report artifacts.';
COMMENT ON TABLE public.hamilton_watchlists IS
  'Hamilton Monitor per-user institution and peer watchlist configuration.';
COMMENT ON TABLE public.hamilton_signals IS
  'Institution-scoped Hamilton lifecycle, fee movement, and workflow signals.';
COMMENT ON TABLE public.hamilton_priority_alerts IS
  'User-specific priority alert instances generated from Hamilton signals.';

COMMIT;
