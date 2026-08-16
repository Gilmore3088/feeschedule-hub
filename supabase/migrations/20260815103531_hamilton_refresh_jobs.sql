SET lock_timeout = '10s';
SET statement_timeout = '120s';

BEGIN;

CREATE TABLE IF NOT EXISTS public.hamilton_refresh_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id text NOT NULL,
  source_signal_id uuid REFERENCES public.hamilton_signals(id) ON DELETE CASCADE,
  source_signal_type text,
  job_type text NOT NULL CHECK (job_type IN ('report_refresh', 'scenario_refresh', 'watchlist_review')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'completed', 'dismissed')),
  priority integer NOT NULL DEFAULT 1 CHECK (priority BETWEEN 1 AND 3),
  reason text NOT NULL,
  source_json jsonb,
  completed_by_user_id integer REFERENCES public.users(id) ON DELETE SET NULL,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_signal_id, job_type)
);

CREATE INDEX IF NOT EXISTS idx_hamilton_refresh_jobs_scope
  ON public.hamilton_refresh_jobs(institution_id, status, priority DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_hamilton_refresh_jobs_signal
  ON public.hamilton_refresh_jobs(source_signal_id);

CREATE INDEX IF NOT EXISTS idx_hamilton_refresh_jobs_type
  ON public.hamilton_refresh_jobs(job_type, status, created_at DESC);

ALTER TABLE public.hamilton_refresh_jobs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.hamilton_refresh_jobs FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.hamilton_refresh_jobs IS
  'Durable Hamilton Pro refresh queue created from institution-scoped Monitor lifecycle signals.';

COMMENT ON COLUMN public.hamilton_refresh_jobs.job_type IS
  'report_refresh, scenario_refresh, or watchlist_review work prompted by a source signal.';

COMMIT;
