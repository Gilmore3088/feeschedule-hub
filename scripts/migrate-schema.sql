-- Bank Fee Index: SQLite -> Postgres schema migration
-- Generated 2026-03-22 from actual SQLite schema
-- Run against Supabase with: node scripts/run-sql.js scripts/migrate-schema.sql

-- ── CORE TABLES ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crawl_targets (
    id                      BIGSERIAL PRIMARY KEY,
    institution_name        TEXT        NOT NULL,
    website_url             TEXT,
    fee_schedule_url        TEXT,
    charter_type            TEXT        NOT NULL,
    state                   TEXT,
    state_code              CHAR(2),
    city                    TEXT,
    asset_size              BIGINT,
    cert_number             TEXT,
    source                  TEXT        NOT NULL,
    status                  TEXT        NOT NULL DEFAULT 'active',
    document_type           TEXT,
    last_content_hash       TEXT,
    last_crawl_at           TIMESTAMPTZ,
    last_success_at         TIMESTAMPTZ,
    consecutive_failures    INT         NOT NULL DEFAULT 0,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    fed_district            INT,
    asset_size_tier         TEXT,
    cbsa_code               TEXT,
    cbsa_name               TEXT,
    urban_rural             TEXT,
    established_date        TEXT,
    specialty               TEXT,
    failure_reason          TEXT,
    failure_reason_note     TEXT,
    failure_reason_updated_at TIMESTAMPTZ,
    cms_platform            TEXT,
    cms_confidence          FLOAT,
    document_r2_key         TEXT,
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
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    validation_flags        JSONB,
    fee_family              TEXT,
    fee_category            TEXT,
    account_product_type    TEXT,
    source                  TEXT        DEFAULT 'crawler',
    extracted_by            TEXT
);

