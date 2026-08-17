-- Magellan v1 bootstrap: rescue state columns, seed, agent registry.
BEGIN;

ALTER TABLE crawl_targets
  ADD COLUMN IF NOT EXISTS rescue_status TEXT
    CHECK (rescue_status IS NULL OR rescue_status IN (
      'pending','rescued','dead','needs_human','retry_after'
    )),
  ADD COLUMN IF NOT EXISTS last_rescue_attempt_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS crawl_targets_rescue_pending_idx
  ON crawl_targets (last_rescue_attempt_at NULLS FIRST)
  WHERE rescue_status IN ('pending', 'retry_after') OR rescue_status IS NULL;

-- Seed the 965 known-URL empty cohort to 'pending'.
UPDATE crawl_targets ct
SET rescue_status = 'pending'
WHERE ct.fee_schedule_url IS NOT NULL AND ct.fee_schedule_url != ''
  AND NOT EXISTS (
    SELECT 1 FROM extracted_fees ef
     WHERE ef.crawl_target_id = ct.id
       AND (ef.review_status IS NULL OR ef.review_status != 'rejected')
  )
  AND rescue_status IS NULL;

-- Register magellan agent.
INSERT INTO agent_registry (agent_name, display_name, description, role, parent_agent)
VALUES (
  'magellan',
  'Magellan',
  'Coverage rescue — 5-rung ladder on URLs where prior extraction yielded nothing.',
  'data',
  NULL
)
ON CONFLICT (agent_name) DO NOTHING;

UPDATE agent_registry
SET lifecycle_state = 'q2_high_confidence'
WHERE agent_name = 'magellan';

INSERT INTO agent_budgets (agent_name, budget_window, limit_cents)
VALUES ('magellan', 'per_batch', 5000)
ON CONFLICT (agent_name, budget_window) DO NOTHING;

COMMIT;
