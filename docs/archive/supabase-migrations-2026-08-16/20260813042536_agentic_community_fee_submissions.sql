-- Move public fee submissions onto an agentic storage name. The legacy
-- community_submissions table was previously created from a request path, so
-- this migration creates the durable table and backfills existing submissions
-- when that ad-hoc table is present.

CREATE TABLE IF NOT EXISTS public.community_fee_submissions (
  id BIGSERIAL PRIMARY KEY,
  institution_id BIGINT,
  institution_name TEXT NOT NULL,
  fee_name TEXT NOT NULL,
  fee_category TEXT,
  amount NUMERIC,
  frequency TEXT,
  source_url TEXT NOT NULL,
  submitter_ip TEXT,
  review_status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.community_fee_submissions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.community_fee_submissions FROM anon, authenticated;

CREATE INDEX IF NOT EXISTS community_fee_submissions_status_idx
  ON public.community_fee_submissions (review_status, created_at DESC);

CREATE INDEX IF NOT EXISTS community_fee_submissions_institution_idx
  ON public.community_fee_submissions (institution_id, created_at DESC);

COMMENT ON TABLE public.community_fee_submissions IS
  'Agentic public submission queue for fee observations awaiting review.';
COMMENT ON COLUMN public.community_fee_submissions.institution_id IS
  'Semantic institution/source identifier for the submitted fee observation.';

DO $$
BEGIN
  IF to_regclass('public.community_submissions') IS NOT NULL
     AND EXISTS (
       SELECT 1
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'community_submissions'
          AND column_name = 'crawl_target_id'
     ) THEN
    EXECUTE $backfill$
      INSERT INTO public.community_fee_submissions (
        institution_id,
        institution_name,
        fee_name,
        fee_category,
        amount,
        frequency,
        source_url,
        submitter_ip,
        review_status,
        created_at
      )
      SELECT
        crawl_target_id::bigint,
        institution_name,
        fee_name,
        fee_category,
        amount::numeric,
        frequency,
        source_url,
        submitter_ip,
        COALESCE(review_status, 'pending'),
        COALESCE(created_at::timestamptz, NOW())
      FROM public.community_submissions old
      WHERE NOT EXISTS (
        SELECT 1
          FROM public.community_fee_submissions current
         WHERE current.institution_name = old.institution_name
           AND current.fee_name = old.fee_name
           AND current.source_url = old.source_url
           AND current.created_at = old.created_at::timestamptz
      )
    $backfill$;
  END IF;
END $$;
