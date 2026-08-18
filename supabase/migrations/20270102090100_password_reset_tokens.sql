SET lock_timeout = '10s';
SET statement_timeout = '120s';

BEGIN;

CREATE TABLE IF NOT EXISTS public.password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS password_reset_tokens_user_id_idx
  ON public.password_reset_tokens (user_id);

-- Speeds up the outstanding-token lookups in issueReset/consumeReset, which
-- only ever care about tokens that are still eligible for use.
CREATE INDEX IF NOT EXISTS password_reset_tokens_expires_at_unused_idx
  ON public.password_reset_tokens (expires_at)
  WHERE used_at IS NULL;

COMMENT ON TABLE public.password_reset_tokens IS
  'Single-use self-service password reset tokens. token_hash stores sha256(token); the raw token is only ever emailed, never persisted.';

COMMIT;
