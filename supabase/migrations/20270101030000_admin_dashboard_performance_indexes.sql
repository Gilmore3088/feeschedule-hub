-- Speed up the authenticated Atlas admin landing page.
-- These are additive read-path indexes for dashboard summaries and review badges.

SET lock_timeout = '5s';
SET statement_timeout = '60s';

CREATE INDEX IF NOT EXISTS published_fee_records_live_institution_idx
  ON public.published_fee_records (institution_id)
  WHERE rolled_back_at IS NULL;

CREATE INDEX IF NOT EXISTS agent_messages_knox_reject_created_idx
  ON public.agent_messages (created_at DESC, message_id)
  WHERE sender_agent = 'knox'
    AND intent = 'reject';

CREATE INDEX IF NOT EXISTS institution_sources_admin_eligible_idx
  ON public.institution_sources (id)
  INCLUDE (fee_schedule_url)
  WHERE status = 'active'
    AND COALESCE(document_type, '') NOT IN ('offline', 'no_website');
