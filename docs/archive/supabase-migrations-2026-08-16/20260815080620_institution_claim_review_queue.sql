SET lock_timeout = '10s';
SET statement_timeout = '120s';

BEGIN;

CREATE TABLE IF NOT EXISTS public.institution_claims (
  id BIGSERIAL PRIMARY KEY,
  institution_id BIGINT NOT NULL REFERENCES public.institution_sources(id) ON DELETE CASCADE,
  claimant_user_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  claimant_role TEXT,
  claim_notes TEXT,
  source_submission_id BIGINT REFERENCES public.community_fee_submissions(id) ON DELETE SET NULL,
  review_status TEXT NOT NULL DEFAULT 'pending',
  reviewed_at TIMESTAMPTZ,
  reviewer_id INTEGER REFERENCES public.users(id) ON DELETE SET NULL,
  review_notes TEXT,
  resolution TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT institution_claims_review_status_check CHECK (
    review_status IN ('pending', 'accepted', 'rejected', 'needs_info')
  ),
  CONSTRAINT institution_claims_resolution_check CHECK (
    resolution IS NULL
    OR resolution IN (
      'verified_claim',
      'rejected_not_authorized',
      'needs_more_context',
      'duplicate_claim',
      'withdrawn'
    )
  ),
  CONSTRAINT institution_claims_review_metadata_check CHECK (
    (
      review_status = 'pending'
      AND reviewed_at IS NULL
      AND reviewer_id IS NULL
      AND resolution IS NULL
    )
    OR (
      review_status <> 'pending'
      AND reviewed_at IS NOT NULL
      AND reviewer_id IS NOT NULL
      AND resolution IS NOT NULL
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS institution_claims_one_open_per_user_institution_idx
  ON public.institution_claims (institution_id, claimant_user_id)
  WHERE review_status IN ('pending', 'needs_info');

CREATE INDEX IF NOT EXISTS institution_claims_status_idx
  ON public.institution_claims (review_status, created_at DESC);

CREATE INDEX IF NOT EXISTS institution_claims_institution_idx
  ON public.institution_claims (institution_id, created_at DESC);

CREATE INDEX IF NOT EXISTS institution_claims_claimant_idx
  ON public.institution_claims (claimant_user_id, updated_at DESC);

ALTER TABLE public.institution_claims ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.institution_claims FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.institution_claims_id_seq FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.institution_claim_events (
  id BIGSERIAL PRIMARY KEY,
  claim_id BIGINT NOT NULL REFERENCES public.institution_claims(id) ON DELETE CASCADE,
  actor_user_id INTEGER REFERENCES public.users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  previous_status TEXT,
  new_status TEXT,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT institution_claim_events_event_type_check CHECK (
    event_type IN (
      'submitted',
      'resubmitted',
      'accepted',
      'rejected',
      'needs_info',
      'manual_note'
    )
  )
);

ALTER TABLE public.institution_claim_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.institution_claim_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.institution_claim_events_id_seq FROM PUBLIC, anon, authenticated;

CREATE INDEX IF NOT EXISTS institution_claim_events_claim_idx
  ON public.institution_claim_events (claim_id, created_at DESC);

CREATE INDEX IF NOT EXISTS institution_claim_events_type_idx
  ON public.institution_claim_events (event_type, created_at DESC);

COMMENT ON TABLE public.institution_claims IS
  'Authenticated institution ownership/validation claim queue. Claims are reviewed by admins before any institution profile authority changes.';
COMMENT ON COLUMN public.institution_claims.institution_id IS
  'Canonical semantic institution/source identifier being claimed.';
COMMENT ON COLUMN public.institution_claims.claimant_user_id IS
  'Logged-in Fee Insight user requesting claim/validation review.';
COMMENT ON COLUMN public.institution_claims.source_submission_id IS
  'Optional submitted source record supporting the claim.';
COMMENT ON COLUMN public.institution_claims.review_status IS
  'Admin disposition for the claim queue: pending, accepted, rejected, or needs_info.';
COMMENT ON COLUMN public.institution_claims.resolution IS
  'Operator-readable resolution for accepted/rejected/needs-info claim decisions.';
COMMENT ON TABLE public.institution_claim_events IS
  'Immutable admin/user audit trail for institution claim submissions and review decisions.';

COMMIT;