CREATE TABLE IF NOT EXISTS users (
    id                  BIGSERIAL PRIMARY KEY,
    username            TEXT        NOT NULL UNIQUE,
    password_hash       TEXT        NOT NULL,
    display_name        TEXT        NOT NULL,
    role                TEXT        NOT NULL DEFAULT 'viewer',
    is_active           BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    email               TEXT,
    stripe_customer_id  TEXT,
    subscription_status TEXT        DEFAULT 'none',
    institution_name    TEXT,
    institution_type    TEXT,
    asset_tier          TEXT,
    state_code          CHAR(2),
    job_role            TEXT,
    interests           JSONB
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

CREATE TABLE IF NOT EXISTS analysis_results (
    id              BIGSERIAL PRIMARY KEY,
    crawl_target_id BIGINT      NOT NULL REFERENCES crawl_targets(id),
    analysis_type   TEXT        NOT NULL,
    result_json     JSONB       NOT NULL,
    computed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(crawl_target_id, analysis_type)
);

CREATE TABLE IF NOT EXISTS institution_financials (
    id                      BIGSERIAL PRIMARY KEY,
    crawl_target_id         BIGINT      NOT NULL REFERENCES crawl_targets(id),
    report_date             TEXT        NOT NULL,
    source                  TEXT        NOT NULL,
    total_assets            BIGINT,
    total_deposits          BIGINT,
    total_loans             BIGINT,
    service_charge_income   BIGINT,
    other_noninterest_income BIGINT,
    net_interest_margin     FLOAT,
    efficiency_ratio        FLOAT,
    roa                     FLOAT,
    roe                     FLOAT,
    tier1_capital_ratio     FLOAT,
    branch_count            INT,
    employee_count          INT,
    member_count            INT,
    raw_json                JSONB,
    fetched_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    total_revenue           BIGINT,
    fee_income_ratio        FLOAT,
    UNIQUE(crawl_target_id, report_date, source)
);

CREATE TABLE IF NOT EXISTS institution_complaints (
    id              BIGSERIAL PRIMARY KEY,
    crawl_target_id BIGINT      NOT NULL REFERENCES crawl_targets(id),
    report_period   TEXT        NOT NULL,
    product         TEXT        NOT NULL,
    issue           TEXT,
    complaint_count INT         NOT NULL,
    fetched_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(crawl_target_id, report_period, product, issue)
);

CREATE TABLE IF NOT EXISTS fee_snapshots (
    id                      BIGSERIAL PRIMARY KEY,
    crawl_target_id         BIGINT      NOT NULL REFERENCES crawl_targets(id),
    crawl_result_id         BIGINT      REFERENCES crawl_results(id),
    snapshot_date           TEXT        NOT NULL,
    fee_name                TEXT        NOT NULL,
    fee_category            TEXT,
    amount                  FLOAT,
    frequency               TEXT,
    conditions              TEXT,
    account_product_type    TEXT,
    extraction_confidence   FLOAT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(crawl_target_id, snapshot_date, fee_category)
);

CREATE TABLE IF NOT EXISTS fee_change_events (
    id              BIGSERIAL PRIMARY KEY,
    crawl_target_id BIGINT      NOT NULL REFERENCES crawl_targets(id),
    fee_category    TEXT        NOT NULL,
    previous_amount FLOAT,
    new_amount      FLOAT,
    change_type     TEXT        NOT NULL,
    detected_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS discovery_cache (
    id                  BIGSERIAL PRIMARY KEY,
    crawl_target_id     BIGINT      NOT NULL REFERENCES crawl_targets(id),
    discovery_method    TEXT        NOT NULL,
    attempted_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    result              TEXT        NOT NULL,
    found_url           TEXT,
    error_message       TEXT,
    UNIQUE(crawl_target_id, discovery_method)
);

CREATE TABLE IF NOT EXISTS leads (
    id          BIGSERIAL PRIMARY KEY,
    name        TEXT        NOT NULL,
    email       TEXT        NOT NULL,
    company     TEXT,
    role        TEXT,
    use_case    TEXT,
    source      TEXT        NOT NULL DEFAULT 'coming_soon',
    status      TEXT        NOT NULL DEFAULT 'new',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS saved_peer_sets (
    id              BIGSERIAL PRIMARY KEY,
    name            TEXT        NOT NULL,
    tiers           TEXT,
    districts       TEXT,
    charter_type    TEXT,
    created_by      TEXT        NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── FED DISTRICT TABLES ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fed_beige_book (
    id              BIGSERIAL PRIMARY KEY,
    release_date    TEXT        NOT NULL,
    release_code    TEXT        NOT NULL,
    fed_district    INT,
    section_name    TEXT        NOT NULL,
    content_text    TEXT        NOT NULL,
    source_url      TEXT        NOT NULL,
    fetched_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(release_code, fed_district, section_name)
);

CREATE TABLE IF NOT EXISTS fed_content (
    id              BIGSERIAL PRIMARY KEY,
    content_type    TEXT        NOT NULL,
    title           TEXT        NOT NULL,
    speaker         TEXT,
    fed_district    INT,
    source_url      TEXT        NOT NULL UNIQUE,
    published_at    TEXT        NOT NULL,
    description     TEXT,
    source_feed     TEXT,
    fetched_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fed_economic_indicators (
    id                  BIGSERIAL PRIMARY KEY,
    series_id           TEXT        NOT NULL,
    series_title        TEXT,
    fed_district        INT,
    observation_date    TEXT        NOT NULL,
    value               FLOAT,
    units               TEXT,
    frequency           TEXT,
    fetched_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(series_id, observation_date)
);

-- ── ARTICLES ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS articles (
    id                  BIGSERIAL PRIMARY KEY,
    slug                TEXT        UNIQUE NOT NULL,
    title               TEXT        NOT NULL,
    article_type        TEXT        NOT NULL,
    fee_category        TEXT,
    fed_district        INT,
    status              TEXT        NOT NULL DEFAULT 'draft',
    review_tier         INT         NOT NULL DEFAULT 2,
    content_md          TEXT        NOT NULL,
    data_context        TEXT        NOT NULL,
    summary             TEXT,
    model_id            TEXT,
    prompt_hash         TEXT,
    generated_at        TEXT        NOT NULL,
    reviewed_by         TEXT,
    reviewed_at         TEXT,
    published_at        TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    word_count          INT,
    reading_time_min    INT,
    data_snapshot_date  TEXT,
    quality_gate_results TEXT
);

CREATE TABLE IF NOT EXISTS research_articles (
    id              BIGSERIAL PRIMARY KEY,
    slug            TEXT        UNIQUE NOT NULL,
    title           TEXT        NOT NULL,
    subtitle        TEXT,
    content         TEXT        NOT NULL DEFAULT '',
    category        TEXT        NOT NULL DEFAULT 'analysis',
    tags            TEXT,
    author          TEXT        DEFAULT 'Bank Fee Index',
    status          TEXT        NOT NULL DEFAULT 'draft',
    generated_by    TEXT,
    conversation_id INT,
    published_at    TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    view_count      INT         NOT NULL DEFAULT 0
);

-- ── ORGANIZATION / BILLING ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS organizations (
    id                  BIGSERIAL PRIMARY KEY,
    name                TEXT        NOT NULL,
    slug                TEXT        UNIQUE NOT NULL,
    charter_type        TEXT,
    asset_tier          TEXT,
    cert_number         TEXT,
    stripe_customer_id  TEXT        UNIQUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subscriptions (
    id                      BIGSERIAL PRIMARY KEY,
    organization_id         BIGINT      NOT NULL REFERENCES organizations(id),
    stripe_subscription_id  TEXT        UNIQUE NOT NULL,
    plan                    TEXT        NOT NULL DEFAULT 'starter',
    status                  TEXT        NOT NULL DEFAULT 'active',
    current_period_start    TEXT        NOT NULL,
    current_period_end      TEXT        NOT NULL,
    cancel_at_period_end    BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS org_members (
    id              BIGSERIAL PRIMARY KEY,
    organization_id BIGINT      NOT NULL REFERENCES organizations(id),
    email           TEXT        NOT NULL,
    password_hash   TEXT        NOT NULL,
    name            TEXT,
    role            TEXT        NOT NULL DEFAULT 'member',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(organization_id, email)
);

CREATE TABLE IF NOT EXISTS api_keys (
    id              BIGSERIAL PRIMARY KEY,
    organization_id BIGINT      NOT NULL REFERENCES organizations(id),
    key_hash        TEXT        NOT NULL UNIQUE,
    key_prefix      TEXT        NOT NULL,
    name            TEXT        NOT NULL DEFAULT 'Default',
    last_used_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stripe_events (
    id              BIGSERIAL PRIMARY KEY,
    stripe_event_id TEXT        UNIQUE NOT NULL,
    event_type      TEXT        NOT NULL,
    processed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS usage_events (
    id              BIGSERIAL PRIMARY KEY,
    organization_id BIGINT,
    anonymous_id    TEXT,
    event_type      TEXT        NOT NULL,
    metadata        JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alert_preferences (
    id              BIGSERIAL PRIMARY KEY,
    organization_id BIGINT      NOT NULL REFERENCES organizations(id),
    categories      TEXT,
    peer_group_id   INT,
    frequency       TEXT        NOT NULL DEFAULT 'weekly',
    enabled         BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(organization_id)
);

CREATE TABLE IF NOT EXISTS saved_subscriber_peer_groups (
    id              BIGSERIAL PRIMARY KEY,
    organization_id BIGINT      NOT NULL REFERENCES organizations(id),
    name            TEXT        NOT NULL,
    charter_types   TEXT,
    asset_tiers     TEXT,
    districts       TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── OPERATIONS ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crawl_target_changes (
    id              BIGSERIAL PRIMARY KEY,
    crawl_target_id BIGINT      NOT NULL REFERENCES crawl_targets(id),
    field           TEXT        NOT NULL,
    old_value       TEXT,
    new_value       TEXT,
    user_id         BIGINT      REFERENCES users(id),
    note            TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS upload_jobs (
    id              BIGSERIAL PRIMARY KEY,
    crawl_target_id BIGINT      NOT NULL REFERENCES crawl_targets(id),
    user_id         BIGINT      REFERENCES users(id),
    file_path       TEXT        NOT NULL,
    file_name       TEXT,
    status          TEXT        NOT NULL DEFAULT 'queued',
    fee_count       INT,
    error_message   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at    TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS community_submissions (
    id              BIGSERIAL PRIMARY KEY,
    crawl_target_id BIGINT      REFERENCES crawl_targets(id),
    institution_name TEXT       NOT NULL,
    fee_name        TEXT        NOT NULL,
    fee_category    TEXT,
    amount          FLOAT,
    frequency       TEXT,
    source_url      TEXT        NOT NULL,
    submitter_ip    TEXT,
    review_status   TEXT        NOT NULL DEFAULT 'pending',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ops_jobs (
    id              BIGSERIAL PRIMARY KEY,
    command         TEXT        NOT NULL,
    params_json     JSONB       NOT NULL DEFAULT '{}',
    status          TEXT        NOT NULL DEFAULT 'queued',
    triggered_by    TEXT        NOT NULL,
    target_id       BIGINT,
    crawl_run_id    BIGINT,
    pid             INT,
    log_path        TEXT,
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    exit_code       INT,
    stdout_tail     TEXT,
    error_summary   TEXT,
    result_summary  TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pipeline_runs (
    id                      BIGSERIAL PRIMARY KEY,
    status                  TEXT        NOT NULL DEFAULT 'running',
    last_completed_phase    INT         DEFAULT 0,
    last_completed_job      TEXT,
    config_json             JSONB,
    started_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at            TIMESTAMPTZ,
    error_msg               TEXT,
    inst_count              INT,
    summary_json            JSONB
);

-- ── RESEARCH ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS research_conversations (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT      NOT NULL,
    agent_id    TEXT        NOT NULL,
    title       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS research_messages (
    id              BIGSERIAL PRIMARY KEY,
    conversation_id BIGINT      NOT NULL REFERENCES research_conversations(id) ON DELETE CASCADE,
    role            TEXT        NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
    content         TEXT        NOT NULL,
    tool_calls      TEXT,
    token_count     INT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS research_usage (
    id                  BIGSERIAL PRIMARY KEY,
    user_id             BIGINT,
    ip_address          TEXT,
    agent_id            TEXT        NOT NULL,
    input_tokens        INT         NOT NULL DEFAULT 0,
    output_tokens       INT         NOT NULL DEFAULT 0,
    estimated_cost_cents INT        NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── GEOGRAPHIC / MARKET ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS branch_deposits (
    id              BIGSERIAL PRIMARY KEY,
    cert            INT         NOT NULL,
    crawl_target_id BIGINT      REFERENCES crawl_targets(id),
    year            INT         NOT NULL,
    branch_number   INT         NOT NULL,
    is_main_office  BOOLEAN     NOT NULL DEFAULT FALSE,
    deposits        BIGINT,
    state           TEXT,
    city            TEXT,
    county_fips     INT,
    msa_code        INT,
    msa_name        TEXT,
    fed_district    INT,
    latitude        FLOAT,
    longitude       FLOAT,
    fetched_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(cert, year, branch_number)
);

CREATE TABLE IF NOT EXISTS market_concentration (
    id                  BIGSERIAL PRIMARY KEY,
    year                INT         NOT NULL,
    msa_code            INT         NOT NULL,
    msa_name            TEXT,
    total_deposits      BIGINT,
    institution_count   INT,
    hhi                 INT,
    top3_share          FLOAT,
    computed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(year, msa_code)
);

CREATE TABLE IF NOT EXISTS demographics (
    id                      BIGSERIAL PRIMARY KEY,
    geo_id                  TEXT        NOT NULL,
    geo_type                TEXT        NOT NULL,
    geo_name                TEXT,
    state_fips              TEXT,
    county_fips             TEXT,
    median_household_income INT,
    poverty_count           INT,
    total_population        INT,
    year                    INT         NOT NULL,
    fetched_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(geo_id, geo_type, year)
);

CREATE TABLE IF NOT EXISTS census_tracts (
    id                      BIGSERIAL PRIMARY KEY,
    tract_id                TEXT        NOT NULL,
    state_fips              TEXT        NOT NULL,
    county_fips             TEXT        NOT NULL,
    msa_code                TEXT,
    income_level            TEXT,
    median_family_income    INT,
    tract_median_income     INT,
    income_ratio            FLOAT,
    population              INT,
    minority_pct            FLOAT,
    year                    INT         NOT NULL,
    fetched_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tract_id, year)
);

-- ── CACHING ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS coverage_snapshots (
    id                  BIGSERIAL PRIMARY KEY,
    snapshot_date       TEXT        NOT NULL,
    total_institutions  INT         NOT NULL,
    with_fee_url        INT         NOT NULL,
    with_fees           INT         NOT NULL,
    with_approved       INT         NOT NULL,
    total_fees          INT         NOT NULL,
    approved_fees       INT         NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(snapshot_date)
);

CREATE TABLE IF NOT EXISTS fee_index_cache (
    fee_category        TEXT        PRIMARY KEY,
    fee_family          TEXT,
    median_amount       FLOAT,
    p25_amount          FLOAT,
    p75_amount          FLOAT,
    min_amount          FLOAT,
    max_amount          FLOAT,
    institution_count   INT         NOT NULL DEFAULT 0,
    observation_count   INT         NOT NULL DEFAULT 0,
    approved_count      INT         NOT NULL DEFAULT 0,
    bank_count          INT         NOT NULL DEFAULT 0,
    cu_count            INT         NOT NULL DEFAULT 0,
    maturity_tier       TEXT        NOT NULL DEFAULT 'insufficient',
    computed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reg_articles (
    guid            TEXT        PRIMARY KEY,
    source          TEXT        NOT NULL,
    title           TEXT        NOT NULL,
    link            TEXT        NOT NULL,
    topic           TEXT        NOT NULL DEFAULT 'general',
    published_at    TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── NEW TABLES (not in SQLite) ──────────────────────────────────────────────

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

-- ── INDEXES ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_crawl_targets_state_tier ON crawl_targets(state_code, asset_size_tier);
CREATE INDEX IF NOT EXISTS idx_crawl_targets_platform ON crawl_targets(cms_platform);
CREATE INDEX IF NOT EXISTS idx_crawl_targets_fee_url ON crawl_targets(fee_schedule_url) WHERE fee_schedule_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crawl_targets_charter_tier ON crawl_targets(charter_type, asset_size_tier);
CREATE INDEX IF NOT EXISTS idx_crawl_targets_failure ON crawl_targets(failure_reason) WHERE failure_reason IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crawl_targets_with_fees ON crawl_targets(charter_type, asset_size_tier, fed_district, state_code) WHERE fee_schedule_url IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_extracted_fees_target ON extracted_fees(crawl_target_id, review_status);
CREATE INDEX IF NOT EXISTS idx_extracted_fees_category ON extracted_fees(fee_category, review_status);
CREATE INDEX IF NOT EXISTS idx_extracted_fees_review ON extracted_fees(review_status);
CREATE INDEX IF NOT EXISTS idx_extracted_fees_cat_amt ON extracted_fees(fee_category, amount, crawl_target_id) WHERE review_status != 'rejected' AND fee_category IS NOT NULL AND amount IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_extracted_fees_target_status ON extracted_fees(crawl_target_id, review_status, fee_category, amount);
CREATE INDEX IF NOT EXISTS idx_extracted_fees_review_queue ON extracted_fees(review_status, created_at) WHERE review_status IN ('pending', 'staged', 'flagged');
CREATE INDEX IF NOT EXISTS idx_extracted_fees_crawl_result ON extracted_fees(crawl_result_id);

CREATE INDEX IF NOT EXISTS idx_crawl_results_target ON crawl_results(crawl_target_id, crawled_at DESC);
CREATE INDEX IF NOT EXISTS idx_crawl_results_date ON crawl_results(crawled_at DESC, crawl_target_id);

CREATE INDEX IF NOT EXISTS idx_fee_reviews_date ON fee_reviews(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analysis_target_type ON analysis_results(crawl_target_id, analysis_type);

CREATE INDEX IF NOT EXISTS idx_financials_target_date ON institution_financials(crawl_target_id, report_date);
CREATE INDEX IF NOT EXISTS idx_financials_date_source ON institution_financials(report_date, source);
CREATE INDEX IF NOT EXISTS idx_complaints_target ON institution_complaints(crawl_target_id);

CREATE INDEX IF NOT EXISTS idx_snapshots_target_cat ON fee_snapshots(crawl_target_id, fee_category);
CREATE INDEX IF NOT EXISTS idx_fce_date_category ON fee_change_events(detected_at DESC, fee_category);
CREATE INDEX IF NOT EXISTS idx_discovery_cache_target ON discovery_cache(crawl_target_id);

CREATE INDEX IF NOT EXISTS idx_beige_book_district ON fed_beige_book(fed_district, release_date);
CREATE INDEX IF NOT EXISTS idx_fed_content_district ON fed_content(fed_district, published_at);
CREATE INDEX IF NOT EXISTS idx_fed_content_type ON fed_content(content_type);
CREATE INDEX IF NOT EXISTS idx_fed_indicators_series ON fed_economic_indicators(series_id, observation_date);

CREATE INDEX IF NOT EXISTS idx_articles_status ON articles(status);
CREATE INDEX IF NOT EXISTS idx_articles_type ON articles(article_type, fee_category);
CREATE INDEX IF NOT EXISTS idx_articles_published ON articles(published_at);
CREATE INDEX IF NOT EXISTS idx_articles_slug ON articles(slug);

CREATE INDEX IF NOT EXISTS idx_research_articles_status ON research_articles(status);
CREATE INDEX IF NOT EXISTS idx_research_articles_slug ON research_articles(slug);
CREATE INDEX IF NOT EXISTS idx_research_conv_user ON research_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_research_msg_conv ON research_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_research_usage_user_date ON research_usage(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_research_usage_ip_date ON research_usage(ip_address, created_at);

CREATE INDEX IF NOT EXISTS idx_branch_deposits_cert ON branch_deposits(cert, year);
CREATE INDEX IF NOT EXISTS idx_branch_deposits_msa ON branch_deposits(msa_code, year);
CREATE INDEX IF NOT EXISTS idx_market_concentration_msa ON market_concentration(msa_code, year);
CREATE INDEX IF NOT EXISTS idx_demographics_geo ON demographics(geo_type, state_fips, year);
CREATE INDEX IF NOT EXISTS idx_census_tracts_state ON census_tracts(state_fips, year);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_stripe_customer ON users(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_org_members_email ON org_members(email);
CREATE INDEX IF NOT EXISTS idx_stripe_events_type ON stripe_events(event_type);
CREATE INDEX IF NOT EXISTS idx_usage_org_type ON usage_events(organization_id, event_type, created_at);
CREATE INDEX IF NOT EXISTS idx_usage_anon ON usage_events(anonymous_id, event_type, created_at);
CREATE INDEX IF NOT EXISTS idx_sub_peer_groups_org ON saved_subscriber_peer_groups(organization_id);
CREATE INDEX IF NOT EXISTS idx_target_changes_target ON crawl_target_changes(crawl_target_id);
CREATE INDEX IF NOT EXISTS idx_ops_jobs_status ON ops_jobs(status);
CREATE INDEX IF NOT EXISTS idx_ops_jobs_created ON ops_jobs(created_at);
CREATE INDEX IF NOT EXISTS idx_reg_articles_published ON reg_articles(published_at DESC);

CREATE INDEX IF NOT EXISTS idx_jobs_queue_pending ON jobs(queue, priority DESC, id ASC) WHERE status = 'pending';

-- ── SEED DATA ───────────────────────────────────────────────────────────────

INSERT INTO platform_registry (platform, fee_paths) VALUES
    ('banno',     ARRAY['/resources/fee-schedule', '/fee-schedule', '/personal/fee-schedule']),
    ('q2',        ARRAY['/fee-schedule', '/disclosures/fee-schedule', '/personal-banking/fees']),
    ('drupal',    ARRAY['/sites/default/files/fee-schedule.pdf', '/sites/default/files/fees.pdf']),
    ('wordpress', ARRAY['/wp-content/uploads/fee-schedule.pdf', '/wp-content/uploads/fees.pdf']),
    ('fiserv',    ARRAY['/fee-schedule', '/personal/fees', '/disclosures']),
    ('fis',       ARRAY['/digitalbanking/fees', '/personal-banking/fees']),
    ('ncr',       ARRAY['/d3banking/fees', '/ncr/fee-schedule'])
ON CONFLICT DO NOTHING;
