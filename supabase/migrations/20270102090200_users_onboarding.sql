SET lock_timeout = '10s';
SET statement_timeout = '120s';

BEGIN;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;

COMMENT ON COLUMN public.users.onboarding_completed_at IS
  'Set the first time /account/welcome finishes rendering for this user; later visits redirect straight to /account instead of re-showing the wizard.';

COMMIT;
