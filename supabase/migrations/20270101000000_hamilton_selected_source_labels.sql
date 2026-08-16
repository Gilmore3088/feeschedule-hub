SET lock_timeout = '10s';
SET statement_timeout = '120s';

BEGIN;

ALTER TABLE public.hamilton_reports
  ADD COLUMN IF NOT EXISTS selected_source TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS selected_source_label TEXT;

ALTER TABLE public.hamilton_scenarios
  ADD COLUMN IF NOT EXISTS selected_source TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS selected_source_label TEXT;

ALTER TABLE public.hamilton_watchlists
  ADD COLUMN IF NOT EXISTS selected_source TEXT NOT NULL DEFAULT 'watchlist',
  ADD COLUMN IF NOT EXISTS selected_source_label TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'hamilton_reports_selected_source_check'
      AND conrelid = 'public.hamilton_reports'::regclass
  ) THEN
    ALTER TABLE public.hamilton_reports
      ADD CONSTRAINT hamilton_reports_selected_source_check
      CHECK (selected_source IN ('url', 'manual', 'profile', 'watchlist'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'hamilton_scenarios_selected_source_check'
      AND conrelid = 'public.hamilton_scenarios'::regclass
  ) THEN
    ALTER TABLE public.hamilton_scenarios
      ADD CONSTRAINT hamilton_scenarios_selected_source_check
      CHECK (selected_source IN ('url', 'manual', 'profile', 'watchlist'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'hamilton_watchlists_selected_source_check'
      AND conrelid = 'public.hamilton_watchlists'::regclass
  ) THEN
    ALTER TABLE public.hamilton_watchlists
      ADD CONSTRAINT hamilton_watchlists_selected_source_check
      CHECK (selected_source IN ('url', 'manual', 'profile', 'watchlist'));
  END IF;
END $$;

COMMENT ON COLUMN public.hamilton_reports.selected_source IS
  'Where the selected institution context came from when the report artifact was generated.';
COMMENT ON COLUMN public.hamilton_reports.selected_source_label IS
  'Display label for the selected institution source at report generation time.';
COMMENT ON COLUMN public.hamilton_scenarios.selected_source IS
  'Where the selected institution context came from when the scenario artifact was saved.';
COMMENT ON COLUMN public.hamilton_scenarios.selected_source_label IS
  'Display label for the selected institution source at scenario save time.';
COMMENT ON COLUMN public.hamilton_watchlists.selected_source IS
  'Context source for the watchlist row; currently always watchlist for user-created rows.';
COMMENT ON COLUMN public.hamilton_watchlists.selected_source_label IS
  'Display label for the watchlist context source.';

COMMIT;
