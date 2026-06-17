-- Reconcile the fee_snapshots readers with the snapshot writer.
--
-- The trend/history readers (agent_mcp.tools_read.get_fee_trend,
-- crawler-db/fees.ts getFeeHistory, workers/daily_report, workers/data_integrity)
-- all query a table named `fee_snapshots` (singular) that NO migration ever
-- created and nothing ever wrote — so every MoM/QoQ delta and price-history
-- sparkline was permanently null, and the daily integrity/report snapshot
-- checks always read zero.
--
-- The snapshot writer (commands/snapshot_fees._snapshot_institutions) populates
-- institution_fee_snapshots (per-institution per-fee amount over time), which is
-- exactly the shape the readers want. Expose it as a `fee_snapshots` view so the
-- readers work unchanged. snapshot_date is cast to text because get_fee_trend
-- does YYYY-MM-DD text arithmetic on it; fee_name/frequency are not stored at
-- snapshot time, so they surface as the canonical key / NULL.

CREATE OR REPLACE VIEW fee_snapshots AS
SELECT
    id,
    crawl_target_id,
    snapshot_date::text  AS snapshot_date,
    canonical_fee_key    AS fee_name,
    canonical_fee_key    AS fee_category,
    amount,
    NULL::text           AS frequency,
    review_status,
    created_at
FROM institution_fee_snapshots;

COMMENT ON VIEW fee_snapshots IS
    'Compat view over institution_fee_snapshots for the fee_snapshots readers '
    '(get_fee_trend, getFeeHistory, daily_report, data_integrity). The base '
    'table is written by the snapshot pipeline stage.';
