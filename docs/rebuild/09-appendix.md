# Appendix — Scripts, Schemas, and Reference

---

## Schema Migration Script

Run this against Supabase to create the full Postgres schema.

```sql
-- ─── CORE TABLES ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crawl_targets (
    id                  BIGSERIAL PRIMARY KEY,
    institution_name    TEXT        NOT NULL,
    website_url         TEXT,
    fee_schedule_url    TEXT,
    charter_type        TEXT        NOT NULL,  -- bank | credit_union
    state               TEXT,
    state_code          CHAR(2),
    city                TEXT,
    asset_size          BIGINT,
    cert_number         TEXT,
    source              TEXT        NOT NULL,  -- fdic | ncua
    status              TEXT        NOT NULL DEFAULT 'active',
    document_type       TEXT,
    last_content_hash   TEXT,
    last_crawl_at       TIMESTAMPTZ,
    last_success_at     TIMESTAMPTZ,
    fed_district        INT,
    asset_size_tier     TEXT,
    consecutive_failures INT        NOT NULL DEFAULT 0,
    failure_reason      TEXT,
    cms_platform        TEXT,
    cms_confidence      FLOAT,
    document_r2_key     TEXT,       -- R2 content-addressed storage key
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(source, cert_number)
);

CREATE TABLE IF NOT EXISTS crawl_runs (
    id                  BIGSERIAL PRIMARY KEY,
    trigger_type        TEXT        NOT NULL DEFAULT 'scheduled',
    status              TEXT        NOT NULL DEFAULT 'running',
    targets_total       INT         NOT NULL DEFAULT 0,
    targets_crawled     INT         NOT NULL DEFAULT 0,
    targets_succeeded   INT         NOT NULL DEFAULT 0,
    targets_failed      INT         NOT NULL DEFAULT 0,
    targets_unchanged   INT         NOT NULL DEFAULT 0,
    fees_extracted      INT         NOT NULL DEFAULT 0,
    started_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at        TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS crawl_results (
    id                  BIGSERIAL PRIMARY KEY,
    crawl_run_id        BIGINT      NOT NULL REFERENCES crawl_runs(id),
    crawl_target_id     BIGINT      NOT NULL REFERENCES crawl_targets(id),
    status              TEXT        NOT NULL,
    document_url        TEXT,
    document_path       TEXT,
    content_hash        TEXT,
    fees_extracted      INT         NOT NULL DEFAULT 0,
    error_message       TEXT,
    crawled_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS extracted_fees (
    id                      BIGSERIAL PRIMARY KEY,
    crawl_result_id         BIGINT      REFERENCES crawl_results(id),
    crawl_target_id         BIGINT      NOT NULL REFERENCES crawl_targets(id),
    fee_name                TEXT        NOT NULL,
    amount                  FLOAT,
    frequency               TEXT,
    conditions              TEXT,
    extraction_confidence   FLOAT       NOT NULL DEFAULT 0.0,
    review_status           TEXT        NOT NULL DEFAULT 'pending',
    validation_flags        JSONB,
    fee_family              TEXT,
    fee_category            TEXT,
    account_product_type    TEXT,
    extracted_by            TEXT,       -- 'llm' | 'banno_rule' | 'q2_rule' | etc.
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_review_status CHECK (
        review_status IN ('pending', 'staged', 'flagged', 'approved', 'rejected')
    )
);

CREATE TABLE IF NOT EXISTS users (
    id                  BIGSERIAL PRIMARY KEY,
    username            TEXT        NOT NULL UNIQUE,
    password_hash       TEXT        NOT NULL,
    display_name        TEXT        NOT NULL,
    role                TEXT        NOT NULL DEFAULT 'viewer',
    is_active           BOOLEAN     NOT NULL DEFAULT TRUE,
    email               TEXT,
    stripe_customer_id  TEXT,
    subscription_status TEXT        NOT NULL DEFAULT 'none',
    institution_name    TEXT,
    institution_type    TEXT,
    asset_tier          TEXT,
    state_code          CHAR(2),
    job_role            TEXT,
    interests           JSONB,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
    id          TEXT        PRIMARY KEY,
    user_id     BIGINT      NOT NULL REFERENCES users(id),
    expires_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fee_reviews (
    id              BIGSERIAL PRIMARY KEY,
    fee_id          BIGINT      NOT NULL REFERENCES extracted_fees(id),
    action          TEXT        NOT NULL,
    user_id         BIGINT      REFERENCES users(id),
    username        TEXT,
    previous_status TEXT,
    new_status      TEXT,
    previous_values JSONB,
    new_values      JSONB,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── NEW TABLES (not in SQLite) ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS jobs (
    id           BIGSERIAL   PRIMARY KEY,
    queue        TEXT        NOT NULL,
    entity_id    TEXT        NOT NULL,
    payload      JSONB,
    status       TEXT        NOT NULL DEFAULT 'pending',
    priority     INT         NOT NULL DEFAULT 0,
    attempts     INT         NOT NULL DEFAULT 0,
    max_attempts INT         NOT NULL DEFAULT 3,
    run_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    locked_by    TEXT,
    locked_at    TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    error        TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jobs_queue_pending
    ON jobs (queue, priority DESC, id ASC)
    WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS platform_registry (
    platform            TEXT        PRIMARY KEY,
    fee_paths           TEXT[],
    extraction_method   TEXT        NOT NULL DEFAULT 'llm',
    rule_enabled        BOOLEAN     NOT NULL DEFAULT FALSE,
    validated_count     INT         NOT NULL DEFAULT 0,
    success_rate        FLOAT,
    institution_count   INT,
    last_updated        TIMESTAMPTZ DEFAULT NOW()
);

-- Seed known platforms
INSERT INTO platform_registry (platform, fee_paths) VALUES
    ('banno',     ARRAY['/resources/fee-schedule', '/fee-schedule', '/personal/fee-schedule']),
    ('q2',        ARRAY['/fee-schedule', '/disclosures/fee-schedule', '/personal-banking/fees']),
    ('drupal',    ARRAY['/sites/default/files/fee-schedule.pdf', '/sites/default/files/fees.pdf']),
    ('wordpress', ARRAY['/wp-content/uploads/fee-schedule.pdf', '/wp-content/uploads/fees.pdf']),
    ('fiserv',    ARRAY['/fee-schedule', '/personal/fees', '/disclosures']),
    ('fis',       ARRAY['/digitalbanking/fees', '/personal-banking/fees']),
    ('ncr',       ARRAY['/d3banking/fees', '/ncr/fee-schedule'])
ON CONFLICT DO NOTHING;

-- ─── INDEXES ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_crawl_targets_state_tier
    ON crawl_targets (state_code, asset_size_tier);

CREATE INDEX IF NOT EXISTS idx_crawl_targets_platform
    ON crawl_targets (cms_platform);

CREATE INDEX IF NOT EXISTS idx_crawl_targets_fee_url
    ON crawl_targets (fee_schedule_url)
    WHERE fee_schedule_url IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_extracted_fees_target
    ON extracted_fees (crawl_target_id, review_status);

CREATE INDEX IF NOT EXISTS idx_extracted_fees_category
    ON extracted_fees (fee_category, review_status);

CREATE INDEX IF NOT EXISTS idx_crawl_results_target
    ON crawl_results (crawl_target_id, crawled_at DESC);
```

