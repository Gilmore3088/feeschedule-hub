-- Phase 56: Quarterly snapshot tables for QoQ delta detection (D-08)

-- Category-level snapshots: national fee index at a point in time
CREATE TABLE IF NOT EXISTS fee_index_snapshots (
    id SERIAL PRIMARY KEY,
    snapshot_date DATE NOT NULL,
    fee_category TEXT NOT NULL,
    canonical_fee_key TEXT,
    median_amount NUMERIC(10,2),
    p25_amount NUMERIC(10,2),
    p75_amount NUMERIC(10,2),
    institution_count INTEGER NOT NULL DEFAULT 0,
    fee_count INTEGER NOT NULL DEFAULT 0,
    charter TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique constraint handling NULL charter via COALESCE
-- (Postgres treats two NULLs as distinct in UNIQUE constraints)
CREATE UNIQUE INDEX IF NOT EXISTS idx_fee_index_snapshots_unique
    ON fee_index_snapshots(snapshot_date, fee_category, COALESCE(charter, ''));

CREATE INDEX IF NOT EXISTS idx_fee_index_snapshots_date
    ON fee_index_snapshots(snapshot_date);

-- Institution-level snapshots: per-bank fee state at a point in time
CREATE TABLE IF NOT EXISTS institution_fee_snapshots (
    id SERIAL PRIMARY KEY,
    snapshot_date DATE NOT NULL,
    crawl_target_id INTEGER NOT NULL,
    canonical_fee_key TEXT NOT NULL,
    amount NUMERIC(10,2),
    review_status TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_inst_fee_snapshots_unique
    ON institution_fee_snapshots(snapshot_date, crawl_target_id, canonical_fee_key);

CREATE INDEX IF NOT EXISTS idx_inst_fee_snapshots_date
    ON institution_fee_snapshots(snapshot_date);

CREATE INDEX IF NOT EXISTS idx_inst_fee_snapshots_target
    ON institution_fee_snapshots(crawl_target_id);
