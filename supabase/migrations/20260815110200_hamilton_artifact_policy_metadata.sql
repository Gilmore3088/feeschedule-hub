SET lock_timeout = '10s';
SET statement_timeout = '120s';

BEGIN;

ALTER TABLE public.hamilton_reports
  ADD COLUMN IF NOT EXISTS evidence_policy TEXT NOT NULL DEFAULT 'provisional-first',
  ADD COLUMN IF NOT EXISTS peer_set_id TEXT,
  ADD COLUMN IF NOT EXISTS peer_baseline_source TEXT,
  ADD COLUMN IF NOT EXISTS peer_baseline_label TEXT,
  ADD COLUMN IF NOT EXISTS peer_fallback_reason TEXT,
  ADD COLUMN IF NOT EXISTS selected_verified_fee_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS selected_provisional_fee_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS selected_fee_delta_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.hamilton_scenarios
  ADD COLUMN IF NOT EXISTS evidence_policy TEXT NOT NULL DEFAULT 'verified-only',
  ADD COLUMN IF NOT EXISTS peer_baseline_source TEXT,
  ADD COLUMN IF NOT EXISTS peer_baseline_label TEXT,
  ADD COLUMN IF NOT EXISTS peer_fallback_reason TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'hamilton_reports_evidence_policy_check'
      AND conrelid = 'public.hamilton_reports'::regclass
  ) THEN
    ALTER TABLE public.hamilton_reports
      ADD CONSTRAINT hamilton_reports_evidence_policy_check
      CHECK (evidence_policy IN ('verified-only', 'provisional-first', 'source-diligence'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'hamilton_reports_peer_baseline_source_check'
      AND conrelid = 'public.hamilton_reports'::regclass
  ) THEN
    ALTER TABLE public.hamilton_reports
      ADD CONSTRAINT hamilton_reports_peer_baseline_source_check
      CHECK (
        peer_baseline_source IS NULL OR
        peer_baseline_source IN ('saved-peer-set', 'selected-institution-default', 'national')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'hamilton_scenarios_evidence_policy_check'
      AND conrelid = 'public.hamilton_scenarios'::regclass
  ) THEN
    ALTER TABLE public.hamilton_scenarios
      ADD CONSTRAINT hamilton_scenarios_evidence_policy_check
      CHECK (evidence_policy IN ('verified-only', 'provisional-first', 'source-diligence'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'hamilton_scenarios_peer_baseline_source_check'
      AND conrelid = 'public.hamilton_scenarios'::regclass
  ) THEN
    ALTER TABLE public.hamilton_scenarios
      ADD CONSTRAINT hamilton_scenarios_peer_baseline_source_check
      CHECK (
        peer_baseline_source IS NULL OR
        peer_baseline_source IN ('saved-peer-set', 'selected-institution-default', 'national')
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_hamilton_report_policy_baseline
  ON public.hamilton_reports(evidence_policy, peer_baseline_source, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_hamilton_report_peer_set
  ON public.hamilton_reports(user_id, peer_set_id, created_at DESC)
  WHERE peer_set_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_hamilton_scenario_policy_baseline
  ON public.hamilton_scenarios(evidence_policy, peer_baseline_source, updated_at DESC);

COMMENT ON COLUMN public.hamilton_reports.evidence_policy IS
  'Hamilton evidence policy used when generating the saved report artifact.';
COMMENT ON COLUMN public.hamilton_reports.peer_baseline_source IS
  'Source of the verified peer baseline used for report deltas.';
COMMENT ON COLUMN public.hamilton_reports.selected_fee_delta_count IS
  'Number of deterministic selected-institution fee deltas available at generation time.';
COMMENT ON COLUMN public.hamilton_scenarios.evidence_policy IS
  'Hamilton evidence policy used when saving the scenario artifact.';
COMMENT ON COLUMN public.hamilton_scenarios.peer_baseline_source IS
  'Source of the verified peer baseline used for scenario positioning.';

COMMIT;
