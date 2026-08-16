SET lock_timeout = '10s';
SET statement_timeout = '120s';

BEGIN;

CREATE TABLE IF NOT EXISTS public.institution_workspace_invitations (
  id BIGSERIAL PRIMARY KEY,
  institution_id BIGINT NOT NULL REFERENCES public.institution_sources(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  invited_role TEXT NOT NULL DEFAULT 'analyst',
  invitation_status TEXT NOT NULL DEFAULT 'pending',
  invited_by_user_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  accepted_by_user_id INTEGER REFERENCES public.users(id) ON DELETE SET NULL,
  revoked_by_user_id INTEGER REFERENCES public.users(id) ON DELETE SET NULL,
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

COMMENT ON TABLE public.institution_workspace_invitations IS
  'Pending, accepted, revoked, or expired institution workspace invitations for users who may not yet have active Pro accounts.';
COMMENT ON COLUMN public.institution_workspace_invitations.email IS
  'Lower-cased invited email address. Pending invitations are accepted after a matching active Pro user exists.';
COMMENT ON COLUMN public.institution_workspace_invitations.invited_role IS
  'Workspace role that will be granted when the invitation is accepted.';
COMMENT ON COLUMN public.institution_workspace_invitations.invitation_status IS
  'Lifecycle state for invite audit and owner-visible pending access.';

COMMIT;
