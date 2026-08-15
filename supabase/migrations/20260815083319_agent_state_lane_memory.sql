BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.institution_sources
  ADD COLUMN IF NOT EXISTS last_crawl_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_success_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS consecutive_failures INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_content_hash TEXT,
  ADD COLUMN IF NOT EXISTS document_type TEXT,
  ADD COLUMN IF NOT EXISTS document_type_detected TEXT,
  ADD COLUMN IF NOT EXISTS failure_reason TEXT,
  ADD COLUMN IF NOT EXISTS failure_reason_note TEXT,
  ADD COLUMN IF NOT EXISTS failure_reason_updated_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.agent_state_lanes (
  state_code              TEXT PRIMARY KEY,
  priority_score          INTEGER NOT NULL DEFAULT 0,
  freshness_target_hours  INTEGER NOT NULL DEFAULT 24,
  backlog_missing_urls    INTEGER NOT NULL DEFAULT 0,
  backlog_stale_sources   INTEGER NOT NULL DEFAULT 0,
  backlog_ocr             INTEGER NOT NULL DEFAULT 0,
  backlog_manual_review   INTEGER NOT NULL DEFAULT 0,
  failure_count           INTEGER NOT NULL DEFAULT 0,
  correction_count        INTEGER NOT NULL DEFAULT 0,
  last_agent_run_id       INTEGER REFERENCES public.agent_runs(id) ON DELETE SET NULL,
  last_run_at             TIMESTAMPTZ,
  last_success_at         TIMESTAMPTZ,
  next_run_after          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lease_token             UUID,
  lease_expires_at        TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT agent_state_lanes_state_code_check
    CHECK (state_code = upper(state_code) AND length(state_code) BETWEEN 2 AND 3),
  CONSTRAINT agent_state_lanes_freshness_positive_check
    CHECK (freshness_target_hours > 0)
);

CREATE TABLE IF NOT EXISTS public.institution_source_profiles (
  institution_id                        BIGINT PRIMARY KEY REFERENCES public.institution_sources(id) ON DELETE CASCADE,
  state_code                            TEXT NOT NULL,
  canonical_source_url                  TEXT,
  source_kind                           TEXT NOT NULL DEFAULT 'unknown',
  read_strategy                         TEXT,
  last_source_hash                      TEXT,
  last_successful_source_document_id    BIGINT REFERENCES public.source_documents(id) ON DELETE SET NULL,
  last_successful_text_id               BIGINT REFERENCES public.agent_source_texts(id) ON DELETE SET NULL,
  last_success_at                       TIMESTAMPTZ,
  last_failure_at                       TIMESTAMPTZ,
  last_failure_reason                   TEXT,
  consecutive_failures                  INTEGER NOT NULL DEFAULT 0,
  correction_version                    INTEGER NOT NULL DEFAULT 0,
  locked_by_correction                  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at                            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT institution_source_profiles_state_code_check
    CHECK (state_code = upper(state_code) AND length(state_code) BETWEEN 2 AND 3),
  CONSTRAINT institution_source_profiles_source_kind_check
    CHECK (source_kind IN ('pdf', 'html', 'scanned_pdf', 'unknown', 'offline')),
  CONSTRAINT institution_source_profiles_read_strategy_check
    CHECK (read_strategy IS NULL OR read_strategy IN (
      'pdf_text',
      'html_dom',
      'browser_render',
      'ocr',
      'manual_review'
    )),
  CONSTRAINT institution_source_profiles_failures_nonnegative_check
    CHECK (consecutive_failures >= 0)
);

