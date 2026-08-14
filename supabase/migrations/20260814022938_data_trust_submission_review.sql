SET lock_timeout = '10s';
SET statement_timeout = '120s';

ALTER TABLE public.community_fee_submissions
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewer_id INTEGER REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS review_notes TEXT,
  ADD COLUMN IF NOT EXISTS resolution TEXT,
  ADD COLUMN IF NOT EXISTS source_document_id INTEGER,
  ADD COLUMN IF NOT EXISTS agent_run_id INTEGER REFERENCES public.agent_runs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS community_fee_submissions_reviewed_idx
  ON public.community_fee_submissions (review_status, reviewed_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS community_fee_submissions_resolution_idx
  ON public.community_fee_submissions (resolution, created_at DESC);

CREATE TABLE IF NOT EXISTS public.community_fee_submission_events (
  id BIGSERIAL PRIMARY KEY,
  submission_id BIGINT NOT NULL REFERENCES public.community_fee_submissions(id) ON DELETE CASCADE,
  actor_user_id INTEGER REFERENCES public.users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  previous_status TEXT,
  new_status TEXT,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT community_fee_submission_events_event_type_check CHECK (
    event_type IN (
      'submitted',
      'accepted',
      'rejected',
      'needs_info',
      'linked_source',
      'queued_validation',
      'manual_note'
    )
  )
);

ALTER TABLE public.community_fee_submission_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.community_fee_submission_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.community_fee_submission_events_id_seq FROM PUBLIC, anon, authenticated;

CREATE INDEX IF NOT EXISTS community_fee_submission_events_submission_idx
  ON public.community_fee_submission_events (submission_id, created_at DESC);

CREATE INDEX IF NOT EXISTS community_fee_submission_events_type_idx
  ON public.community_fee_submission_events (event_type, created_at DESC);

COMMENT ON COLUMN public.community_fee_submissions.reviewed_at IS
  'Timestamp when an operator reviewed the public source or fee submission.';
COMMENT ON COLUMN public.community_fee_submissions.reviewer_id IS
  'Admin/analyst user who last reviewed the submission.';
COMMENT ON COLUMN public.community_fee_submissions.review_notes IS
  'Operator notes explaining accepted, rejected, or needs-info decisions.';
COMMENT ON COLUMN public.community_fee_submissions.resolution IS
  'Operational disposition such as ready_for_validation_when_automation_resumes, manual_validation_needed, rejected_not_official, or needs_more_context.';
COMMENT ON COLUMN public.community_fee_submissions.source_document_id IS
  'Optional semantic source document identifier linked after deterministic validation or collection; intentionally not FK-constrained because source_documents is a compatibility view in current migrations.';
COMMENT ON COLUMN public.community_fee_submissions.agent_run_id IS
  'Optional agent run linked when validation/extraction is explicitly queued.';
COMMENT ON TABLE public.community_fee_submission_events IS
  'Immutable operator audit trail for public source and fee submissions.';