---

## Data Migration Script

```python
#!/usr/bin/env python3
"""
Migrate data from SQLite to Supabase Postgres.

Usage:
    SQLITE_PATH=data/crawler.db DATABASE_URL=postgresql://... python3 migrate_data.py

Run against a TEST Supabase project first.
"""

import asyncio
import json
import os
import sqlite3
from datetime import datetime

import asyncpg


SQLITE_PATH = os.environ.get('SQLITE_PATH', 'data/crawler.db')
DATABASE_URL = os.environ['DATABASE_URL']


def safe_ts(val):
    """Convert SQLite TEXT date to Postgres TIMESTAMPTZ."""
    if not val:
        return None
    try:
        # Handle various SQLite date formats
        for fmt in ['%Y-%m-%d %H:%M:%S', '%Y-%m-%dT%H:%M:%S', '%Y-%m-%d']:
            try:
                return datetime.strptime(val, fmt)
            except ValueError:
                continue
    except Exception:
        pass
    return None


def safe_json(val):
    """Convert TEXT JSON to dict/list for JSONB columns."""
    if not val:
        return None
    if isinstance(val, (dict, list)):
        return val
    try:
        return json.loads(val)
    except (json.JSONDecodeError, TypeError):
        return None


async def migrate_table(sq_conn, pg_conn, table: str, column_transforms: dict):
    """Generic table migrator."""
    cursor = sq_conn.cursor()
    cursor.execute(f"SELECT * FROM {table}")
    columns = [desc[0] for desc in cursor.description]
    rows = cursor.fetchall()

    if not rows:
        print(f"  {table}: 0 rows (skipping)")
        return 0

    print(f"  {table}: migrating {len(rows):,} rows...")

    for batch_start in range(0, len(rows), 500):
        batch = rows[batch_start:batch_start + 500]
        values = []
        for row in batch:
            row_dict = dict(zip(columns, row))
            transformed = {}
            for col, val in row_dict.items():
                transform = column_transforms.get(col)
                if transform == 'ts':
                    transformed[col] = safe_ts(val)
                elif transform == 'json':
                    transformed[col] = safe_json(val)
                elif transform == 'bool':
                    transformed[col] = bool(val) if val is not None else None
                else:
                    transformed[col] = val
            values.append(transformed)

        if values:
            cols = list(values[0].keys())
            placeholders = ', '.join(f'${i+1}' for i in range(len(cols)))
            col_names = ', '.join(cols)
            await pg_conn.executemany(
                f"INSERT INTO {table} ({col_names}) VALUES ({placeholders}) ON CONFLICT DO NOTHING",
                [tuple(v[c] for c in cols) for v in values]
            )

    print(f"  {table}: done")
    return len(rows)


async def main():
    sq = sqlite3.connect(SQLITE_PATH)
    sq.row_factory = sqlite3.Row
    pg = await asyncpg.connect(DATABASE_URL)

    print("Starting migration...")
    print(f"  Source: {SQLITE_PATH}")
    print(f"  Target: {DATABASE_URL[:50]}...")
    print()

    TS = 'ts'   # timestamp columns
    JS = 'json' # json columns
    B  = 'bool' # boolean columns

    tables = [
        ('users', {
            'created_at': TS, 'is_active': B, 'interests': JS,
        }),
        ('sessions', {
            'expires_at': TS, 'created_at': TS,
        }),
        ('crawl_targets', {
            'last_crawl_at': TS, 'last_success_at': TS, 'created_at': TS,
        }),
        ('crawl_runs', {
            'started_at': TS, 'completed_at': TS,
        }),
        ('crawl_results', {
            'crawled_at': TS,
        }),
        ('extracted_fees', {
            'created_at': TS, 'validation_flags': JS,
        }),
        ('fee_reviews', {
            'created_at': TS, 'previous_values': JS, 'new_values': JS,
        }),
        ('institution_financials', {
            'fetched_at': TS,
        }),
        ('institution_complaints', {
            'fetched_at': TS,
        }),
        ('analysis_results', {
            'computed_at': TS, 'result_json': JS,
        }),
        ('fee_snapshots', {
            'created_at': TS,
        }),
        ('fee_change_events', {
            'detected_at': TS,
        }),
        ('discovery_cache', {
            'attempted_at': TS,
        }),
        ('leads', {
            'created_at': TS,
        }),
        ('stripe_events', {
            'processed_at': TS, 'payload_json': JS,
        }),
        ('ops_jobs', {
            'started_at': TS, 'completed_at': TS, 'created_at': TS,
        }),
    ]

    total = 0
    for table_name, transforms in tables:
        try:
            n = await migrate_table(sq, pg, table_name, transforms)
            total += n
        except Exception as e:
            print(f"  ERROR migrating {table_name}: {e}")

    print()
    print(f"Migration complete. Total rows migrated: {total:,}")

    # Validation
    print()
    print("Validation:")
    for table_name, _ in tables:
        sq_count = sq.execute(f"SELECT COUNT(*) FROM {table_name}").fetchone()[0]
        pg_count = await pg.fetchval(f"SELECT COUNT(*) FROM {table_name}")
        match = "✅" if sq_count == pg_count else "❌"
        print(f"  {match} {table_name}: SQLite={sq_count:,}, Postgres={pg_count:,}")

    await pg.close()
    sq.close()


if __name__ == '__main__':
    asyncio.run(main())
```

