-- Central API route policy audit, AI budget enforcement, and atomic rate-limit state.
-- Policies seed disabled by default so provider automation and cron drains remain
-- fail-closed until production caps are explicitly configured.

BEGIN;

CREATE TABLE IF NOT EXISTS public.api_budget_policies (
  id BIGSERIAL PRIMARY KEY,
  policy_key TEXT NOT NULL UNIQUE,
  scope TEXT NOT NULL CHECK (scope IN (
    'global',
    'route',
    'agent',
    'user',
    'ip',
    'cron_tick',
    'agent_run'
  )),
  route_id TEXT,
  agent_name TEXT,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  hard_daily_microusd BIGINT CHECK (hard_daily_microusd IS NULL OR hard_daily_microusd >= 0),
  hard_monthly_microusd BIGINT CHECK (hard_monthly_microusd IS NULL OR hard_monthly_microusd >= 0),
  max_requests_per_window INTEGER CHECK (max_requests_per_window IS NULL OR max_requests_per_window >= 0),
  window_seconds INTEGER CHECK (window_seconds IS NULL OR window_seconds > 0),
  max_provider_calls_per_window INTEGER CHECK (max_provider_calls_per_window IS NULL OR max_provider_calls_per_window >= 0),
  max_provider_calls_per_run INTEGER CHECK (max_provider_calls_per_run IS NULL OR max_provider_calls_per_run >= 0),
  max_provider_calls_per_tick INTEGER CHECK (max_provider_calls_per_tick IS NULL OR max_provider_calls_per_tick >= 0),
  max_estimated_cost_per_run_microusd BIGINT
    CHECK (max_estimated_cost_per_run_microusd IS NULL OR max_estimated_cost_per_run_microusd >= 0),
  max_estimated_cost_per_tick_microusd BIGINT
    CHECK (max_estimated_cost_per_tick_microusd IS NULL OR max_estimated_cost_per_tick_microusd >= 0),
  fail_closed BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_by TEXT NOT NULL DEFAULT 'migration',
  updated_by TEXT NOT NULL DEFAULT 'migration',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT api_budget_policies_route_scope_check
    CHECK ((scope <> 'route') OR route_id IS NOT NULL),
  CONSTRAINT api_budget_policies_agent_scope_check
    CHECK ((scope <> 'agent') OR agent_name IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS api_budget_policies_scope_idx
  ON public.api_budget_policies (scope, enabled, updated_at DESC);

CREATE INDEX IF NOT EXISTS api_budget_policies_route_idx
  ON public.api_budget_policies (route_id)
  WHERE route_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS api_budget_policies_agent_idx
  ON public.api_budget_policies (agent_name)
  WHERE agent_name IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.api_budget_windows (
  id BIGSERIAL PRIMARY KEY,
  policy_id BIGINT NOT NULL REFERENCES public.api_budget_policies(id) ON DELETE CASCADE,
  window_key TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  reserved_microusd BIGINT NOT NULL DEFAULT 0 CHECK (reserved_microusd >= 0),
  actual_microusd BIGINT NOT NULL DEFAULT 0 CHECK (actual_microusd >= 0),
  request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  provider_call_count INTEGER NOT NULL DEFAULT 0 CHECK (provider_call_count >= 0),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT api_budget_windows_time_check CHECK (window_end > window_start),
  UNIQUE (policy_id, window_key, window_start)
);

CREATE INDEX IF NOT EXISTS api_budget_windows_active_idx
  ON public.api_budget_windows (policy_id, window_start DESC, window_end DESC);

CREATE INDEX IF NOT EXISTS api_budget_windows_key_idx
  ON public.api_budget_windows (window_key, window_start DESC);

CREATE TABLE IF NOT EXISTS public.api_rate_limit_events (
  id BIGSERIAL PRIMARY KEY,
  route_id TEXT NOT NULL,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('organization', 'anonymous', 'user', 'ip')),
  subject_key TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  limit_count INTEGER NOT NULL CHECK (limit_count >= 0),
  event_type TEXT NOT NULL DEFAULT 'reservation' CHECK (event_type IN (
    'reservation',
    'blocked',
    'reset'
  )),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT api_rate_limit_events_time_check CHECK (window_end > window_start),
  UNIQUE (route_id, subject_type, subject_key, window_start)
);

CREATE INDEX IF NOT EXISTS api_rate_limit_events_route_window_idx
  ON public.api_rate_limit_events (route_id, window_start DESC);

CREATE INDEX IF NOT EXISTS api_rate_limit_events_subject_idx
  ON public.api_rate_limit_events (subject_type, subject_key, window_start DESC);

CREATE TABLE IF NOT EXISTS public.api_route_audit_events (
  id BIGSERIAL PRIMARY KEY,
  route_id TEXT NOT NULL,
  method TEXT NOT NULL,
  path TEXT,
  surface TEXT,
  status_code INTEGER CHECK (status_code IS NULL OR status_code >= 100),
  outcome TEXT NOT NULL CHECK (outcome IN (
    'success',
    'error',
    'blocked',
    'rate_limited',
    'unauthorized'
  )),
  latency_ms INTEGER CHECK (latency_ms IS NULL OR latency_ms >= 0),
  user_id INTEGER REFERENCES public.users(id) ON DELETE SET NULL,
  subject_key TEXT,
  auth_policy TEXT,
  rate_limit_policy TEXT,
  cost_policy TEXT,
  budget_policy_id BIGINT REFERENCES public.api_budget_policies(id) ON DELETE SET NULL,
  provider TEXT,
  model TEXT,
  agent_name TEXT,
  operation TEXT,
  reason_code TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS api_route_audit_events_created_idx
  ON public.api_route_audit_events (created_at DESC);

CREATE INDEX IF NOT EXISTS api_route_audit_events_route_created_idx
  ON public.api_route_audit_events (route_id, created_at DESC);

CREATE INDEX IF NOT EXISTS api_route_audit_events_outcome_idx
  ON public.api_route_audit_events (outcome, created_at DESC)
  WHERE outcome IN ('blocked', 'rate_limited', 'unauthorized', 'error');

CREATE INDEX IF NOT EXISTS api_route_audit_events_user_idx
  ON public.api_route_audit_events (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

ALTER TABLE public.agent_runs
  ADD COLUMN IF NOT EXISTS budget_policy_id BIGINT REFERENCES public.api_budget_policies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS max_provider_calls INTEGER CHECK (max_provider_calls IS NULL OR max_provider_calls >= 0),
  ADD COLUMN IF NOT EXISTS max_estimated_cost_microusd BIGINT
    CHECK (max_estimated_cost_microusd IS NULL OR max_estimated_cost_microusd >= 0),
  ADD COLUMN IF NOT EXISTS actual_provider_calls INTEGER NOT NULL DEFAULT 0 CHECK (actual_provider_calls >= 0),
  ADD COLUMN IF NOT EXISTS actual_estimated_cost_microusd BIGINT NOT NULL DEFAULT 0
    CHECK (actual_estimated_cost_microusd >= 0);

CREATE INDEX IF NOT EXISTS agent_runs_budget_policy_idx
  ON public.agent_runs (budget_policy_id, started_at DESC)
  WHERE budget_policy_id IS NOT NULL;

ALTER TABLE public.ai_api_usage_events
  ADD COLUMN IF NOT EXISTS route_id TEXT,
  ADD COLUMN IF NOT EXISTS budget_policy_id BIGINT REFERENCES public.api_budget_policies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS subject_key TEXT;

CREATE INDEX IF NOT EXISTS ai_api_usage_route_created_idx
  ON public.ai_api_usage_events (route_id, created_at DESC)
  WHERE route_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ai_api_usage_budget_policy_idx
  ON public.ai_api_usage_events (budget_policy_id, created_at DESC)
  WHERE budget_policy_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ai_api_usage_user_created_idx
  ON public.ai_api_usage_events (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

INSERT INTO public.api_budget_policies
  (policy_key, scope, route_id, agent_name, enabled, fail_closed, notes)
VALUES
  ('global:provider:default', 'global', NULL, NULL, FALSE, TRUE,
   'Disabled by default. Configure explicit daily/monthly caps before provider automation resumes.'),
  ('route:api.research.hamilton', 'route', 'api.research.hamilton', NULL, FALSE, TRUE,
   'Public research provider route; disabled until authenticated Pro/admin pilot caps are configured.'),
  ('route:api.hamilton.chat', 'route', 'api.hamilton.chat', NULL, FALSE, TRUE,
   'Internal Hamilton chat provider route; disabled until caps are configured.'),
  ('route:api.hamilton.simulate', 'route', 'api.hamilton.simulate', NULL, FALSE, TRUE,
   'Hamilton scenario provider route; disabled until caps are configured.'),
  ('route:api.reports.generate', 'route', 'api.reports.generate', NULL, FALSE, TRUE,
   'Report generation provider route; disabled until caps are configured.'),
  ('route:api.scout.agent', 'route', 'api.scout.agent', NULL, FALSE, TRUE,
   'Scout agent provider route; disabled until caps are configured.'),
  ('route:api.scout.audit', 'route', 'api.scout.audit', NULL, FALSE, TRUE,
   'Scout audit provider route; disabled until caps are configured.'),
  ('route:api.admin.agents.tick', 'cron_tick', 'api.admin.agents.tick', NULL, FALSE, TRUE,
   'Cron tick drain policy; disabled until run/step/provider-call/spend caps are configured.'),
  ('agent:hamilton', 'agent', NULL, 'hamilton', FALSE, TRUE,
   'Hamilton provider budget policy; disabled until caps are configured.'),
  ('agent:atlas', 'agent', NULL, 'atlas', FALSE, TRUE,
   'Atlas orchestration budget policy; disabled until caps are configured.'),
  ('agent:magellan', 'agent', NULL, 'magellan', FALSE, TRUE,
   'Magellan budget policy; disabled until caps are configured.'),
  ('agent:rosetta', 'agent', NULL, 'rosetta', FALSE, TRUE,
   'Rosetta budget policy; disabled until caps are configured.'),
  ('agent:knox', 'agent', NULL, 'knox', FALSE, TRUE,
   'Knox provider budget policy; disabled until caps are configured.'),
  ('agent:darwin', 'agent', NULL, 'darwin', FALSE, TRUE,
   'Darwin provider budget policy; disabled until caps are configured.')
ON CONFLICT (policy_key) DO UPDATE
SET scope = EXCLUDED.scope,
    route_id = EXCLUDED.route_id,
    agent_name = EXCLUDED.agent_name,
    fail_closed = TRUE,
    notes = EXCLUDED.notes,
    updated_by = 'migration',
    updated_at = NOW();

ALTER TABLE public.api_budget_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_budget_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_rate_limit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_route_audit_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.api_budget_policies FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.api_budget_windows FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.api_rate_limit_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.api_route_audit_events FROM PUBLIC, anon, authenticated;

REVOKE ALL ON SEQUENCE public.api_budget_policies_id_seq FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.api_budget_windows_id_seq FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.api_rate_limit_events_id_seq FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.api_route_audit_events_id_seq FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.api_budget_policies IS
'Fail-closed API and provider budget policy definitions. Rows are disabled until explicit production caps are configured.';

COMMENT ON TABLE public.api_budget_windows IS
'Durable budget reservation and spend windows used before provider calls and cron drains.';

COMMENT ON TABLE public.api_rate_limit_events IS
'Atomic API rate-limit reservation counters by route, subject, and window.';

COMMENT ON TABLE public.api_route_audit_events IS
'Route-level API audit events for success, failures, auth blocks, rate limits, and budget blocks.';

COMMIT;
