-- Code-review NIT-3: knox_overrides_rejection_msg_idx is redundant with
-- knox_overrides_rejection_msg_unique (both cover the same column; the
-- unique one is always preferred by the planner for equality lookups).
-- Drop the non-unique duplicate to save ~1 index write per insert and
-- a touch of shared_buffers.
--
-- Safe: the unique index survives and continues to enforce "one override
-- per rejection_msg_id" + serve the rejection_msg_id → knox_overrides
-- lookup used by the admin review UI.
--
-- DOWN (if needed):
--   CREATE INDEX knox_overrides_rejection_msg_idx
--       ON knox_overrides (rejection_msg_id);

DROP INDEX IF EXISTS knox_overrides_rejection_msg_idx;