---

## Useful Monitoring Queries

Run these in Supabase SQL editor to monitor progress:

```sql
-- ── Coverage Funnel ──────────────────────────────────────────────────────────
SELECT
    COUNT(*)                                                        AS total_institutions,
    COUNT(website_url)                                              AS has_website_url,
    COUNT(fee_schedule_url)                                         AS has_fee_url,
    (SELECT COUNT(DISTINCT crawl_target_id) FROM extracted_fees)    AS has_fees,
    (SELECT COUNT(DISTINCT crawl_target_id) FROM extracted_fees
     WHERE review_status = 'approved')                              AS has_approved_fees,
    ROUND(100.0 * COUNT(fee_schedule_url) / COUNT(*), 1)            AS fee_url_pct,
    ROUND(100.0 * (SELECT COUNT(DISTINCT crawl_target_id) FROM extracted_fees) / COUNT(*), 1) AS coverage_pct
FROM crawl_targets;

-- ── Coverage by Asset Tier ───────────────────────────────────────────────────
SELECT
    ct.asset_size_tier,
    COUNT(*)                                                AS total,
    COUNT(DISTINCT ef.crawl_target_id)                     AS with_fees,
    ROUND(100.0 * COUNT(DISTINCT ef.crawl_target_id) / COUNT(*), 1) AS coverage_pct
FROM crawl_targets ct
LEFT JOIN extracted_fees ef ON ef.crawl_target_id = ct.id
WHERE ct.asset_size_tier IS NOT NULL
GROUP BY ct.asset_size_tier
ORDER BY MIN(ct.asset_size) DESC NULLS LAST;

-- ── Coverage by State ────────────────────────────────────────────────────────
SELECT
    ct.state_code,
    COUNT(*)                                                AS total,
    COUNT(DISTINCT ef.crawl_target_id)                     AS with_fees,
    ROUND(100.0 * COUNT(DISTINCT ef.crawl_target_id) / COUNT(*), 1) AS pct
FROM crawl_targets ct
LEFT JOIN extracted_fees ef ON ef.crawl_target_id = ct.id
WHERE ct.state_code IS NOT NULL
GROUP BY ct.state_code
ORDER BY pct DESC;

-- ── Job Queue Status ─────────────────────────────────────────────────────────
SELECT
    queue,
    status,
    COUNT(*)    AS jobs,
    MAX(created_at) AS latest
FROM jobs
GROUP BY queue, status
ORDER BY queue, status;

-- ── Platform Distribution ────────────────────────────────────────────────────
SELECT
    cms_platform,
    COUNT(*)    AS institutions,
    COUNT(fee_schedule_url) AS with_fee_url,
    ROUND(100.0 * COUNT(fee_schedule_url) / COUNT(*), 1) AS discovery_rate
FROM crawl_targets
WHERE cms_platform IS NOT NULL
GROUP BY cms_platform
ORDER BY institutions DESC;

-- ── Extraction Method Distribution ──────────────────────────────────────────
SELECT
    COALESCE(extracted_by, 'unknown') AS method,
    COUNT(*)    AS fees,
    COUNT(DISTINCT crawl_target_id) AS institutions
FROM extracted_fees
GROUP BY extracted_by
ORDER BY fees DESC;

-- ── Failure Reasons ──────────────────────────────────────────────────────────
SELECT
    COALESCE(failure_reason, 'none')    AS reason,
    COUNT(*)                            AS institutions
FROM crawl_targets
GROUP BY failure_reason
ORDER BY institutions DESC;

-- ── Recent LLM Batch Cost Estimate ──────────────────────────────────────────
SELECT
    DATE(created_at)        AS date,
    COUNT(*)                AS institutions_processed,
    ROUND(COUNT(*) * 0.002, 2) AS estimated_cost_usd
FROM extracted_fees
WHERE extracted_by = 'llm'
  AND created_at > NOW() - INTERVAL '14 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

---

## Environment Variable Reference

### Vercel (Next.js)

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | Supabase Postgres connection string |
| `SUPABASE_URL` | ✅ | `https://[ref].supabase.co` |
| `SUPABASE_ANON_KEY` | ✅ | Public anon key (safe for client-side) |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Service role key (server-side only) |
| `ANTHROPIC_API_KEY` | ✅ | For research agent in admin hub |
| `BFI_COOKIE_SECRET` | ✅ | HMAC secret for session signing |
| `STRIPE_SECRET_KEY` | ✅ | Stripe API key |
| `STRIPE_WEBHOOK_SECRET` | ✅ | Webhook signing secret |
| `BFI_APP_URL` | ✅ | `https://feeinsight.com` |
| `BFI_REVALIDATE_TOKEN` | ✅ | Cache revalidation token |
| `COMING_SOON` | Optional | `"true"` to show coming soon page |

### Modal (Python workers)

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | Supabase Postgres connection string |
| `ANTHROPIC_API_KEY` | ✅ | For LLM extraction |
| `R2_ENDPOINT` | ✅ | Cloudflare R2 endpoint URL |
| `R2_ACCESS_KEY_ID` | ✅ | R2 API token access key |
| `R2_SECRET_ACCESS_KEY` | ✅ | R2 API token secret |
| `R2_BUCKET` | ✅ | `bank-fee-index-documents` |

### Local Development (`.env`)

```bash
DATABASE_URL=postgresql://postgres:[password]@[host]:5432/postgres
SUPABASE_URL=https://[ref].supabase.co
SUPABASE_ANON_KEY=[key]
SUPABASE_SERVICE_ROLE_KEY=[key]
ANTHROPIC_API_KEY=sk-ant-...
BFI_COOKIE_SECRET=dev-secret-change-in-production
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
BFI_APP_URL=http://localhost:3000
BFI_REVALIDATE_TOKEN=dev-token
R2_ENDPOINT=https://[id].r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=[key]
R2_SECRET_ACCESS_KEY=[secret]
R2_BUCKET=bank-fee-index-documents
```
