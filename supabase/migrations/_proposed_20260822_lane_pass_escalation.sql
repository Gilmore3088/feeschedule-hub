-- Proposed migration: lane cadence, failure vocabulary, pass escalation, coverage view.
-- Review before applying. Add through the project migration workflow, do not apply by hand.
-- Written against schema observed in supabase/migrations as of 2026-08-22.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Lane cadence
--    Full acquisition is quarterly; cheap hash-based change detection runs on
--    its own frequent schedule. A lane that re-runs daily never finishes.
-- ---------------------------------------------------------------------------

ALTER TABLE public.agent_state_lanes
  ALTER COLUMN freshness_target_hours SET DEFAULT 2184;  -- ~91 days

ALTER TABLE public.agent_state_lanes
  ADD COLUMN IF NOT EXISTS change_check_target_hours INTEGER NOT NULL DEFAULT 168,
  ADD COLUMN IF NOT EXISTS next_change_check_after   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD CONSTRAINT agent_state_lanes_change_check_positive_check
    CHECK (change_check_target_hours > 0);

-- Existing lanes keep whatever an operator set explicitly; only the ones still
-- sitting on the old 24h default move.
UPDATE public.agent_state_lanes
   SET freshness_target_hours = 2184,
       updated_at = NOW()
 WHERE freshness_target_hours = 24;

-- ---------------------------------------------------------------------------
-- 2. Failure vocabulary
--    failure_reason is currently assembled by string interpolation
--    (magellan_${result.outcome}) which makes it unroutable. Close the set.
-- ---------------------------------------------------------------------------

-- Map the known interpolated values onto the vocabulary before constraining.
UPDATE public.institution_sources
   SET failure_reason_note = COALESCE(failure_reason_note, failure_reason),
       failure_reason = CASE
         WHEN failure_reason IS NULL                        THEN NULL
         WHEN failure_reason ILIKE '%no_site%'              THEN 'no_website'
         WHEN failure_reason ILIKE '%dead%'                 THEN 'no_website'
         WHEN failure_reason ILIKE '%empty%'                THEN 'no_candidate_docs'
         WHEN failure_reason ILIKE '%discard%'              THEN 'no_candidate_docs'
         WHEN failure_reason ILIKE '%skipped%'              THEN 'no_candidate_docs'
         WHEN failure_reason ILIKE '%needs_ocr%'            THEN 'pdf_no_text_layer'
         WHEN failure_reason ILIKE '%scanned%'              THEN 'pdf_no_text_layer'
         WHEN failure_reason ILIKE '%browser_render%'       THEN 'js_rendered_only'
         WHEN failure_reason ILIKE '%needs_human%'          THEN 'doc_ambiguous'
         WHEN failure_reason ILIKE '%manual_review%'        THEN 'doc_ambiguous'
         WHEN failure_reason ILIKE '%retry_after%'          THEN 'fetch_blocked'
         WHEN failure_reason ILIKE '%failed%'               THEN 'fetch_blocked'
         WHEN failure_reason ILIKE '%failure%'              THEN 'fetch_blocked'
         ELSE 'doc_ambiguous'
       END,
       failure_reason_updated_at = NOW()
 WHERE failure_reason IS NOT NULL;

ALTER TABLE public.institution_sources
  ADD CONSTRAINT institution_sources_failure_reason_check
  CHECK (failure_reason IS NULL OR failure_reason IN (
    'no_website',
    'no_candidate_docs',
    'doc_ambiguous',
    'pdf_no_text_layer',
    'js_rendered_only',
    'behind_login',
    'schedule_is_html_page',
    'schedule_stale',
    'extraction_empty',
    'fetch_blocked',
    'no_public_schedule'
  ));

-- ---------------------------------------------------------------------------
-- 3. Pass escalation
--    NOTE: "pass" deliberately, never "tier" — tier already means the fee data
--    promotion level (raw -> verified -> published) via promote_to_tier2/3.
-- ---------------------------------------------------------------------------

ALTER TABLE public.agent_state_lanes
  ADD COLUMN IF NOT EXISTS current_pass   SMALLINT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS pass_opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS cycle_period   TEXT,
  ADD CONSTRAINT agent_state_lanes_current_pass_check
    CHECK (current_pass BETWEEN 1 AND 3);

ALTER TABLE public.institution_source_profiles
  ADD COLUMN IF NOT EXISTS pass_attempts JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_pass     SMALLINT NOT NULL DEFAULT 0,
  ADD CONSTRAINT institution_source_profiles_last_pass_check
    CHECK (last_pass BETWEEN 0 AND 3);

COMMENT ON COLUMN public.institution_source_profiles.pass_attempts IS
  'Per-pass attempt counts, e.g. {"1":2,"2":1}. Drives backoff within a pass; '
  'last_pass drives method selection via the failure_reason routing table.';

-- Reason -> method routing, as data rather than branching code.
CREATE TABLE IF NOT EXISTS public.failure_recovery_routes (
  failure_reason  TEXT     NOT NULL,
  pass            SMALLINT NOT NULL,
  read_strategy   TEXT,
  method_note     TEXT     NOT NULL,
  is_terminal     BOOLEAN  NOT NULL DEFAULT FALSE,
  PRIMARY KEY (failure_reason, pass),
  CONSTRAINT failure_recovery_routes_pass_check CHECK (pass IN (2, 3)),
  CONSTRAINT failure_recovery_routes_strategy_check
    CHECK (read_strategy IS NULL OR read_strategy IN (
      'pdf_text', 'html_dom', 'browser_render', 'ocr', 'manual_review'
    ))
);

