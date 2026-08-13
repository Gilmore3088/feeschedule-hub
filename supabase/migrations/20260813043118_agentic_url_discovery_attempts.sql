-- Semantic storage for Magellan URL discovery attempts. The old discovery_cache
-- table, when present, is treated as backfill-only compatibility storage.

CREATE TABLE IF NOT EXISTS public.agent_url_discovery_attempts (
  institution_id BIGINT NOT NULL,
  discovery_method TEXT NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  result TEXT,
  found_url TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (institution_id, discovery_method)
);

ALTER TABLE public.agent_url_discovery_attempts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.agent_url_discovery_attempts FROM anon, authenticated;

CREATE INDEX IF NOT EXISTS agent_url_discovery_attempts_result_idx
  ON public.agent_url_discovery_attempts (result, attempted_at DESC);

COMMENT ON TABLE public.agent_url_discovery_attempts IS
  'Agentic Magellan URL discovery attempt ledger keyed by institution_id.';

DO $$
BEGIN
  IF to_regclass('public.discovery_cache') IS NOT NULL
     AND EXISTS (
       SELECT 1
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'discovery_cache'
          AND column_name = 'crawl_target_id'
     ) THEN
    EXECUTE $backfill$
      INSERT INTO public.agent_url_discovery_attempts (
        institution_id,
        discovery_method,
        attempted_at,
        result,
        found_url,
        error_message,
        created_at,
        updated_at
      )
      SELECT
        crawl_target_id::bigint,
        discovery_method,
        COALESCE(attempted_at::timestamptz, NOW()),
        result,
        found_url,
        error_message,
        COALESCE(attempted_at::timestamptz, NOW()),
        NOW()
      FROM public.discovery_cache
      ON CONFLICT (institution_id, discovery_method)
      DO UPDATE SET
        attempted_at = EXCLUDED.attempted_at,
        result = EXCLUDED.result,
        found_url = EXCLUDED.found_url,
        error_message = EXCLUDED.error_message,
        updated_at = NOW()
    $backfill$;
  END IF;
END $$;