CREATE TABLE IF NOT EXISTS public.institution_source_corrections (
  id                BIGSERIAL PRIMARY KEY,
  institution_id    BIGINT NOT NULL REFERENCES public.institution_sources(id) ON DELETE CASCADE,
  agent_run_id      INTEGER REFERENCES public.agent_runs(id) ON DELETE SET NULL,
  correction_type   TEXT NOT NULL,
  before_value      JSONB NOT NULL DEFAULT '{}'::jsonb,
  after_value       JSONB NOT NULL DEFAULT '{}'::jsonb,
  reason            TEXT,
  corrected_by      TEXT NOT NULL DEFAULT 'agent',
  confidence        NUMERIC(5,4),
  accepted          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT institution_source_corrections_type_check
    CHECK (correction_type IN (
      'canonical_source_url',
      'source_kind',
      'read_strategy',
      'offline',
      'bad_source',
      'manual_review',
      'other'
    )),
  CONSTRAINT institution_source_corrections_confidence_check
    CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1))
);

CREATE TABLE IF NOT EXISTS public.public_discovery_observations (
  id                       BIGSERIAL PRIMARY KEY,
  agent_run_id             INTEGER REFERENCES public.agent_runs(id) ON DELETE SET NULL,
  state_code               TEXT,
  route_template           TEXT,
  url                      TEXT NOT NULL,
  source                   TEXT NOT NULL DEFAULT 'magellan_public_discovery',
  viewport                 TEXT NOT NULL DEFAULT 'desktop',
  status_code              INTEGER,
  final_url                TEXT,
  h1                       TEXT,
  title                    TEXT,
  has_horizontal_overflow  BOOLEAN NOT NULL DEFAULT FALSE,
  console_error_count      INTEGER NOT NULL DEFAULT 0,
  console_warning_count    INTEGER NOT NULL DEFAULT 0,
  screenshot_path          TEXT,
  observed_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  detail                   JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT public_discovery_observations_state_code_check
    CHECK (state_code IS NULL OR (state_code = upper(state_code) AND length(state_code) BETWEEN 2 AND 3)),
  CONSTRAINT public_discovery_observations_viewport_check
    CHECK (viewport IN ('desktop', 'mobile')),
  CONSTRAINT public_discovery_observations_console_counts_check
    CHECK (console_error_count >= 0 AND console_warning_count >= 0)
);

CREATE TABLE IF NOT EXISTS public.public_discovery_findings (
  id               BIGSERIAL PRIMARY KEY,
  observation_id   BIGINT REFERENCES public.public_discovery_observations(id) ON DELETE CASCADE,
  agent_run_id     INTEGER REFERENCES public.agent_runs(id) ON DELETE SET NULL,
  state_code       TEXT,
  route_template   TEXT,
  url              TEXT NOT NULL,
  issue_code       TEXT NOT NULL,
  severity         TEXT NOT NULL DEFAULT 'warning',
  verified_status  TEXT NOT NULL DEFAULT 'unverified',
  message          TEXT NOT NULL,
  evidence         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT public_discovery_findings_state_code_check
    CHECK (state_code IS NULL OR (state_code = upper(state_code) AND length(state_code) BETWEEN 2 AND 3)),
  CONSTRAINT public_discovery_findings_issue_code_check
    CHECK (issue_code IN (
      'horizontal_overflow',
      'visible_error',
      'console_errors',
      'unlabeled_inputs',
      'not_found'
    )),
  CONSTRAINT public_discovery_findings_severity_check
    CHECK (severity IN ('info', 'warning', 'critical')),
  CONSTRAINT public_discovery_findings_verified_status_check
    CHECK (verified_status IN ('unverified', 'verified', 'dismissed'))
);

CREATE INDEX IF NOT EXISTS agent_state_lanes_due_idx
  ON public.agent_state_lanes (next_run_after ASC, priority_score DESC, state_code ASC, lease_expires_at ASC NULLS FIRST);