INSERT INTO public.failure_recovery_routes
  (failure_reason, pass, read_strategy, method_note, is_terminal)
VALUES
  ('no_website',            2, NULL,             'Refresh website from regulator source file', FALSE),
  ('no_website',            3, 'manual_review',  'Manual research queue', FALSE),
  ('no_candidate_docs',     2, NULL,             'Deeper crawl, site search endpoint, site: query', FALSE),
  ('no_candidate_docs',     3, 'browser_render', 'Browser render, then direct outreach', FALSE),
  ('doc_ambiguous',         2, NULL,             'Larger model with expanded page context', FALSE),
  ('doc_ambiguous',         3, 'manual_review',  'Human document selection queue', FALSE),
  ('pdf_no_text_layer',     2, 'ocr',            'OCR pass', FALSE),
  ('pdf_no_text_layer',     3, 'ocr',            'Vision model over page images', FALSE),
  ('js_rendered_only',      2, 'browser_render', 'Headless render', FALSE),
  ('js_rendered_only',      3, 'browser_render', 'Hosted browser session', FALSE),
  ('behind_login',          2, NULL,             'Archive or cached copy lookup', FALSE),
  ('behind_login',          3, 'manual_review',  'Direct outreach to institution', FALSE),
  ('schedule_is_html_page', 2, 'html_dom',       'DOM table parser instead of PDF path', FALSE),
  ('schedule_is_html_page', 3, 'html_dom',       'Table-structure model', FALSE),
  ('schedule_stale',        2, NULL,             'Archive lookup for the current edition', FALSE),
  ('schedule_stale',        3, 'manual_review',  'Direct outreach to institution', FALSE),
  ('extraction_empty',      2, NULL,             'Re-extract at a revised prompt version', FALSE),
  ('extraction_empty',      3, NULL,             'Larger model over the full document', FALSE),
  ('fetch_blocked',         2, NULL,             'Backoff and retry with varied headers', FALSE),
  ('fetch_blocked',         3, 'browser_render', 'Hosted browser session', FALSE),
  ('no_public_schedule',    2, NULL,             'Terminal — publishable finding, not a miss', TRUE),
  ('no_public_schedule',    3, NULL,             'Terminal — publishable finding, not a miss', TRUE)
ON CONFLICT (failure_reason, pass) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. Report-viable coverage
--    Promotes Reports/studio/coverage.sql into the runtime.
--    Reads published_fee_catalog only, per the repo hard rule.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.featured_fee_keys
WITH (security_invoker = true)
AS
SELECT unnest(ARRAY[
  'monthly_maintenance','overdraft','nsf','atm_non_network','card_foreign_txn',
  'wire_domestic_outgoing','stop_payment','wire_intl_outgoing','wire_domestic_incoming',
  'cashiers_check','od_protection_transfer','paper_statement','minimum_balance',
  'card_replacement','deposited_item_return'
]) AS canonical_fee_key;

CREATE OR REPLACE VIEW public.institution_report_viability
WITH (security_invoker = true)
AS
SELECT
  s.id                AS institution_id,
  s.institution_name,
  s.state_code,
  s.charter_type,
  s.asset_size_tier,
  s.fed_district,
  COALESCE(c.n_featured, 0)          AS featured_published,
  COALESCE(c.n_featured, 0) >= 12    AS is_report_viable,
  s.failure_reason,
  s.last_success_at
FROM public.institution_sources s
LEFT JOIN (
  SELECT institution_id, count(DISTINCT canonical_fee_key) AS n_featured
    FROM public.published_fee_catalog
   WHERE canonical_fee_key IN (SELECT canonical_fee_key FROM public.featured_fee_keys)
   GROUP BY institution_id
) c ON c.institution_id = s.id;

CREATE OR REPLACE VIEW public.lane_coverage
WITH (security_invoker = true)
AS
SELECT
  v.state_code,
  count(*)                                              AS institutions,
  count(*) FILTER (WHERE v.is_report_viable)            AS viable,
  ROUND(
    100.0 * count(*) FILTER (WHERE v.is_report_viable)
    / NULLIF(count(*) FILTER (WHERE v.failure_reason IS DISTINCT FROM 'no_public_schedule'), 0)
  , 1)                                                  AS viable_pct,
  count(*) FILTER (WHERE v.failure_reason = 'no_public_schedule') AS no_public_schedule,
  count(*) FILTER (WHERE v.featured_published = 0)      AS zero_coverage,
  ROUND(AVG(v.featured_published), 2)                   AS avg_featured_published
FROM public.institution_report_viability v
GROUP BY v.state_code
ORDER BY viable_pct DESC NULLS LAST;

REVOKE ALL ON public.featured_fee_keys FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.institution_report_viability FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.lane_coverage FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Coverage snapshots — a cycle closes with a number or it is not closed.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.lane_coverage_snapshots (
  id                BIGSERIAL PRIMARY KEY,
  state_code        TEXT        NOT NULL,
  cycle_period      TEXT        NOT NULL,
  pass              SMALLINT    NOT NULL,
  institutions      INTEGER     NOT NULL,
  viable            INTEGER     NOT NULL,
  viable_pct        NUMERIC(5,1),
  unresolved        INTEGER     NOT NULL DEFAULT 0,
  cost_cents        INTEGER     NOT NULL DEFAULT 0,
  per_category      JSONB       NOT NULL DEFAULT '{}'::jsonb,
  captured_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (state_code, cycle_period, pass)
);

REVOKE ALL ON public.lane_coverage_snapshots FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.lane_coverage_snapshots_id_seq FROM PUBLIC, anon, authenticated;

COMMIT;
