SET lock_timeout = '10s';
SET statement_timeout = '120s';

CREATE TABLE IF NOT EXISTS public.source_validation_queue (
  id BIGSERIAL PRIMARY KEY,
  institution_id BIGINT NOT NULL REFERENCES public.institution_sources(id) ON DELETE CASCADE,
  submission_id BIGINT REFERENCES public.community_fee_submissions(id) ON DELETE SET NULL,
  source_url TEXT NOT NULL,
  queue_status TEXT NOT NULL DEFAULT 'manual_validation_needed',
  validation_mode TEXT NOT NULL DEFAULT 'manual',
  priority TEXT NOT NULL DEFAULT 'normal',
  created_by_user_id INTEGER REFERENCES public.users(id) ON DELETE SET NULL,
  agent_run_id INTEGER REFERENCES public.agent_runs(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT source_validation_queue_status_check CHECK (
    queue_status IN (
      'manual_validation_needed',
      'ready_when_automation_resumes',
      'queued',
      'in_progress',
      'completed',
      'canceled'
    )
  ),
  CONSTRAINT source_validation_queue_mode_check CHECK (
    validation_mode IN ('manual', 'automation_guarded')
  ),
  CONSTRAINT source_validation_queue_priority_check CHECK (
    priority IN ('low', 'normal', 'high', 'urgent')
  )
);

ALTER TABLE public.source_validation_queue ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.source_validation_queue FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.source_validation_queue_id_seq FROM PUBLIC, anon, authenticated;

CREATE UNIQUE INDEX IF NOT EXISTS source_validation_queue_submission_unique_idx
  ON public.source_validation_queue (submission_id)
  WHERE submission_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS source_validation_queue_status_idx
  ON public.source_validation_queue (queue_status, priority, created_at DESC);

CREATE INDEX IF NOT EXISTS source_validation_queue_institution_idx
  ON public.source_validation_queue (institution_id, created_at DESC);

COMMENT ON TABLE public.source_validation_queue IS
  'Operator-controlled queue for accepted public sources awaiting manual validation or an explicit guarded automation run.';
COMMENT ON COLUMN public.source_validation_queue.queue_status IS
  'Current validation disposition. Accepting a public source never starts provider automation by itself.';
COMMENT ON COLUMN public.source_validation_queue.validation_mode IS
  'manual means deterministic/operator review; automation_guarded means eligible only after an explicit guarded run.';
