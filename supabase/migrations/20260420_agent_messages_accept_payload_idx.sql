-- Reliability backlog #8 (immediate-ask from agent-messages partitioning prep):
-- Add a partial expression index supporting the Tier-3 publish gate's
-- accept-message lookup.
--
-- Context: promote_to_tier3 (20260510_promote_to_tier3_tighten.sql) runs
--   SELECT EXISTS (SELECT 1 FROM agent_messages
--                   WHERE sender_agent = 'darwin'|'knox'
--                     AND intent = 'accept'
--                     AND payload->>'fee_verified_id' = $1::text)
-- with no supporting index on the payload expression. Today at ~648 rows
-- it's a free sequential scan; at 1M+ rows (projected within ~4 weeks of
-- weekly Darwin-drain going live) this becomes the slowest query in the
-- system and the Tier-3 publish gate becomes the bottleneck.
--
-- This index covers the expression + the intent='accept' filter via a
-- partial WHERE clause so it stays small (only accept messages are
-- indexed; challenge/prove/reject/etc. rows are ignored).
--
-- Column types (verified against 20260419_agent_messages.sql):
--   payload JSONB NOT NULL DEFAULT '{}'::jsonb
-- Because payload is already JSONB, `payload->>'fee_verified_id'` returns
-- TEXT directly — no explicit cast required in the index expression.
--
-- DOWN (manual reversal, if ever needed):
--   DROP INDEX IF EXISTS agent_messages_accept_fee_verified_idx;

CREATE INDEX IF NOT EXISTS agent_messages_accept_fee_verified_idx
    ON agent_messages ((payload->>'fee_verified_id'))
 WHERE intent = 'accept';

COMMENT ON INDEX agent_messages_accept_fee_verified_idx IS
    'Partial expression index for promote_to_tier3 handshake check. Covers the payload->>fee_verified_id lookup restricted to intent=accept rows. See docs/reliability/agent-messages-partitioning.md §3 and Appendix A.';
