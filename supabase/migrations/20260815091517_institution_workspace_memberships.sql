SET lock_timeout = '10s';
SET statement_timeout = '120s';

BEGIN;

CREATE TABLE IF NOT EXISTS public.institution_workspace_memberships (
  id BIGSERIAL PRIMARY KEY,
  institution_id BIGINT NOT NULL REFERENCES public.institution_sources(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  membership_role TEXT NOT NULL DEFAULT 'owner',
  membership_status TEXT NOT NULL DEFAULT 'active',
  source TEXT NOT NULL DEFAULT 'claim',
  claim_id BIGINT REFERENCES public.institution_claims(id) ON DELETE SET NULL,
  granted_by_user_id INTEGER REFERENCES public.users(id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_by_user_id INTEGER REFERENCES public.users(id) ON DELETE SET NULL,
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

ALTER TABLE public.institution_workspace_memberships
  DROP CONSTRAINT IF EXISTS institution_workspace_memberships_source_check;

ALTER TABLE public.institution_workspace_memberships
  ADD CONSTRAINT institution_workspace_memberships_source_check CHECK (
    source IN ('claim', 'manual_admin', 'delegated', 'import')
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

COMMENT ON TABLE public.institution_workspace_memberships IS
  'Active or revoked institution workspace authority granted after admin-reviewed claims or manual admin action.';
COMMENT ON COLUMN public.institution_workspace_memberships.institution_id IS
  'Canonical institution/source identifier whose workspace authority is granted.';
COMMENT ON COLUMN public.institution_workspace_memberships.user_id IS
  'Fee Insight user receiving institution workspace authority.';
COMMENT ON COLUMN public.institution_workspace_memberships.membership_role IS
  'Role within the institution workspace: owner, admin, analyst, or viewer.';
COMMENT ON COLUMN public.institution_workspace_memberships.membership_status IS
  'Active memberships affect Account/Settings authority; revoked memberships remain as audit history.';
COMMENT ON COLUMN public.institution_workspace_memberships.claim_id IS
  'Accepted institution claim that created or refreshed this membership, when applicable.';

COMMIT;
