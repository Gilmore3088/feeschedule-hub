-- Add raw reasoning text + R2 pointer to agent_events for post-hoc audit.
-- Previously we only stored a SHA256 hash; that's fine for integrity but
-- makes debugging impossible. Going forward we store both the hash AND
-- the raw text, plus an optional R2 key if the text exceeded 8KB.
BEGIN;

ALTER TABLE agent_events
  ADD COLUMN IF NOT EXISTS reasoning_prompt_text TEXT,
  ADD COLUMN IF NOT EXISTS reasoning_output_text TEXT,
  ADD COLUMN IF NOT EXISTS reasoning_r2_key      TEXT;

COMMENT ON COLUMN agent_events.reasoning_prompt_text IS 'Raw prompt text; inline if <8KB, otherwise NULL and payload lives in R2 at reasoning_r2_key.';
COMMENT ON COLUMN agent_events.reasoning_output_text IS 'Raw model output; inline if <8KB, otherwise NULL and payload lives in R2.';
COMMENT ON COLUMN agent_events.reasoning_r2_key IS 'R2 object key (bucket: bfi-reasoning) for oversized reasoning payloads.';

COMMIT;
