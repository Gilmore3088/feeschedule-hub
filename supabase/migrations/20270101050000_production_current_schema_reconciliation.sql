SET lock_timeout = '10s';
SET statement_timeout = '120s';

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS published_fee_records_agentic_live_lineage_dedup_idx
  ON public.published_fee_records (lineage_ref)
  WHERE rolled_back_at IS NULL
    AND batch_id LIKE 'agentic-run-%';

COMMENT ON INDEX public.published_fee_records_agentic_live_lineage_dedup_idx IS
  'Idempotency guard for Hamilton agentic Tier-3 publishing from verified fee observations.';

CREATE TABLE IF NOT EXISTS public.institution_claims (
  id BIGSERIAL PRIMARY KEY,
  institution_id BIGINT NOT NULL REFERENCES public.institution_sources(id) ON DELETE CASCADE,
  claimant_user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  claimant_role TEXT,
  claim_notes TEXT,
  source_submission_id BIGINT REFERENCES public.community_fee_submissions(id) ON DELETE SET NULL,
  review_status TEXT NOT NULL DEFAULT 'pending',
  reviewed_at TIMESTAMPTZ,
  reviewer_id BIGINT REFERENCES public.users(id) ON DELETE SET NULL,
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
  actor_user_id BIGINT REFERENCES public.users(id) ON DELETE SET NULL,
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

CREATE INDEX IF NOT EXISTS institution_claim_events_claim_idx
  ON public.institution_claim_events (claim_id, created_at DESC);

CREATE INDEX IF NOT EXISTS institution_claim_events_type_idx
  ON public.institution_claim_events (event_type, created_at DESC);

ALTER TABLE public.institution_claim_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.institution_claim_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.institution_claim_events_id_seq FROM PUBLIC, anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_hamilton_msg_user
  ON public.hamilton_messages (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_hamilton_scenarios_peer_set
  ON public.hamilton_scenarios (user_id, peer_set_id)
  WHERE peer_set_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.institution_workspace_memberships (
  id BIGSERIAL PRIMARY KEY,
  institution_id BIGINT NOT NULL REFERENCES public.institution_sources(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  membership_role TEXT NOT NULL DEFAULT 'owner',
  membership_status TEXT NOT NULL DEFAULT 'active',
  source TEXT NOT NULL DEFAULT 'claim',
  claim_id BIGINT REFERENCES public.institution_claims(id) ON DELETE SET NULL,
  granted_by_user_id BIGINT REFERENCES public.users(id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_by_user_id BIGINT REFERENCES public.users(id) ON DELETE SET NULL,
  revoked_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT institution_workspace_memberships_role_check CHECK (
    membership_role IN ('owner', 'admin', 'analyst', 'viewer')
  ),
  CONSTRAINT institution_workspace_memberships_status_check CHECK (
    membership_status IN ('active', 'revoked')
  ),
  CONSTRAINT institution_workspace_memberships_source_check CHECK (
    source IN ('claim', 'manual_admin', 'delegated', 'import')
  ),
  CONSTRAINT institution_workspace_memberships_revocation_check CHECK (
    (
      membership_status = 'active'
      AND revoked_at IS NULL
      AND revoked_by_user_id IS NULL
    )
    OR (
      membership_status = 'revoked'
      AND revoked_at IS NOT NULL
      AND revoked_by_user_id IS NOT NULL
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS institution_workspace_memberships_one_active_idx
  ON public.institution_workspace_memberships (institution_id, user_id)
  WHERE membership_status = 'active';

CREATE INDEX IF NOT EXISTS institution_workspace_memberships_user_idx
  ON public.institution_workspace_memberships (user_id, membership_status, granted_at DESC);

CREATE INDEX IF NOT EXISTS institution_workspace_memberships_institution_idx
  ON public.institution_workspace_memberships (institution_id, membership_status, granted_at DESC);

CREATE INDEX IF NOT EXISTS institution_workspace_memberships_claim_idx
  ON public.institution_workspace_memberships (claim_id)
  WHERE claim_id IS NOT NULL;

ALTER TABLE public.institution_workspace_memberships ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.institution_workspace_memberships FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.institution_workspace_memberships_id_seq FROM PUBLIC, anon, authenticated;

INSERT INTO public.institution_workspace_memberships (
  institution_id,
  user_id,
  membership_role,
  membership_status,
  source,
  claim_id,
  granted_by_user_id,
  granted_at,
  notes,
  created_at,
  updated_at
)
SELECT
  ic.institution_id,
  ic.claimant_user_id,
  'owner',
  'active',
  'claim',
  ic.id,
  ic.reviewer_id,
  COALESCE(ic.reviewed_at, ic.updated_at, NOW()),
  ic.review_notes,
  NOW(),
  NOW()
FROM public.institution_claims ic
WHERE ic.review_status = 'accepted'
ON CONFLICT (institution_id, user_id)
WHERE membership_status = 'active'
DO UPDATE SET
  membership_role = 'owner',
  source = 'claim',
  claim_id = EXCLUDED.claim_id,
  granted_by_user_id = EXCLUDED.granted_by_user_id,
  granted_at = EXCLUDED.granted_at,
  notes = EXCLUDED.notes,
  updated_at = NOW();

CREATE TABLE IF NOT EXISTS public.institution_workspace_invitations (
  id BIGSERIAL PRIMARY KEY,
  institution_id BIGINT NOT NULL REFERENCES public.institution_sources(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  invited_role TEXT NOT NULL DEFAULT 'analyst',
  invitation_status TEXT NOT NULL DEFAULT 'pending',
  invited_by_user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  accepted_by_user_id BIGINT REFERENCES public.users(id) ON DELETE SET NULL,
  revoked_by_user_id BIGINT REFERENCES public.users(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  accepted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT institution_workspace_invitations_email_check CHECK (
    email = lower(email)
    AND length(email) <= 320
    AND position('@' in email) > 1
  ),
  CONSTRAINT institution_workspace_invitations_role_check CHECK (
    invited_role IN ('admin', 'analyst', 'viewer')
  ),
  CONSTRAINT institution_workspace_invitations_status_check CHECK (
    invitation_status IN ('pending', 'accepted', 'revoked', 'expired')
  ),
  CONSTRAINT institution_workspace_invitations_lifecycle_check CHECK (
    (
      invitation_status = 'pending'
      AND accepted_at IS NULL
      AND accepted_by_user_id IS NULL
      AND revoked_at IS NULL
      AND revoked_by_user_id IS NULL
    )
    OR (
      invitation_status = 'accepted'
      AND accepted_at IS NOT NULL
      AND accepted_by_user_id IS NOT NULL
      AND revoked_at IS NULL
      AND revoked_by_user_id IS NULL
    )
    OR (
      invitation_status = 'revoked'
      AND revoked_at IS NOT NULL
      AND revoked_by_user_id IS NOT NULL
      AND accepted_at IS NULL
      AND accepted_by_user_id IS NULL
    )
    OR (
      invitation_status = 'expired'
      AND accepted_at IS NULL
      AND accepted_by_user_id IS NULL
      AND revoked_at IS NULL
      AND revoked_by_user_id IS NULL
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS institution_workspace_invitations_one_pending_idx
  ON public.institution_workspace_invitations (institution_id, email)
  WHERE invitation_status = 'pending';

CREATE INDEX IF NOT EXISTS institution_workspace_invitations_email_pending_idx
  ON public.institution_workspace_invitations (email, expires_at)
  WHERE invitation_status = 'pending';

CREATE INDEX IF NOT EXISTS institution_workspace_invitations_institution_idx
  ON public.institution_workspace_invitations (institution_id, invitation_status, created_at DESC);

CREATE INDEX IF NOT EXISTS institution_workspace_invitations_invited_by_idx
  ON public.institution_workspace_invitations (invited_by_user_id, created_at DESC);

ALTER TABLE public.institution_workspace_invitations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.institution_workspace_invitations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.institution_workspace_invitations_id_seq FROM PUBLIC, anon, authenticated;

ALTER TABLE IF EXISTS public.hamilton_saved_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.hamilton_scenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.hamilton_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.hamilton_watchlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.hamilton_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.hamilton_priority_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.hamilton_refresh_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.hamilton_workspace_contexts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.hamilton_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.hamilton_messages ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'hamilton_saved_analyses',
    'hamilton_scenarios',
    'hamilton_reports',
    'hamilton_watchlists',
    'hamilton_signals',
    'hamilton_priority_alerts',
    'hamilton_refresh_jobs',
    'hamilton_workspace_contexts',
    'hamilton_conversations',
    'hamilton_messages'
  ]
  LOOP
    IF to_regclass(format('public.%I', table_name)) IS NOT NULL THEN
      EXECUTE format(
        'REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated',
        table_name
      );
    END IF;
  END LOOP;
END $$;

COMMENT ON TABLE public.institution_claims IS
  'Authenticated institution ownership/validation claim queue. Claims are reviewed by admins before any institution profile authority changes.';
COMMENT ON TABLE public.institution_claim_events IS
  'Immutable admin/user audit trail for institution claim submissions and review decisions.';
COMMENT ON TABLE public.institution_workspace_memberships IS
  'Active or revoked institution workspace authority granted after admin-reviewed claims or manual admin action.';
COMMENT ON TABLE public.institution_workspace_invitations IS
  'Pending, accepted, revoked, or expired institution workspace invitations for users who may not yet have active Pro accounts.';

COMMIT;
