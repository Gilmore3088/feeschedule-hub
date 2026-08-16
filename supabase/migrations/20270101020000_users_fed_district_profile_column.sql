SET lock_timeout = '10s';
SET statement_timeout = '120s';

BEGIN;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS fed_district integer;

COMMENT ON COLUMN public.users.fed_district IS
  'Federal Reserve district selected on the Pro user profile.';

COMMIT;