CREATE INDEX IF NOT EXISTS agent_state_lanes_last_run_idx
  ON public.agent_state_lanes (last_run_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS institution_source_profiles_state_idx
  ON public.institution_source_profiles (state_code, updated_at DESC);

CREATE INDEX IF NOT EXISTS institution_source_profiles_backlog_idx
  ON public.institution_source_profiles (state_code, source_kind, read_strategy)
  WHERE source_kind IN ('unknown', 'scanned_pdf') OR read_strategy IN ('ocr', 'manual_review', 'browser_render');

CREATE INDEX IF NOT EXISTS institution_source_profiles_failure_idx
  ON public.institution_source_profiles (state_code, consecutive_failures DESC, last_failure_at DESC NULLS LAST)
  WHERE consecutive_failures > 0;

CREATE INDEX IF NOT EXISTS institution_source_corrections_institution_idx
  ON public.institution_source_corrections (institution_id, created_at DESC);

CREATE INDEX IF NOT EXISTS institution_source_corrections_type_idx
  ON public.institution_source_corrections (correction_type, created_at DESC);

CREATE INDEX IF NOT EXISTS public_discovery_observations_state_route_idx
  ON public.public_discovery_observations (state_code, route_template, observed_at DESC);

CREATE INDEX IF NOT EXISTS public_discovery_observations_run_idx
  ON public.public_discovery_observations (agent_run_id, observed_at DESC);

CREATE INDEX IF NOT EXISTS public_discovery_findings_state_code_idx
  ON public.public_discovery_findings (state_code, issue_code, verified_status, created_at DESC);

CREATE INDEX IF NOT EXISTS public_discovery_findings_observation_idx
  ON public.public_discovery_findings (observation_id);

INSERT INTO public.agent_state_lanes (state_code, next_run_after, created_at, updated_at)
SELECT DISTINCT upper(btrim(state_code)), NOW(), NOW(), NOW()
  FROM public.institution_sources
 WHERE state_code IS NOT NULL
   AND btrim(state_code) <> ''
ON CONFLICT (state_code) DO NOTHING;

INSERT INTO public.institution_source_profiles (
  institution_id,
  state_code,
  canonical_source_url,
  source_kind,
  read_strategy,
  last_source_hash,
  last_success_at,
  last_failure_at,
  last_failure_reason,
  consecutive_failures,
  created_at,
  updated_at
)
SELECT
  inst.id,
  upper(btrim(inst.state_code)),
  NULLIF(btrim(inst.fee_schedule_url), ''),
  CASE
    WHEN inst.document_type IN ('pdf', 'html') THEN inst.document_type
    WHEN inst.document_type IN ('offline', 'no_website') THEN 'offline'
    WHEN inst.fee_schedule_url ILIKE '%.pdf%' THEN 'pdf'
    WHEN inst.fee_schedule_url IS NOT NULL AND btrim(inst.fee_schedule_url) <> '' THEN 'unknown'
    ELSE 'unknown'
  END,
  CASE
    WHEN inst.document_type = 'pdf' OR inst.fee_schedule_url ILIKE '%.pdf%' THEN 'pdf_text'
    WHEN inst.document_type = 'html' THEN 'html_dom'
    WHEN inst.document_type IN ('offline', 'no_website') THEN 'manual_review'
    ELSE NULL
  END,
  inst.last_content_hash,
  inst.last_success_at,
  CASE WHEN inst.failure_reason IS NOT NULL THEN inst.failure_reason_updated_at ELSE NULL END,
  inst.failure_reason_note,
  COALESCE(inst.consecutive_failures, 0),
  NOW(),
  NOW()
FROM public.institution_sources inst
WHERE inst.state_code IS NOT NULL
  AND btrim(inst.state_code) <> ''
ON CONFLICT (institution_id) DO UPDATE SET
  state_code = EXCLUDED.state_code,
  canonical_source_url = COALESCE(public.institution_source_profiles.canonical_source_url, EXCLUDED.canonical_source_url),
  source_kind = CASE
    WHEN public.institution_source_profiles.locked_by_correction THEN public.institution_source_profiles.source_kind
    ELSE EXCLUDED.source_kind
  END,
  read_strategy = CASE
    WHEN public.institution_source_profiles.locked_by_correction THEN public.institution_source_profiles.read_strategy
    ELSE COALESCE(public.institution_source_profiles.read_strategy, EXCLUDED.read_strategy)
  END,
  updated_at = NOW();

WITH lane_counts AS (
  SELECT
    inst.state_code,
    COUNT(*) FILTER (
      WHERE COALESCE(inst.status, 'active') = 'active'
        AND (inst.fee_schedule_url IS NULL OR btrim(inst.fee_schedule_url) = '')
        AND inst.website_url IS NOT NULL
        AND btrim(inst.website_url) <> ''
    )::int AS missing_urls,
    COUNT(*) FILTER (
      WHERE COALESCE(inst.status, 'active') = 'active'
        AND inst.fee_schedule_url IS NOT NULL
        AND btrim(inst.fee_schedule_url) <> ''
        AND (
          inst.last_crawl_at IS NULL
          OR inst.last_crawl_at < NOW() - INTERVAL '7 days'
        )
    )::int AS stale_sources,
    COUNT(*) FILTER (
      WHERE profile.read_strategy = 'ocr'
    )::int AS ocr_backlog,
    COUNT(*) FILTER (
      WHERE profile.read_strategy = 'manual_review'
    )::int AS manual_backlog,
    COUNT(*) FILTER (
      WHERE COALESCE(profile.consecutive_failures, inst.consecutive_failures, 0) > 0
    )::int AS failures
  FROM public.institution_sources inst
  LEFT JOIN public.institution_source_profiles profile
    ON profile.institution_id = inst.id
  WHERE inst.state_code IS NOT NULL
    AND btrim(inst.state_code) <> ''
  GROUP BY inst.state_code
),
correction_counts AS (
  SELECT upper(btrim(inst.state_code)) AS state_code,
         COUNT(*)::int AS corrections
    FROM public.institution_source_corrections correction
    JOIN public.institution_sources inst ON inst.id = correction.institution_id
   WHERE inst.state_code IS NOT NULL
     AND btrim(inst.state_code) <> ''
   GROUP BY upper(btrim(inst.state_code))
)
UPDATE public.agent_state_lanes lane
   SET backlog_missing_urls = lane_counts.missing_urls,
       backlog_stale_sources = lane_counts.stale_sources,
       backlog_ocr = lane_counts.ocr_backlog,
       backlog_manual_review = lane_counts.manual_backlog,
       failure_count = lane_counts.failures,
       correction_count = COALESCE(correction_counts.corrections, 0),
       updated_at = NOW()
  FROM lane_counts
  LEFT JOIN correction_counts ON correction_counts.state_code = lane_counts.state_code
 WHERE lane.state_code = upper(btrim(lane_counts.state_code));

ALTER TABLE public.agent_state_lanes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.institution_source_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.institution_source_corrections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_discovery_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_discovery_findings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.agent_state_lanes FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.institution_source_profiles FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.institution_source_corrections FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.public_discovery_observations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.public_discovery_findings FROM PUBLIC, anon, authenticated;

REVOKE ALL ON SEQUENCE public.institution_source_corrections_id_seq FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.public_discovery_observations_id_seq FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.public_discovery_findings_id_seq FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.agent_state_lanes IS
  'Atlas state-sized work partitions with freshness, backlog, leasing, and run visibility metadata.';

COMMENT ON TABLE public.institution_source_profiles IS
  'Private institution source memory used by Magellan/Rosetta/Knox/Darwin/Hamilton. Corrections take precedence over inferred agent behavior.';

COMMENT ON TABLE public.institution_source_corrections IS
  'Append-only correction history for source URL, source kind, read strategy, offline/bad-source, and manual-review decisions.';

COMMENT ON TABLE public.public_discovery_observations IS
  'Private Rosetta public-page render/read evidence for state-scoped public discovery audits.';

COMMENT ON TABLE public.public_discovery_findings IS
  'Private Knox/Darwin/Hamilton public discovery findings derived from page observations.';

COMMIT;
