-- Semantic compatibility views for remaining institution-keyed data sets.
--
-- These views let active app code use institution_id consistently while the
-- physical baseline still contains historical crawl_target_id columns.

CREATE OR REPLACE VIEW public.institution_financial_records
WITH (security_invoker = true)
AS
SELECT
  id,
  crawl_target_id AS institution_id,
  report_date,
  source,
  total_assets,
  total_deposits,
  total_loans,
  service_charge_income,
  other_noninterest_income,
  net_interest_margin,
  efficiency_ratio,
  roa,
  roe,
  tier1_capital_ratio,
  branch_count,
  employee_count,
  member_count,
  raw_json,
  fetched_at,
  total_revenue,
  fee_income_ratio,
  overdraft_revenue,
  source_cert_number
FROM public.institution_financials;

CREATE OR REPLACE VIEW public.institution_complaint_records
WITH (security_invoker = true)
AS
SELECT
  id,
  crawl_target_id AS institution_id,
  report_period,
  product,
  issue,
  complaint_count,
  fetched_at
FROM public.institution_complaints;

CREATE OR REPLACE VIEW public.institution_branch_deposits
WITH (security_invoker = true)
AS
SELECT
  id,
  cert,
  crawl_target_id AS institution_id,
  year,
  branch_number,
  is_main_office,
  deposits,
  state,
  city,
  county_fips,
  msa_code,
  msa_name,
  fed_district,
  latitude,
  longitude,
  fetched_at
FROM public.branch_deposits;

CREATE OR REPLACE VIEW public.fee_change_records
WITH (security_invoker = true)
AS
SELECT
  id,
  crawl_target_id AS institution_id,
  fee_category,
  previous_amount,
  previous_amount::numeric AS old_amount,
  new_amount,
  change_type,
  detected_at,
  detected_at AS changed_at,
  NULL::text AS canonical_fee_key
FROM public.fee_change_events;

CREATE OR REPLACE VIEW public.institution_fee_snapshot_records
WITH (security_invoker = true)
AS
SELECT
  id,
  crawl_target_id AS institution_id,
  crawl_result_id AS source_document_id,
  snapshot_date,
  fee_name,
  fee_category,
  amount,
  frequency,
  conditions,
  account_product_type,
  extraction_confidence,
  created_at
FROM public.fee_snapshots;

CREATE OR REPLACE VIEW public.institution_analysis_results
WITH (security_invoker = true)
AS
SELECT
  id,
  crawl_target_id AS institution_id,
  analysis_type,
  result_json,
  computed_at
FROM public.analysis_results;

CREATE OR REPLACE VIEW public.institution_fee_alert_subscriptions
WITH (security_invoker = true)
AS
SELECT
  id,
  user_id,
  crawl_target_id AS institution_id,
  fee_categories,
  is_active,
  NULL::timestamptz AS last_alerted_at,
  created_at
FROM public.fee_alert_subscriptions;

CREATE OR REPLACE VIEW public.agent_institution_run_results
WITH (security_invoker = true)
AS
SELECT
  id,
  agent_run_id,
  crawl_target_id AS institution_id,
  stage,
  status,
  detail,
  created_at
FROM public.agent_run_results;

CREATE TABLE IF NOT EXISTS public.gold_standard_verifications (
  id BIGSERIAL PRIMARY KEY,
  institution_id BIGINT NOT NULL,
  fee_id BIGINT NOT NULL,
  verdict TEXT NOT NULL CHECK (verdict IN ('correct', 'incorrect')),
  verified_by TEXT NOT NULL,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (fee_id)
);

ALTER TABLE public.gold_standard_verifications ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.upsert_institution_fee_alert_subscription(
  p_user_id BIGINT,
  p_institution_id BIGINT,
  p_fee_categories TEXT[] DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  subscription_id BIGINT;
BEGIN
  INSERT INTO public.fee_alert_subscriptions (user_id, crawl_target_id, fee_categories)
  VALUES (p_user_id, p_institution_id, p_fee_categories)
  ON CONFLICT (user_id, crawl_target_id) DO UPDATE
  SET is_active = TRUE,
      fee_categories = EXCLUDED.fee_categories
  RETURNING id INTO subscription_id;

  RETURN subscription_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.deactivate_institution_fee_alert_subscription(
  p_user_id BIGINT,
  p_institution_id BIGINT
)
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  affected_count INTEGER;
BEGIN
  UPDATE public.fee_alert_subscriptions
  SET is_active = FALSE
  WHERE user_id = p_user_id
    AND crawl_target_id = p_institution_id;

  GET DIAGNOSTICS affected_count = ROW_COUNT;
  RETURN affected_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_gold_standard_fee_verification(
  p_institution_id BIGINT,
  p_fee_id BIGINT,
  p_verdict TEXT,
  p_verified_by TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.gold_standard_verifications
    (institution_id, fee_id, verdict, verified_by, verified_at)
  VALUES
    (p_institution_id, p_fee_id, p_verdict, p_verified_by, NOW())
  ON CONFLICT (fee_id) DO UPDATE
  SET institution_id = EXCLUDED.institution_id,
      verdict = EXCLUDED.verdict,
      verified_by = EXCLUDED.verified_by,
      verified_at = NOW();
END;
$$;

REVOKE ALL ON public.institution_financial_records FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.institution_complaint_records FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.institution_branch_deposits FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.fee_change_records FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.institution_fee_snapshot_records FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.institution_analysis_results FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.institution_fee_alert_subscriptions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.agent_institution_run_results FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.gold_standard_verifications FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.gold_standard_verifications_id_seq FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.upsert_institution_fee_alert_subscription(BIGINT, BIGINT, TEXT[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.deactivate_institution_fee_alert_subscription(BIGINT, BIGINT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_gold_standard_fee_verification(BIGINT, BIGINT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

COMMENT ON VIEW public.institution_financial_records IS
  'Semantic financial read model exposing institution_id while physical storage still uses crawl_target_id.';
COMMENT ON VIEW public.institution_complaint_records IS
  'Semantic complaint read model exposing institution_id while physical storage still uses crawl_target_id.';
COMMENT ON VIEW public.institution_branch_deposits IS
  'Semantic branch-deposit read model exposing institution_id while physical storage still uses crawl_target_id.';
COMMENT ON VIEW public.fee_change_records IS
  'Semantic fee-change read model exposing institution_id and changed_at while physical storage remains compatibility-shaped.';
COMMENT ON VIEW public.institution_fee_snapshot_records IS
  'Semantic fee snapshot read model exposing institution_id and source_document_id.';
COMMENT ON VIEW public.institution_analysis_results IS
  'Semantic analysis-results read model exposing institution_id.';
COMMENT ON VIEW public.institution_fee_alert_subscriptions IS
  'Semantic alert-subscription read model exposing institution_id.';
COMMENT ON VIEW public.agent_institution_run_results IS
  'Semantic state-agent result read model exposing institution_id.';
COMMENT ON TABLE public.gold_standard_verifications IS
  'Semantic gold-standard verification decisions keyed by institution_id and fee_id.';
