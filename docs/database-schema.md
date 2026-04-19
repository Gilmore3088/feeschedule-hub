# Bank Fee Index — Database Schema

**Generated:** 2026-04-19 19:40 UTC (live introspection via `scripts/generate-schema-doc.py`)
**Schema:** `public` · **Tables:** 90

This doc is auto-generated from the live Supabase Postgres database. It's the authoritative current-state schema reference — not hand-edited, not reconstructed from migrations. If you need to rebuild, every `CREATE TABLE` block below is copy-paste ready.

## Naming gotchas to know before reading

- **There is no `institutions` table.** The de-facto institutions table is `crawl_targets` — every FK across the schema that says `institution_id` actually points at `crawl_targets.id`. Older docs, memory files, and chat history may refer to an `institutions` table that does not exist.
- **`fees_raw` vs `extracted_fees` vs `fees_verified` vs `fees_published`** are four *separate* tables that together form the fee pipeline. They are not views of one another.
- **`agent_events_*` and `agent_auth_log_*` are partitioned** by month — look under Agent runtime & audit for the partition parents.
- **Supabase-managed schemas** (`auth`, `storage`, `realtime`, `vault`, `supabase_migrations`) are **NOT** documented here. This doc only covers `public`.

To regenerate:

```bash
set -a; source .env; set +a
python3 scripts/generate-schema-doc.py
```

---

## Table of contents

- **Core identity & institutions** (5)
  - [`crawl_target_changes`](#crawl-target-changes)
  - [`crawl_targets`](#crawl-targets)
  - [`institution_complaints`](#institution-complaints)
  - [`institution_dossiers`](#institution-dossiers)
  - [`institution_financials`](#institution-financials)
- **Fee pipeline (extraction → classification → published)** (15)
  - [`extracted_fees`](#extracted-fees)
  - [`extracted_fees_dedup_backup_20260418`](#extracted-fees-dedup-backup-20260418)
  - [`extracted_fees_promote_backup_20260418`](#extracted-fees-promote-backup-20260418)
  - [`fee_alert_subscriptions`](#fee-alert-subscriptions)
  - [`fee_change_events`](#fee-change-events)
  - [`fee_index_cache`](#fee-index-cache)
  - [`fee_reviews`](#fee-reviews)
  - [`fee_reviews_dedup_backup_20260418`](#fee-reviews-dedup-backup-20260418)
  - [`fee_snapshots`](#fee-snapshots)
  - [`fees_published`](#fees-published)
  - [`fees_published_rollback_log`](#fees-published-rollback-log)
  - [`fees_raw`](#fees-raw)
  - [`fees_verified`](#fees-verified)
  - [`gold_standard_fees`](#gold-standard-fees)
  - [`published_reports`](#published-reports)
- **Crawler state & artifacts** (3)
  - [`crawl_results`](#crawl-results)
  - [`crawl_runs`](#crawl-runs)
  - [`discovery_cache`](#discovery-cache)
- **Agent runtime & audit** (24)
  - [`agent_auth_log_2026_04`](#agent-auth-log-2026-04)
  - [`agent_auth_log_2026_05`](#agent-auth-log-2026-05)
  - [`agent_auth_log_default`](#agent-auth-log-default)
  - [`agent_budgets`](#agent-budgets)
  - [`agent_events_2026_04`](#agent-events-2026-04)
  - [`agent_events_2026_05`](#agent-events-2026-05)
  - [`agent_events_default`](#agent-events-default)
  - [`agent_health_rollup`](#agent-health-rollup)
  - [`agent_lessons`](#agent-lessons)
  - [`agent_messages`](#agent-messages)
  - [`agent_registry`](#agent-registry)
  - [`agent_run_results`](#agent-run-results)
  - [`agent_runs`](#agent-runs)
  - [`classification_cache`](#classification-cache)
  - [`jobs`](#jobs)
  - [`knox_overrides`](#knox-overrides)
  - [`ops_jobs`](#ops-jobs)
  - [`report_jobs`](#report-jobs)
  - [`roomba_log`](#roomba-log)
  - [`shadow_outputs`](#shadow-outputs)
  - [`upload_jobs`](#upload-jobs)
  - [`wave_runs`](#wave-runs)
  - [`wave_state_runs`](#wave-state-runs)
  - [`workers_last_run`](#workers-last-run)
- **Hamilton research platform** (13)
  - [`articles`](#articles)
  - [`hamilton_conversations`](#hamilton-conversations)
  - [`hamilton_messages`](#hamilton-messages)
  - [`hamilton_priority_alerts`](#hamilton-priority-alerts)
  - [`hamilton_reports`](#hamilton-reports)
  - [`hamilton_saved_analyses`](#hamilton-saved-analyses)
  - [`hamilton_scenarios`](#hamilton-scenarios)
  - [`hamilton_signals`](#hamilton-signals)
  - [`hamilton_watchlists`](#hamilton-watchlists)
  - [`research_articles`](#research-articles)
  - [`research_conversations`](#research-conversations)
  - [`research_messages`](#research-messages)
  - [`research_usage`](#research-usage)
- **External economic data** (6)
  - [`beige_book_themes`](#beige-book-themes)
  - [`external_intelligence`](#external-intelligence)
  - [`fed_beige_book`](#fed-beige-book)
  - [`fed_content`](#fed-content)
  - [`fed_economic_indicators`](#fed-economic-indicators)
  - [`reg_articles`](#reg-articles)
- **Users, auth, billing, audit** (8)
  - [`leads`](#leads)
  - [`saved_peer_sets`](#saved-peer-sets)
  - [`saved_subscriber_peer_groups`](#saved-subscriber-peer-groups)
  - [`sessions`](#sessions)
  - [`stripe_events`](#stripe-events)
  - [`subscriptions`](#subscriptions)
  - [`usage_events`](#usage-events)
  - [`users`](#users)
- **Reference & taxonomy** (2)
  - [`platform_registry`](#platform-registry)
  - [`schema_migrations`](#schema-migrations)
- **Other** (14)
  - [`alert_preferences`](#alert-preferences)
  - [`analysis_results`](#analysis-results)
  - [`api_keys`](#api-keys)
  - [`branch_deposits`](#branch-deposits)
  - [`canary_runs`](#canary-runs)
  - [`census_tracts`](#census-tracts)
  - [`classification_history`](#classification-history)
  - [`community_submissions`](#community-submissions)
  - [`coverage_snapshots`](#coverage-snapshots)
  - [`demographics`](#demographics)
  - [`market_concentration`](#market-concentration)
  - [`org_members`](#org-members)
  - [`organizations`](#organizations)
  - [`pipeline_runs`](#pipeline-runs)

---

## Core identity & institutions

### <a id="crawl-target-changes"></a>`crawl_target_changes`

**Rows:** 0 · **PK:** `id` · **FK → :** `crawl_targets`, `users`

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `id` | `bigint` |  | `nextval('crawl_target_changes_id_seq'::regclass)` |
| `crawl_target_id` | `bigint` |  |  |
| `field` | `text` |  |  |
| `old_value` | `text` | ✓ |  |
| `new_value` | `text` | ✓ |  |
| `user_id` | `bigint` | ✓ |  |
| `note` | `text` | ✓ |  |
| `created_at` | `timestamp with time zone` |  | `now()` |

**Indexes:**
- `idx_target_changes_target`

<details><summary>DDL</summary>

```sql
CREATE TABLE public."crawl_target_changes" (
  "id" bigint NOT NULL DEFAULT nextval('crawl_target_changes_id_seq'::regclass),
  "crawl_target_id" bigint NOT NULL,
  "field" text NOT NULL,
  "old_value" text,
  "new_value" text,
  "user_id" bigint,
  "note" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);
ALTER TABLE public."crawl_target_changes" ADD CONSTRAINT "crawl_target_changes_crawl_target_id_fkey" FOREIGN KEY ("crawl_target_id") REFERENCES public."crawl_targets" ("id");
ALTER TABLE public."crawl_target_changes" ADD CONSTRAINT "crawl_target_changes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES public."users" ("id");
```

</details>

### <a id="crawl-targets"></a>`crawl_targets`

**Rows:** 8,750 · **PK:** `id`

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `id` | `bigint` |  | `nextval('crawl_targets_id_seq'::regclass)` |
| `institution_name` | `text` |  |  |
| `website_url` | `text` | ✓ |  |
| `fee_schedule_url` | `text` | ✓ |  |
| `charter_type` | `text` |  |  |
| `state` | `text` | ✓ |  |
| `state_code` | `character(2)` | ✓ |  |
| `city` | `text` | ✓ |  |
| `asset_size` | `bigint` | ✓ |  |
| `cert_number` | `text` | ✓ |  |
| `source` | `text` |  |  |
| `status` | `text` |  | `'active'::text` |
| `document_type` | `text` | ✓ |  |
| `last_content_hash` | `text` | ✓ |  |
| `last_crawl_at` | `timestamp with time zone` | ✓ |  |
| `last_success_at` | `timestamp with time zone` | ✓ |  |
| `consecutive_failures` | `integer` |  | `0` |
| `created_at` | `timestamp with time zone` |  | `now()` |
| `fed_district` | `integer` | ✓ |  |
| `asset_size_tier` | `text` | ✓ |  |
| `cbsa_code` | `text` | ✓ |  |
| `cbsa_name` | `text` | ✓ |  |
| `urban_rural` | `text` | ✓ |  |
| `established_date` | `text` | ✓ |  |
| `specialty` | `text` | ✓ |  |
| `failure_reason` | `text` | ✓ |  |
| `failure_reason_note` | `text` | ✓ |  |
| `failure_reason_updated_at` | `timestamp with time zone` | ✓ |  |
| `cms_platform` | `text` | ✓ |  |
| `cms_confidence` | `double precision` | ✓ |  |
| `document_r2_key` | `text` | ✓ |  |
| `document_type_detected` | `text` | ✓ |  |
| `doc_classification_confidence` | `double precision` | ✓ |  |
| `extraction_completeness_score` | `double precision` | ✓ |  |
| `extraction_completeness_label` | `text` | ✓ |  |
| `crawl_strategy` | `text` | ✓ |  |
| `rescue_status` | `text` | ✓ |  |
| `last_rescue_attempt_at` | `timestamp with time zone` | ✓ |  |
| `rssd_id` | `text` | ✓ |  |
| `ncua_charter_id` | `text` | ✓ |  |
| `routing_number` | `text` | ✓ |  |
| `lei` | `text` | ✓ |  |

**Indexes:**
- `crawl_targets_rescue_pending_idx`
- `crawl_targets_source_cert_number_key` (unique)
- `idx_crawl_targets_charter_tier`
- `idx_crawl_targets_failure`
- `idx_crawl_targets_fee_url`
- `idx_crawl_targets_lei`
- `idx_crawl_targets_ncua`
- `idx_crawl_targets_platform`
- `idx_crawl_targets_routing` (unique)
- `idx_crawl_targets_rssd` (unique)
- `idx_crawl_targets_state_tier`
- `idx_crawl_targets_with_fees`

**Check constraints:**
- `crawl_targets_rescue_status_check`: `CHECK (((rescue_status IS NULL) OR (rescue_status = ANY (ARRAY['pending'::text, 'rescued'::text, 'dead'::text, 'needs_human'::text, 'retry_after'::text]))))`

<details><summary>DDL</summary>

```sql
CREATE TABLE public."crawl_targets" (
  "id" bigint NOT NULL DEFAULT nextval('crawl_targets_id_seq'::regclass),
  "institution_name" text NOT NULL,
  "website_url" text,
  "fee_schedule_url" text,
  "charter_type" text NOT NULL,
  "state" text,
  "state_code" character(2),
  "city" text,
  "asset_size" bigint,
  "cert_number" text,
  "source" text NOT NULL,
  "status" text NOT NULL DEFAULT 'active'::text,
  "document_type" text,
  "last_content_hash" text,
  "last_crawl_at" timestamp with time zone,
  "last_success_at" timestamp with time zone,
  "consecutive_failures" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "fed_district" integer,
  "asset_size_tier" text,
  "cbsa_code" text,
  "cbsa_name" text,
  "urban_rural" text,
  "established_date" text,
  "specialty" text,
  "failure_reason" text,
  "failure_reason_note" text,
  "failure_reason_updated_at" timestamp with time zone,
  "cms_platform" text,
  "cms_confidence" double precision,
  "document_r2_key" text,
  "document_type_detected" text,
  "doc_classification_confidence" double precision,
  "extraction_completeness_score" double precision,
  "extraction_completeness_label" text,
  "crawl_strategy" text,
  "rescue_status" text,
  "last_rescue_attempt_at" timestamp with time zone,
  "rssd_id" text,
  "ncua_charter_id" text,
  "routing_number" text,
  "lei" text,
  PRIMARY KEY ("id"),
  CONSTRAINT "crawl_targets_source_cert_number_key" UNIQUE ("source", "cert_number")
);
ALTER TABLE public."crawl_targets" ADD CONSTRAINT "crawl_targets_rescue_status_check" CHECK (((rescue_status IS NULL) OR (rescue_status = ANY (ARRAY['pending'::text, 'rescued'::text, 'dead'::text, 'needs_human'::text, 'retry_after'::text]))));
```

</details>

### <a id="institution-complaints"></a>`institution_complaints`

**Rows:** 4,429 · **PK:** `id` · **FK → :** `crawl_targets`

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `id` | `bigint` |  | `nextval('institution_complaints_id_seq'::regclass)` |
| `crawl_target_id` | `bigint` |  |  |
| `report_period` | `text` |  |  |
| `product` | `text` |  |  |
| `issue` | `text` | ✓ |  |
| `complaint_count` | `integer` |  |  |
| `fetched_at` | `timestamp with time zone` |  | `now()` |

**Indexes:**
- `idx_complaints_target`
- `institution_complaints_crawl_target_id_report_period_produc_key` (unique)

<details><summary>DDL</summary>

```sql
CREATE TABLE public."institution_complaints" (
  "id" bigint NOT NULL DEFAULT nextval('institution_complaints_id_seq'::regclass),
  "crawl_target_id" bigint NOT NULL,
  "report_period" text NOT NULL,
  "product" text NOT NULL,
  "issue" text,
  "complaint_count" integer NOT NULL,
  "fetched_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("id"),
  CONSTRAINT "institution_complaints_crawl_target_id_report_period_produc_key" UNIQUE ("crawl_target_id", "report_period", "product", "issue")
);
ALTER TABLE public."institution_complaints" ADD CONSTRAINT "institution_complaints_crawl_target_id_fkey" FOREIGN KEY ("crawl_target_id") REFERENCES public."crawl_targets" ("id");
```

</details>

### <a id="institution-dossiers"></a>`institution_dossiers`

*Phase 62a KNOX-03: per-institution strategy memory. Empty in 62a; Phase 63 state agents populate via upsert tool.*

**Rows:** 0 · **PK:** `institution_id` · **FK → :** `crawl_targets`

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `institution_id` | `integer` |  |  |
| `last_url_tried` | `text` | ✓ |  |
| `last_document_format` | `text` | ✓ |  |
| `last_strategy` | `text` | ✓ |  |
| `last_outcome` | `text` | ✓ |  |
| `last_cost_cents` | `integer` |  | `0` |
| `next_try_recommendation` | `text` | ✓ |  |
| `notes` | `jsonb` |  | `'{}'::jsonb` |
| `updated_at` | `timestamp with time zone` |  | `now()` |
| `updated_by_agent_event_id` | `uuid` | ✓ |  |
| `updated_by_agent` | `text` | ✓ |  |

**Indexes:**
- `institution_dossiers_next_try_idx`
- `institution_dossiers_outcome_idx`
- `institution_dossiers_updated_by_agent_idx`

**Check constraints:**
- `institution_dossiers_last_cost_cents_check`: `CHECK ((last_cost_cents >= 0))`
- `institution_dossiers_last_document_format_check`: `CHECK (((last_document_format = ANY (ARRAY['pdf'::text, 'html'::text, 'js_rendered'::text, 'stealth_pass_1'::text, 'stealth_pass_2'::text, 'unknown'::text])) OR (last_document_format IS NULL)))`
- `institution_dossiers_last_outcome_check`: `CHECK (((last_outcome = ANY (ARRAY['success'::text, 'blocked'::text, '404'::text, 'no_fees'::text, 'captcha'::text, 'rate_limited'::text, 'unknown'::text])) OR (last_outcome IS NULL)))`
- `institution_dossiers_next_try_recommendation_check`: `CHECK (((next_try_recommendation = ANY (ARRAY['retry_same'::text, 'stealth_pass_1'::text, 'needs_playwright_stealth'::text, 'skip'::text, 'rediscover_url'::text])) OR (next_try_recommendation IS NULL)))`

<details><summary>DDL</summary>

```sql
CREATE TABLE public."institution_dossiers" (
  "institution_id" integer NOT NULL,
  "last_url_tried" text,
  "last_document_format" text,
  "last_strategy" text,
  "last_outcome" text,
  "last_cost_cents" integer NOT NULL DEFAULT 0,
  "next_try_recommendation" text,
  "notes" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_by_agent_event_id" uuid,
  "updated_by_agent" text,
  PRIMARY KEY ("institution_id")
);
ALTER TABLE public."institution_dossiers" ADD CONSTRAINT "institution_dossiers_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES public."crawl_targets" ("id") ON DELETE CASCADE;
ALTER TABLE public."institution_dossiers" ADD CONSTRAINT "institution_dossiers_last_cost_cents_check" CHECK ((last_cost_cents >= 0));
ALTER TABLE public."institution_dossiers" ADD CONSTRAINT "institution_dossiers_last_document_format_check" CHECK (((last_document_format = ANY (ARRAY['pdf'::text, 'html'::text, 'js_rendered'::text, 'stealth_pass_1'::text, 'stealth_pass_2'::text, 'unknown'::text])) OR (last_document_format IS NULL)));
ALTER TABLE public."institution_dossiers" ADD CONSTRAINT "institution_dossiers_last_outcome_check" CHECK (((last_outcome = ANY (ARRAY['success'::text, 'blocked'::text, '404'::text, 'no_fees'::text, 'captcha'::text, 'rate_limited'::text, 'unknown'::text])) OR (last_outcome IS NULL)));
ALTER TABLE public."institution_dossiers" ADD CONSTRAINT "institution_dossiers_next_try_recommendation_check" CHECK (((next_try_recommendation = ANY (ARRAY['retry_same'::text, 'stealth_pass_1'::text, 'needs_playwright_stealth'::text, 'skip'::text, 'rediscover_url'::text])) OR (next_try_recommendation IS NULL)));
```

</details>

### <a id="institution-financials"></a>`institution_financials`

**Rows:** 38,949 · **PK:** `id` · **FK → :** `crawl_targets`

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `id` | `bigint` |  | `nextval('institution_financials_id_seq'::regclass)` |
| `crawl_target_id` | `bigint` |  |  |
| `report_date` | `text` |  |  |
| `source` | `text` |  |  |
| `total_assets` | `bigint` | ✓ |  |
| `total_deposits` | `bigint` | ✓ |  |
| `total_loans` | `bigint` | ✓ |  |
| `service_charge_income` | `bigint` | ✓ |  |
| `other_noninterest_income` | `bigint` | ✓ |  |
| `net_interest_margin` | `double precision` | ✓ |  |
| `efficiency_ratio` | `double precision` | ✓ |  |
| `roa` | `double precision` | ✓ |  |
| `roe` | `double precision` | ✓ |  |
| `tier1_capital_ratio` | `double precision` | ✓ |  |
| `branch_count` | `integer` | ✓ |  |
| `employee_count` | `integer` | ✓ |  |
| `member_count` | `integer` | ✓ |  |
| `raw_json` | `jsonb` | ✓ |  |
| `fetched_at` | `timestamp with time zone` |  | `now()` |
| `total_revenue` | `bigint` | ✓ |  |
| `fee_income_ratio` | `double precision` | ✓ |  |
| `overdraft_revenue` | `bigint` | ✓ |  |

**Indexes:**
- `idx_financials_date_source`
- `idx_financials_target_date`
- `institution_financials_crawl_target_id_report_date_source_key` (unique)

<details><summary>DDL</summary>

```sql
CREATE TABLE public."institution_financials" (
  "id" bigint NOT NULL DEFAULT nextval('institution_financials_id_seq'::regclass),
  "crawl_target_id" bigint NOT NULL,
  "report_date" text NOT NULL,
  "source" text NOT NULL,
  "total_assets" bigint,
  "total_deposits" bigint,
  "total_loans" bigint,
  "service_charge_income" bigint,
  "other_noninterest_income" bigint,
  "net_interest_margin" double precision,
  "efficiency_ratio" double precision,
  "roa" double precision,
  "roe" double precision,
  "tier1_capital_ratio" double precision,
  "branch_count" integer,
  "employee_count" integer,
  "member_count" integer,
  "raw_json" jsonb,
  "fetched_at" timestamp with time zone NOT NULL DEFAULT now(),
  "total_revenue" bigint,
  "fee_income_ratio" double precision,
  "overdraft_revenue" bigint,
  PRIMARY KEY ("id"),
  CONSTRAINT "institution_financials_crawl_target_id_report_date_source_key" UNIQUE ("crawl_target_id", "report_date", "source")
);
ALTER TABLE public."institution_financials" ADD CONSTRAINT "institution_financials_crawl_target_id_fkey" FOREIGN KEY ("crawl_target_id") REFERENCES public."crawl_targets" ("id");
```

</details>

---

## Fee pipeline (extraction → classification → published)

### <a id="extracted-fees"></a>`extracted_fees`

**Rows:** 124,246 · **PK:** `id` · **FK → :** `crawl_results`, `crawl_targets`

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `id` | `bigint` |  | `nextval('extracted_fees_id_seq'::regclass)` |
| `crawl_result_id` | `bigint` | ✓ |  |
| `crawl_target_id` | `bigint` |  |  |
| `fee_name` | `text` |  |  |
| `amount` | `double precision` | ✓ |  |
| `frequency` | `text` | ✓ |  |
| `conditions` | `text` | ✓ |  |
| `extraction_confidence` | `double precision` |  | `0.0` |
| `review_status` | `text` |  | `'pending'::text` |
| `created_at` | `timestamp with time zone` |  | `now()` |
| `validation_flags` | `jsonb` | ✓ |  |
| `fee_family` | `text` | ✓ |  |
| `fee_category` | `text` | ✓ |  |
| `account_product_type` | `text` | ✓ |  |
| `source` | `text` | ✓ | `'crawler'::text` |
| `extracted_by` | `text` | ✓ |  |
| `is_fee_cap` | `boolean` | ✓ | `false` |
| `canonical_fee_key` | `text` | ✓ |  |
| `variant_type` | `text` | ✓ |  |

**Indexes:**
- `idx_extracted_fees_cat_amt`
- `idx_extracted_fees_category`
- `idx_extracted_fees_crawl_result`
- `idx_extracted_fees_review`
- `idx_extracted_fees_review_queue`
- `idx_extracted_fees_target`
- `idx_extracted_fees_target_status`
- `idx_fees_canonical_key`

<details><summary>DDL</summary>

```sql
CREATE TABLE public."extracted_fees" (
  "id" bigint NOT NULL DEFAULT nextval('extracted_fees_id_seq'::regclass),
  "crawl_result_id" bigint,
  "crawl_target_id" bigint NOT NULL,
  "fee_name" text NOT NULL,
  "amount" double precision,
  "frequency" text,
  "conditions" text,
  "extraction_confidence" double precision NOT NULL DEFAULT 0.0,
  "review_status" text NOT NULL DEFAULT 'pending'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "validation_flags" jsonb,
  "fee_family" text,
  "fee_category" text,
  "account_product_type" text,
  "source" text DEFAULT 'crawler'::text,
  "extracted_by" text,
  "is_fee_cap" boolean DEFAULT false,
  "canonical_fee_key" text,
  "variant_type" text,
  PRIMARY KEY ("id")
);
ALTER TABLE public."extracted_fees" ADD CONSTRAINT "extracted_fees_crawl_result_id_fkey" FOREIGN KEY ("crawl_result_id") REFERENCES public."crawl_results" ("id");
ALTER TABLE public."extracted_fees" ADD CONSTRAINT "extracted_fees_crawl_target_id_fkey" FOREIGN KEY ("crawl_target_id") REFERENCES public."crawl_targets" ("id");
```

</details>

### <a id="extracted-fees-dedup-backup-20260418"></a>`extracted_fees_dedup_backup_20260418`

**Rows:** 24,963 · **PK:** `id`

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `id` | `bigint` |  | `nextval('extracted_fees_id_seq'::regclass)` |
| `crawl_result_id` | `bigint` | ✓ |  |
| `crawl_target_id` | `bigint` |  |  |
| `fee_name` | `text` |  |  |
| `amount` | `double precision` | ✓ |  |
| `frequency` | `text` | ✓ |  |
| `conditions` | `text` | ✓ |  |
| `extraction_confidence` | `double precision` |  | `0.0` |
| `review_status` | `text` |  | `'pending'::text` |
| `created_at` | `timestamp with time zone` |  | `now()` |
| `validation_flags` | `jsonb` | ✓ |  |
| `fee_family` | `text` | ✓ |  |
| `fee_category` | `text` | ✓ |  |
| `account_product_type` | `text` | ✓ |  |
| `source` | `text` | ✓ | `'crawler'::text` |
| `extracted_by` | `text` | ✓ |  |
| `is_fee_cap` | `boolean` | ✓ | `false` |
| `canonical_fee_key` | `text` | ✓ |  |
| `variant_type` | `text` | ✓ |  |
| `deleted_at` | `timestamp with time zone` | ✓ | `now()` |

**Indexes:**
- `extracted_fees_dedup_backup_20260418_canonical_fee_key_idx`
- `extracted_fees_dedup_backup_20260418_crawl_result_id_idx`
- `extracted_fees_dedup_backup_20260418_review_status_idx`
- `extracted_fees_dedup_backup_202604_review_status_created_at_idx`
- `extracted_fees_dedup_backup_2026_fee_category_review_status_idx`
- `extracted_fees_dedup_backup_2_crawl_target_id_review_statu_idx1`
- `extracted_fees_dedup_backup_2_crawl_target_id_review_status_idx`
- `extracted_fees_dedup_backup_2_fee_category_amount_crawl_tar_idx`

<details><summary>DDL</summary>

```sql
CREATE TABLE public."extracted_fees_dedup_backup_20260418" (
  "id" bigint NOT NULL DEFAULT nextval('extracted_fees_id_seq'::regclass),
  "crawl_result_id" bigint,
  "crawl_target_id" bigint NOT NULL,
  "fee_name" text NOT NULL,
  "amount" double precision,
  "frequency" text,
  "conditions" text,
  "extraction_confidence" double precision NOT NULL DEFAULT 0.0,
  "review_status" text NOT NULL DEFAULT 'pending'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "validation_flags" jsonb,
  "fee_family" text,
  "fee_category" text,
  "account_product_type" text,
  "source" text DEFAULT 'crawler'::text,
  "extracted_by" text,
  "is_fee_cap" boolean DEFAULT false,
  "canonical_fee_key" text,
  "variant_type" text,
  "deleted_at" timestamp with time zone DEFAULT now(),
  PRIMARY KEY ("id")
);
```

</details>

### <a id="extracted-fees-promote-backup-20260418"></a>`extracted_fees_promote_backup_20260418`

**Rows:** 55,075

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `id` | `bigint` | ✓ |  |
| `crawl_result_id` | `bigint` | ✓ |  |
| `crawl_target_id` | `bigint` | ✓ |  |
| `fee_name` | `text` | ✓ |  |
| `amount` | `double precision` | ✓ |  |
| `frequency` | `text` | ✓ |  |
| `conditions` | `text` | ✓ |  |
| `extraction_confidence` | `double precision` | ✓ |  |
| `review_status` | `text` | ✓ |  |
| `created_at` | `timestamp with time zone` | ✓ |  |
| `validation_flags` | `jsonb` | ✓ |  |
| `fee_family` | `text` | ✓ |  |
| `fee_category` | `text` | ✓ |  |
| `account_product_type` | `text` | ✓ |  |
| `source` | `text` | ✓ |  |
| `extracted_by` | `text` | ✓ |  |
| `is_fee_cap` | `boolean` | ✓ |  |
| `canonical_fee_key` | `text` | ✓ |  |
| `variant_type` | `text` | ✓ |  |
| `was_status` | `text` | ✓ |  |
| `backed_up_at` | `timestamp with time zone` | ✓ |  |

<details><summary>DDL</summary>

```sql
CREATE TABLE public."extracted_fees_promote_backup_20260418" (
  "id" bigint,
  "crawl_result_id" bigint,
  "crawl_target_id" bigint,
  "fee_name" text,
  "amount" double precision,
  "frequency" text,
  "conditions" text,
  "extraction_confidence" double precision,
  "review_status" text,
  "created_at" timestamp with time zone,
  "validation_flags" jsonb,
  "fee_family" text,
  "fee_category" text,
  "account_product_type" text,
  "source" text,
  "extracted_by" text,
  "is_fee_cap" boolean,
  "canonical_fee_key" text,
  "variant_type" text,
  "was_status" text,
  "backed_up_at" timestamp with time zone
);
```

</details>

### <a id="fee-alert-subscriptions"></a>`fee_alert_subscriptions`

**Rows:** 0 · **PK:** `id` · **FK → :** `crawl_targets`, `users`

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `id` | `bigint` |  | `nextval('fee_alert_subscriptions_id_seq'::regclass)` |
| `user_id` | `bigint` |  |  |
| `crawl_target_id` | `bigint` |  |  |
| `fee_categories` | `text[]` | ✓ |  |
| `is_active` | `boolean` |  | `true` |
| `created_at` | `timestamp with time zone` | ✓ | `now()` |

**Indexes:**
- `fee_alert_subscriptions_user_id_crawl_target_id_key` (unique)
- `idx_alert_subs_user`

<details><summary>DDL</summary>

```sql
CREATE TABLE public."fee_alert_subscriptions" (
  "id" bigint NOT NULL DEFAULT nextval('fee_alert_subscriptions_id_seq'::regclass),
  "user_id" bigint NOT NULL,
  "crawl_target_id" bigint NOT NULL,
  "fee_categories" text[],
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone DEFAULT now(),
  PRIMARY KEY ("id"),
  CONSTRAINT "fee_alert_subscriptions_user_id_crawl_target_id_key" UNIQUE ("user_id", "crawl_target_id")
);
ALTER TABLE public."fee_alert_subscriptions" ADD CONSTRAINT "fee_alert_subscriptions_crawl_target_id_fkey" FOREIGN KEY ("crawl_target_id") REFERENCES public."crawl_targets" ("id");
ALTER TABLE public."fee_alert_subscriptions" ADD CONSTRAINT "fee_alert_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES public."users" ("id");
```

</details>

### <a id="fee-change-events"></a>`fee_change_events`

**Rows:** 127 · **PK:** `id` · **FK → :** `crawl_targets`

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `id` | `bigint` |  | `nextval('fee_change_events_id_seq'::regclass)` |
| `crawl_target_id` | `bigint` | ✓ |  |
| `fee_category` | `text` |  |  |
| `previous_amount` | `double precision` | ✓ |  |
| `new_amount` | `double precision` | ✓ |  |
| `change_type` | `text` |  |  |
| `detected_at` | `timestamp with time zone` |  | `now()` |
| `institution_id` | `integer` | ✓ |  |
| `canonical_fee_key` | `text` | ✓ |  |
| `old_amount` | `numeric` | ✓ |  |

**Indexes:**
- `idx_fce_date_category`

<details><summary>DDL</summary>

```sql
CREATE TABLE public."fee_change_events" (
  "id" bigint NOT NULL DEFAULT nextval('fee_change_events_id_seq'::regclass),
  "crawl_target_id" bigint,
  "fee_category" text NOT NULL,
  "previous_amount" double precision,
  "new_amount" double precision,
  "change_type" text NOT NULL,
  "detected_at" timestamp with time zone NOT NULL DEFAULT now(),
  "institution_id" integer,
  "canonical_fee_key" text,
  "old_amount" numeric,
  PRIMARY KEY ("id")
);
ALTER TABLE public."fee_change_events" ADD CONSTRAINT "fee_change_events_crawl_target_id_fkey" FOREIGN KEY ("crawl_target_id") REFERENCES public."crawl_targets" ("id");
```

</details>

### <a id="fee-index-cache"></a>`fee_index_cache`

**Rows:** 49 · **PK:** `fee_category`

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `fee_category` | `text` |  |  |
| `fee_family` | `text` | ✓ |  |
| `median_amount` | `double precision` | ✓ |  |
| `p25_amount` | `double precision` | ✓ |  |
| `p75_amount` | `double precision` | ✓ |  |
| `min_amount` | `double precision` | ✓ |  |
| `max_amount` | `double precision` | ✓ |  |
| `institution_count` | `integer` |  | `0` |
| `observation_count` | `integer` |  | `0` |
| `approved_count` | `integer` |  | `0` |
| `bank_count` | `integer` |  | `0` |
| `cu_count` | `integer` |  | `0` |
| `maturity_tier` | `text` |  | `'insufficient'::text` |
| `computed_at` | `timestamp with time zone` |  | `now()` |

<details><summary>DDL</summary>

```sql
CREATE TABLE public."fee_index_cache" (
  "fee_category" text NOT NULL,
  "fee_family" text,
  "median_amount" double precision,
  "p25_amount" double precision,
  "p75_amount" double precision,
  "min_amount" double precision,
  "max_amount" double precision,
  "institution_count" integer NOT NULL DEFAULT 0,
  "observation_count" integer NOT NULL DEFAULT 0,
  "approved_count" integer NOT NULL DEFAULT 0,
  "bank_count" integer NOT NULL DEFAULT 0,
  "cu_count" integer NOT NULL DEFAULT 0,
  "maturity_tier" text NOT NULL DEFAULT 'insufficient'::text,
  "computed_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("fee_category")
);
```

</details>

### <a id="fee-reviews"></a>`fee_reviews`

**Rows:** 26,786 · **PK:** `id` · **FK → :** `extracted_fees`, `users`

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `id` | `bigint` |  | `nextval('fee_reviews_id_seq'::regclass)` |
| `fee_id` | `bigint` |  |  |
| `action` | `text` |  |  |
| `user_id` | `bigint` | ✓ |  |
| `username` | `text` | ✓ |  |
| `previous_status` | `text` | ✓ |  |
| `new_status` | `text` | ✓ |  |
| `previous_values` | `jsonb` | ✓ |  |
| `new_values` | `jsonb` | ✓ |  |
| `notes` | `text` | ✓ |  |
| `created_at` | `timestamp with time zone` |  | `now()` |
| `reviewed_at` | `timestamp with time zone` | ✓ |  |

**Indexes:**
- `idx_fee_reviews_date`

<details><summary>DDL</summary>

```sql
CREATE TABLE public."fee_reviews" (
  "id" bigint NOT NULL DEFAULT nextval('fee_reviews_id_seq'::regclass),
  "fee_id" bigint NOT NULL,
  "action" text NOT NULL,
  "user_id" bigint,
  "username" text,
  "previous_status" text,
  "new_status" text,
  "previous_values" jsonb,
  "new_values" jsonb,
  "notes" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "reviewed_at" timestamp with time zone,
  PRIMARY KEY ("id")
);
ALTER TABLE public."fee_reviews" ADD CONSTRAINT "fee_reviews_fee_id_fkey" FOREIGN KEY ("fee_id") REFERENCES public."extracted_fees" ("id");
ALTER TABLE public."fee_reviews" ADD CONSTRAINT "fee_reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES public."users" ("id");
```

</details>

### <a id="fee-reviews-dedup-backup-20260418"></a>`fee_reviews_dedup_backup_20260418`

**Rows:** 16,620 · **PK:** `id`

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `id` | `bigint` |  | `nextval('fee_reviews_id_seq'::regclass)` |
| `fee_id` | `bigint` |  |  |
| `action` | `text` |  |  |
| `user_id` | `bigint` | ✓ |  |
| `username` | `text` | ✓ |  |
| `previous_status` | `text` | ✓ |  |
| `new_status` | `text` | ✓ |  |
| `previous_values` | `jsonb` | ✓ |  |
| `new_values` | `jsonb` | ✓ |  |
| `notes` | `text` | ✓ |  |
| `created_at` | `timestamp with time zone` |  | `now()` |
| `deleted_at` | `timestamp with time zone` | ✓ | `now()` |

**Indexes:**
- `fee_reviews_dedup_backup_20260418_created_at_idx`

<details><summary>DDL</summary>

```sql
CREATE TABLE public."fee_reviews_dedup_backup_20260418" (
  "id" bigint NOT NULL DEFAULT nextval('fee_reviews_id_seq'::regclass),
  "fee_id" bigint NOT NULL,
  "action" text NOT NULL,
  "user_id" bigint,
  "username" text,
  "previous_status" text,
  "new_status" text,
  "previous_values" jsonb,
  "new_values" jsonb,
  "notes" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "deleted_at" timestamp with time zone DEFAULT now(),
  PRIMARY KEY ("id")
);
```

</details>

### <a id="fee-snapshots"></a>`fee_snapshots`

**Rows:** 38,504 · **PK:** `id` · **FK → :** `crawl_results`, `crawl_targets`

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `id` | `bigint` |  | `nextval('fee_snapshots_id_seq'::regclass)` |
| `crawl_target_id` | `bigint` |  |  |
| `crawl_result_id` | `bigint` | ✓ |  |
| `snapshot_date` | `text` |  |  |
| `fee_name` | `text` |  |  |
| `fee_category` | `text` | ✓ |  |
| `amount` | `double precision` | ✓ |  |
| `frequency` | `text` | ✓ |  |
| `conditions` | `text` | ✓ |  |
| `account_product_type` | `text` | ✓ |  |
| `extraction_confidence` | `double precision` | ✓ |  |
| `created_at` | `timestamp with time zone` |  | `now()` |

**Indexes:**
- `fee_snapshots_crawl_target_id_snapshot_date_fee_category_key` (unique)
- `idx_snapshots_target_cat`

<details><summary>DDL</summary>

```sql
CREATE TABLE public."fee_snapshots" (
  "id" bigint NOT NULL DEFAULT nextval('fee_snapshots_id_seq'::regclass),
  "crawl_target_id" bigint NOT NULL,
  "crawl_result_id" bigint,
  "snapshot_date" text NOT NULL,
  "fee_name" text NOT NULL,
  "fee_category" text,
  "amount" double precision,
  "frequency" text,
  "conditions" text,
  "account_product_type" text,
  "extraction_confidence" double precision,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("id"),
  CONSTRAINT "fee_snapshots_crawl_target_id_snapshot_date_fee_category_key" UNIQUE ("crawl_target_id", "snapshot_date", "fee_category")
);
ALTER TABLE public."fee_snapshots" ADD CONSTRAINT "fee_snapshots_crawl_result_id_fkey" FOREIGN KEY ("crawl_result_id") REFERENCES public."crawl_results" ("id");
ALTER TABLE public."fee_snapshots" ADD CONSTRAINT "fee_snapshots_crawl_target_id_fkey" FOREIGN KEY ("crawl_target_id") REFERENCES public."crawl_targets" ("id");
```

</details>

### <a id="fees-published"></a>`fees_published`

*Phase 62a TIER-03 Presentation: adversarial-gated, Hamilton-consumable. INSERT-only by design; no UPDATE/DELETE tools in 62a. Phase 66 Hamilton refactor reads here.*

**Rows:** 503 · **PK:** `fee_published_id` · **FK → :** `fees_verified`

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `fee_published_id` | `bigint` |  | `nextval('fees_published_fee_published_id_seq'::regclass)` |
| `published_at` | `timestamp with time zone` |  | `now()` |
| `lineage_ref` | `bigint` |  |  |
| `institution_id` | `integer` |  |  |
| `canonical_fee_key` | `text` |  |  |
| `source_url` | `text` | ✓ |  |
| `document_r2_key` | `text` | ✓ |  |
| `extraction_confidence` | `numeric(5,4)` | ✓ |  |
| `agent_event_id` | `uuid` | ✓ |  |
| `verified_by_agent_event_id` | `uuid` | ✓ |  |
| `published_by_adversarial_event_id` | `uuid` |  |  |
| `fee_name` | `text` |  |  |
| `amount` | `numeric(12,2)` | ✓ |  |
| `frequency` | `text` | ✓ |  |
| `variant_type` | `text` | ✓ |  |
| `coverage_tier` | `text` | ✓ |  |
| `batch_id` | `text` | ✓ |  |
| `rolled_back_at` | `timestamp with time zone` | ✓ |  |
| `rolled_back_by_batch_id` | `text` | ✓ |  |
| `rolled_back_reason` | `text` | ✓ |  |

**Indexes:**
- `fees_published_batch_idx`
- `fees_published_canonical_institution_idx`
- `fees_published_institution_time_idx`
- `fees_published_lineage_idx`
- `fees_published_live_idx`

**Check constraints:**
- `fees_published_coverage_tier_check`: `CHECK (((coverage_tier = ANY (ARRAY['strong'::text, 'provisional'::text, 'insufficient'::text])) OR (coverage_tier IS NULL)))`

<details><summary>DDL</summary>

```sql
CREATE TABLE public."fees_published" (
  "fee_published_id" bigint NOT NULL DEFAULT nextval('fees_published_fee_published_id_seq'::regclass),
  "published_at" timestamp with time zone NOT NULL DEFAULT now(),
  "lineage_ref" bigint NOT NULL,
  "institution_id" integer NOT NULL,
  "canonical_fee_key" text NOT NULL,
  "source_url" text,
  "document_r2_key" text,
  "extraction_confidence" numeric(5,4),
  "agent_event_id" uuid,
  "verified_by_agent_event_id" uuid,
  "published_by_adversarial_event_id" uuid NOT NULL,
  "fee_name" text NOT NULL,
  "amount" numeric(12,2),
  "frequency" text,
  "variant_type" text,
  "coverage_tier" text,
  "batch_id" text,
  "rolled_back_at" timestamp with time zone,
  "rolled_back_by_batch_id" text,
  "rolled_back_reason" text,
  PRIMARY KEY ("fee_published_id")
);
ALTER TABLE public."fees_published" ADD CONSTRAINT "fees_published_lineage_ref_fkey" FOREIGN KEY ("lineage_ref") REFERENCES public."fees_verified" ("fee_verified_id");
ALTER TABLE public."fees_published" ADD CONSTRAINT "fees_published_coverage_tier_check" CHECK (((coverage_tier = ANY (ARRAY['strong'::text, 'provisional'::text, 'insufficient'::text])) OR (coverage_tier IS NULL)));
```

</details>

### <a id="fees-published-rollback-log"></a>`fees_published_rollback_log`

*Audit log of fees_published rollback invocations (dry-run + execute). One row per CLI call.*

**Rows:** 0 · **PK:** `rollback_id`

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `rollback_id` | `bigint` |  | `nextval('fees_published_rollback_log_rollback_id_seq'::re...` |
| `created_at` | `timestamp with time zone` |  | `now()` |
| `batch_id` | `text` |  |  |
| `rolled_back_by` | `text` |  |  |
| `affected_count` | `integer` |  |  |
| `reason` | `text` | ✓ |  |
| `dry_run` | `boolean` |  | `true` |
| `category_breakdown` | `jsonb` |  | `'{}'::jsonb` |
| `rollback_token` | `text` |  |  |

**Indexes:**
- `fees_published_rollback_log_batch_idx`
- `fees_published_rollback_log_rollback_token_key` (unique)

<details><summary>DDL</summary>

```sql
CREATE TABLE public."fees_published_rollback_log" (
  "rollback_id" bigint NOT NULL DEFAULT nextval('fees_published_rollback_log_rollback_id_seq'::regclass),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "batch_id" text NOT NULL,
  "rolled_back_by" text NOT NULL,
  "affected_count" integer NOT NULL,
  "reason" text,
  "dry_run" boolean NOT NULL DEFAULT true,
  "category_breakdown" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "rollback_token" text NOT NULL,
  PRIMARY KEY ("rollback_id"),
  CONSTRAINT "fees_published_rollback_log_rollback_token_key" UNIQUE ("rollback_token")
);
```

</details>

### <a id="fees-raw"></a>`fees_raw`

*Phase 62a TIER-01 Raw: append-only fees from Knox state agents + one-shot migration backfill (plan 62A-12). Immutable amount fields; outlier_flags may be updated.*

**Rows:** 102,965 · **PK:** `fee_raw_id`

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `fee_raw_id` | `bigint` |  | `nextval('fees_raw_fee_raw_id_seq'::regclass)` |
| `created_at` | `timestamp with time zone` |  | `now()` |
| `institution_id` | `integer` |  |  |
| `crawl_event_id` | `integer` | ✓ |  |
| `document_r2_key` | `text` | ✓ |  |
| `source_url` | `text` | ✓ |  |
| `extraction_confidence` | `numeric(5,4)` | ✓ |  |
| `agent_event_id` | `uuid` |  |  |
| `fee_name` | `text` |  |  |
| `amount` | `numeric(12,2)` | ✓ |  |
| `frequency` | `text` | ✓ |  |
| `conditions` | `text` | ✓ |  |
| `outlier_flags` | `jsonb` |  | `'[]'::jsonb` |
| `source` | `text` |  | `'knox'::text` |

**Indexes:**
- `fees_raw_agent_event_idx`
- `fees_raw_backfill_dedup_idx` (unique)
- `fees_raw_institution_time_idx`
- `fees_raw_lineage_missing_idx`
- `fees_raw_source_idx`

**Check constraints:**
- `fees_raw_source_check`: `CHECK ((source = ANY (ARRAY['knox'::text, 'migration_v10'::text, 'manual_import'::text])))`

<details><summary>DDL</summary>

```sql
CREATE TABLE public."fees_raw" (
  "fee_raw_id" bigint NOT NULL DEFAULT nextval('fees_raw_fee_raw_id_seq'::regclass),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "institution_id" integer NOT NULL,
  "crawl_event_id" integer,
  "document_r2_key" text,
  "source_url" text,
  "extraction_confidence" numeric(5,4),
  "agent_event_id" uuid NOT NULL,
  "fee_name" text NOT NULL,
  "amount" numeric(12,2),
  "frequency" text,
  "conditions" text,
  "outlier_flags" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "source" text NOT NULL DEFAULT 'knox'::text,
  PRIMARY KEY ("fee_raw_id")
);
ALTER TABLE public."fees_raw" ADD CONSTRAINT "fees_raw_source_check" CHECK ((source = ANY (ARRAY['knox'::text, 'migration_v10'::text, 'manual_import'::text])));
```

</details>

### <a id="fees-verified"></a>`fees_verified`

*Phase 62a TIER-02 Business: Darwin-verified fees; canonical_fee_key NOT NULL. Promoted from fees_raw via promote_to_tier2().*

**Rows:** 1,333 · **PK:** `fee_verified_id` · **FK → :** `fees_raw`

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `fee_verified_id` | `bigint` |  | `nextval('fees_verified_fee_verified_id_seq'::regclass)` |
| `created_at` | `timestamp with time zone` |  | `now()` |
| `fee_raw_id` | `bigint` |  |  |
| `institution_id` | `integer` |  |  |
| `source_url` | `text` | ✓ |  |
| `document_r2_key` | `text` | ✓ |  |
| `extraction_confidence` | `numeric(5,4)` | ✓ |  |
| `canonical_fee_key` | `text` |  |  |
| `variant_type` | `text` | ✓ |  |
| `outlier_flags` | `jsonb` |  | `'[]'::jsonb` |
| `verified_by_agent_event_id` | `uuid` |  |  |
| `fee_name` | `text` |  |  |
| `amount` | `numeric(12,2)` | ✓ |  |
| `frequency` | `text` | ✓ |  |
| `review_status` | `text` |  | `'verified'::text` |

**Indexes:**
- `fees_verified_canonical_institution_idx`
- `fees_verified_raw_idx`
- `fees_verified_status_idx`

**Check constraints:**
- `fees_verified_review_status_check`: `CHECK ((review_status = ANY (ARRAY['verified'::text, 'challenged'::text, 'rejected'::text, 'approved'::text])))`

<details><summary>DDL</summary>

```sql
CREATE TABLE public."fees_verified" (
  "fee_verified_id" bigint NOT NULL DEFAULT nextval('fees_verified_fee_verified_id_seq'::regclass),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "fee_raw_id" bigint NOT NULL,
  "institution_id" integer NOT NULL,
  "source_url" text,
  "document_r2_key" text,
  "extraction_confidence" numeric(5,4),
  "canonical_fee_key" text NOT NULL,
  "variant_type" text,
  "outlier_flags" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "verified_by_agent_event_id" uuid NOT NULL,
  "fee_name" text NOT NULL,
  "amount" numeric(12,2),
  "frequency" text,
  "review_status" text NOT NULL DEFAULT 'verified'::text,
  PRIMARY KEY ("fee_verified_id")
);
ALTER TABLE public."fees_verified" ADD CONSTRAINT "fees_verified_fee_raw_id_fkey" FOREIGN KEY ("fee_raw_id") REFERENCES public."fees_raw" ("fee_raw_id");
ALTER TABLE public."fees_verified" ADD CONSTRAINT "fees_verified_review_status_check" CHECK ((review_status = ANY (ARRAY['verified'::text, 'challenged'::text, 'rejected'::text, 'approved'::text])));
```

</details>

### <a id="gold-standard-fees"></a>`gold_standard_fees`

**Rows:** 0 · **PK:** `id` · **FK → :** `crawl_targets`

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `id` | `bigint` |  | `nextval('gold_standard_fees_id_seq'::regclass)` |
| `crawl_target_id` | `bigint` |  |  |
| `fee_name` | `text` |  |  |
| `amount` | `double precision` | ✓ |  |
| `fee_category` | `text` | ✓ |  |
| `source_url` | `text` | ✓ |  |
| `verified_by` | `text` | ✓ |  |
| `verified_at` | `timestamp with time zone` |  | `now()` |
| `notes` | `text` | ✓ |  |

<details><summary>DDL</summary>

```sql
CREATE TABLE public."gold_standard_fees" (
  "id" bigint NOT NULL DEFAULT nextval('gold_standard_fees_id_seq'::regclass),
  "crawl_target_id" bigint NOT NULL,
  "fee_name" text NOT NULL,
  "amount" double precision,
  "fee_category" text,
  "source_url" text,
  "verified_by" text,
  "verified_at" timestamp with time zone NOT NULL DEFAULT now(),
  "notes" text,
  PRIMARY KEY ("id")
);
ALTER TABLE public."gold_standard_fees" ADD CONSTRAINT "gold_standard_fees_crawl_target_id_fkey" FOREIGN KEY ("crawl_target_id") REFERENCES public."crawl_targets" ("id");
```

</details>

### <a id="published-reports"></a>`published_reports`

**Rows:** 0 · **PK:** `id` · **FK → :** `report_jobs`

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `id` | `uuid` |  | `gen_random_uuid()` |
| `job_id` | `uuid` | ✓ |  |
| `report_type` | `text` |  |  |
| `slug` | `text` |  |  |
| `title` | `text` |  |  |
| `published_at` | `timestamp with time zone` |  | `now()` |
| `is_public` | `boolean` |  | `false` |
| `summary` | `text` | ✓ |  |
| `body` | `text` | ✓ |  |
| `published_by` | `text` | ✓ |  |
| `status` | `text` | ✓ |  |

**Indexes:**
- `published_reports_slug_key` (unique)

<details><summary>DDL</summary>

```sql
CREATE TABLE public."published_reports" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "job_id" uuid,
  "report_type" text NOT NULL,
  "slug" text NOT NULL,
  "title" text NOT NULL,
  "published_at" timestamp with time zone NOT NULL DEFAULT now(),
  "is_public" boolean NOT NULL DEFAULT false,
  "summary" text,
  "body" text,
  "published_by" text,
  "status" text,
  PRIMARY KEY ("id"),
  CONSTRAINT "published_reports_slug_key" UNIQUE ("slug")
);
ALTER TABLE public."published_reports" ADD CONSTRAINT "published_reports_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES public."report_jobs" ("id");
```

</details>

---

## Crawler state & artifacts

### <a id="crawl-results"></a>`crawl_results`

**Rows:** 9,617 · **PK:** `id` · **FK → :** `crawl_runs`, `crawl_targets`

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `id` | `bigint` |  | `nextval('crawl_results_id_seq'::regclass)` |
| `crawl_run_id` | `bigint` | ✓ |  |
| `crawl_target_id` | `bigint` |  |  |
| `status` | `text` |  |  |
| `document_url` | `text` | ✓ |  |
| `document_path` | `text` | ✓ |  |
| `content_hash` | `text` | ✓ |  |
| `fees_extracted` | `integer` |  | `0` |
| `error_message` | `text` | ✓ |  |
| `crawled_at` | `timestamp with time zone` |  | `now()` |
| `status_code` | `integer` | ✓ |  |

**Indexes:**
- `idx_crawl_results_date`
- `idx_crawl_results_target`

<details><summary>DDL</summary>

```sql
CREATE TABLE public."crawl_results" (
  "id" bigint NOT NULL DEFAULT nextval('crawl_results_id_seq'::regclass),
  "crawl_run_id" bigint,
  "crawl_target_id" bigint NOT NULL,
  "status" text NOT NULL,
  "document_url" text,
  "document_path" text,
  "content_hash" text,
  "fees_extracted" integer NOT NULL DEFAULT 0,
  "error_message" text,
  "crawled_at" timestamp with time zone NOT NULL DEFAULT now(),
  "status_code" integer,
  PRIMARY KEY ("id")
);
ALTER TABLE public."crawl_results" ADD CONSTRAINT "crawl_results_crawl_run_id_fkey" FOREIGN KEY ("crawl_run_id") REFERENCES public."crawl_runs" ("id");
ALTER TABLE public."crawl_results" ADD CONSTRAINT "crawl_results_crawl_target_id_fkey" FOREIGN KEY ("crawl_target_id") REFERENCES public."crawl_targets" ("id");
```

</details>

### <a id="crawl-runs"></a>`crawl_runs`

**Rows:** 81 · **PK:** `id`

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `id` | `bigint` |  | `nextval('crawl_runs_id_seq'::regclass)` |
| `trigger_type` | `text` |  | `'scheduled'::text` |
| `status` | `text` |  | `'running'::text` |
| `targets_total` | `integer` |  | `0` |
| `targets_crawled` | `integer` |  | `0` |
| `targets_succeeded` | `integer` |  | `0` |
| `targets_failed` | `integer` |  | `0` |
| `targets_unchanged` | `integer` |  | `0` |
| `fees_extracted` | `integer` |  | `0` |
| `started_at` | `timestamp with time zone` |  | `now()` |
| `completed_at` | `timestamp with time zone` | ✓ |  |
| `trigger` | `text` | ✓ |  |

<details><summary>DDL</summary>

```sql
CREATE TABLE public."crawl_runs" (
  "id" bigint NOT NULL DEFAULT nextval('crawl_runs_id_seq'::regclass),
  "trigger_type" text NOT NULL DEFAULT 'scheduled'::text,
  "status" text NOT NULL DEFAULT 'running'::text,
  "targets_total" integer NOT NULL DEFAULT 0,
  "targets_crawled" integer NOT NULL DEFAULT 0,
  "targets_succeeded" integer NOT NULL DEFAULT 0,
  "targets_failed" integer NOT NULL DEFAULT 0,
  "targets_unchanged" integer NOT NULL DEFAULT 0,
  "fees_extracted" integer NOT NULL DEFAULT 0,
  "started_at" timestamp with time zone NOT NULL DEFAULT now(),
  "completed_at" timestamp with time zone,
  "trigger" text,
  PRIMARY KEY ("id")
);
```

</details>

### <a id="discovery-cache"></a>`discovery_cache`

**Rows:** 0 · **PK:** `id` · **FK → :** `crawl_targets`

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `id` | `bigint` |  | `nextval('discovery_cache_id_seq'::regclass)` |
| `crawl_target_id` | `bigint` |  |  |
| `discovery_method` | `text` |  |  |
| `attempted_at` | `timestamp with time zone` |  | `now()` |
| `result` | `text` |  |  |
| `found_url` | `text` | ✓ |  |
| `error_message` | `text` | ✓ |  |

**Indexes:**
- `discovery_cache_crawl_target_id_discovery_method_key` (unique)
- `idx_discovery_cache_target`

<details><summary>DDL</summary>

```sql
CREATE TABLE public."discovery_cache" (
  "id" bigint NOT NULL DEFAULT nextval('discovery_cache_id_seq'::regclass),
  "crawl_target_id" bigint NOT NULL,
  "discovery_method" text NOT NULL,
  "attempted_at" timestamp with time zone NOT NULL DEFAULT now(),
  "result" text NOT NULL,
  "found_url" text,
  "error_message" text,
  PRIMARY KEY ("id"),
  CONSTRAINT "discovery_cache_crawl_target_id_discovery_method_key" UNIQUE ("crawl_target_id", "discovery_method")
);
ALTER TABLE public."discovery_cache" ADD CONSTRAINT "discovery_cache_crawl_target_id_fkey" FOREIGN KEY ("crawl_target_id") REFERENCES public."crawl_targets" ("id");
```

</details>

---

## Agent runtime & audit

### <a id="agent-auth-log-2026-04"></a>`agent_auth_log_2026_04`

**Rows:** 8,141 · **PK:** `auth_id, created_at`

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `auth_id` | `uuid` |  | `gen_random_uuid()` |
| `created_at` | `timestamp with time zone` |  | `now()` |
| `agent_event_id` | `uuid` |  |  |
| `agent_name` | `text` |  |  |
| `actor_type` | `text` |  |  |
| `actor_id` | `text` | ✓ |  |
| `tool_name` | `text` |  |  |
| `entity` | `text` |  |  |
| `entity_id` | `text` | ✓ |  |
| `before_value` | `jsonb` | ✓ |  |
| `after_value` | `jsonb` | ✓ |  |
| `reasoning_hash` | `bytea` | ✓ |  |
| `parent_event_id` | `uuid` | ✓ |  |

**Indexes:**
- `agent_auth_log_2026_04_agent_event_id_idx`
- `agent_auth_log_2026_04_agent_name_created_at_idx`
- `agent_auth_log_2026_04_entity_entity_id_created_at_idx`

**Check constraints:**
- `agent_auth_log_actor_type_check`: `CHECK ((actor_type = ANY (ARRAY['agent'::text, 'user'::text, 'system'::text])))`

<details><summary>DDL</summary>

```sql
CREATE TABLE public."agent_auth_log_2026_04" (
  "auth_id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "agent_event_id" uuid NOT NULL,
  "agent_name" text NOT NULL,
  "actor_type" text NOT NULL,
  "actor_id" text,
  "tool_name" text NOT NULL,
  "entity" text NOT NULL,
  "entity_id" text,
  "before_value" jsonb,
  "after_value" jsonb,
  "reasoning_hash" bytea,
  "parent_event_id" uuid,
  PRIMARY KEY ("auth_id", "created_at")
);
ALTER TABLE public."agent_auth_log_2026_04" ADD CONSTRAINT "agent_auth_log_actor_type_check" CHECK ((actor_type = ANY (ARRAY['agent'::text, 'user'::text, 'system'::text])));
```

</details>

### <a id="agent-auth-log-2026-05"></a>`agent_auth_log_2026_05`

**Rows:** 0 · **PK:** `auth_id, created_at`

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `auth_id` | `uuid` |  | `gen_random_uuid()` |
| `created_at` | `timestamp with time zone` |  | `now()` |
| `agent_event_id` | `uuid` |  |  |
| `agent_name` | `text` |  |  |
| `actor_type` | `text` |  |  |
| `actor_id` | `text` | ✓ |  |
| `tool_name` | `text` |  |  |
| `entity` | `text` |  |  |
| `entity_id` | `text` | ✓ |  |
| `before_value` | `jsonb` | ✓ |  |
| `after_value` | `jsonb` | ✓ |  |
| `reasoning_hash` | `bytea` | ✓ |  |
| `parent_event_id` | `uuid` | ✓ |  |

**Indexes:**
- `agent_auth_log_2026_05_agent_event_id_idx`
- `agent_auth_log_2026_05_agent_name_created_at_idx`
- `agent_auth_log_2026_05_entity_entity_id_created_at_idx`

**Check constraints:**
- `agent_auth_log_actor_type_check`: `CHECK ((actor_type = ANY (ARRAY['agent'::text, 'user'::text, 'system'::text])))`

<details><summary>DDL</summary>

```sql
CREATE TABLE public."agent_auth_log_2026_05" (
  "auth_id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "agent_event_id" uuid NOT NULL,
  "agent_name" text NOT NULL,
  "actor_type" text NOT NULL,
  "actor_id" text,
  "tool_name" text NOT NULL,
  "entity" text NOT NULL,
  "entity_id" text,
  "before_value" jsonb,
  "after_value" jsonb,
  "reasoning_hash" bytea,
  "parent_event_id" uuid,
  PRIMARY KEY ("auth_id", "created_at")
);
ALTER TABLE public."agent_auth_log_2026_05" ADD CONSTRAINT "agent_auth_log_actor_type_check" CHECK ((actor_type = ANY (ARRAY['agent'::text, 'user'::text, 'system'::text])));
```

</details>

### <a id="agent-auth-log-default"></a>`agent_auth_log_default`

**Rows:** 0 · **PK:** `auth_id, created_at`

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `auth_id` | `uuid` |  | `gen_random_uuid()` |
| `created_at` | `timestamp with time zone` |  | `now()` |
| `agent_event_id` | `uuid` |  |  |
| `agent_name` | `text` |  |  |
| `actor_type` | `text` |  |  |
| `actor_id` | `text` | ✓ |  |
| `tool_name` | `text` |  |  |
| `entity` | `text` |  |  |
| `entity_id` | `text` | ✓ |  |
| `before_value` | `jsonb` | ✓ |  |
| `after_value` | `jsonb` | ✓ |  |
| `reasoning_hash` | `bytea` | ✓ |  |
| `parent_event_id` | `uuid` | ✓ |  |

**Indexes:**
- `agent_auth_log_default_agent_event_id_idx`
- `agent_auth_log_default_agent_name_created_at_idx`
- `agent_auth_log_default_entity_entity_id_created_at_idx`

**Check constraints:**
- `agent_auth_log_actor_type_check`: `CHECK ((actor_type = ANY (ARRAY['agent'::text, 'user'::text, 'system'::text])))`

<details><summary>DDL</summary>

```sql
CREATE TABLE public."agent_auth_log_default" (
  "auth_id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "agent_event_id" uuid NOT NULL,
  "agent_name" text NOT NULL,
  "actor_type" text NOT NULL,
  "actor_id" text,
  "tool_name" text NOT NULL,
  "entity" text NOT NULL,
  "entity_id" text,
  "before_value" jsonb,
  "after_value" jsonb,
  "reasoning_hash" bytea,
  "parent_event_id" uuid,
  PRIMARY KEY ("auth_id", "created_at")
);
ALTER TABLE public."agent_auth_log_default" ADD CONSTRAINT "agent_auth_log_actor_type_check" CHECK ((actor_type = ANY (ARRAY['agent'::text, 'user'::text, 'system'::text])));
```

</details>

### <a id="agent-budgets"></a>`agent_budgets`

*Phase 62a AGENT-05: per-agent cost quota. Gateway reads limit_cents (env override > this row > config.yaml fallback); gateway writes spent_cents + halted_at. Direct UPDATE tools forbidden — only gateway internals.*

**Rows:** 56 · **PK:** `agent_name, budget_window` · **FK → :** `agent_registry`

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `agent_name` | `text` |  |  |
| `budget_window` | `text` |  |  |
| `limit_cents` | `integer` |  |  |
| `spent_cents` | `integer` |  | `0` |
| `window_started_at` | `timestamp with time zone` |  | `now()` |
| `halted_at` | `timestamp with time zone` | ✓ |  |
| `halted_reason` | `text` | ✓ |  |
| `updated_at` | `timestamp with time zone` |  | `now()` |

**Indexes:**
- `agent_budgets_halted_idx`

**Check constraints:**
- `agent_budgets_budget_window_check`: `CHECK ((budget_window = ANY (ARRAY['per_cycle'::text, 'per_batch'::text, 'per_report'::text, 'per_day'::text, 'per_month'::text])))`
- `agent_budgets_limit_cents_check`: `CHECK ((limit_cents >= 0))`
- `agent_budgets_spent_cents_check`: `CHECK ((spent_cents >= 0))`

<details><summary>DDL</summary>

```sql
CREATE TABLE public."agent_budgets" (
  "agent_name" text NOT NULL,
  "budget_window" text NOT NULL,
  "limit_cents" integer NOT NULL,
  "spent_cents" integer NOT NULL DEFAULT 0,
  "window_started_at" timestamp with time zone NOT NULL DEFAULT now(),
  "halted_at" timestamp with time zone,
  "halted_reason" text,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("agent_name", "budget_window")
);
ALTER TABLE public."agent_budgets" ADD CONSTRAINT "agent_budgets_agent_name_fkey" FOREIGN KEY ("agent_name") REFERENCES public."agent_registry" ("agent_name") ON DELETE CASCADE;
ALTER TABLE public."agent_budgets" ADD CONSTRAINT "agent_budgets_budget_window_check" CHECK ((budget_window = ANY (ARRAY['per_cycle'::text, 'per_batch'::text, 'per_report'::text, 'per_day'::text, 'per_month'::text])));
ALTER TABLE public."agent_budgets" ADD CONSTRAINT "agent_budgets_limit_cents_check" CHECK ((limit_cents >= 0));
ALTER TABLE public."agent_budgets" ADD CONSTRAINT "agent_budgets_spent_cents_check" CHECK ((spent_cents >= 0));
```

</details>

### <a id="agent-events-2026-04"></a>`agent_events_2026_04`

**Rows:** 10,896 · **PK:** `event_id, created_at`

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `event_id` | `uuid` |  | `gen_random_uuid()` |
| `created_at` | `timestamp with time zone` |  | `now()` |
| `agent_name` | `text` |  |  |
| `action` | `text` |  |  |
| `tool_name` | `text` | ✓ |  |
| `entity` | `text` | ✓ |  |
| `entity_id` | `text` | ✓ |  |
| `status` | `text` |  |  |
| `cost_cents` | `integer` |  | `0` |
| `confidence` | `numeric(5,4)` | ✓ |  |
| `parent_event_id` | `uuid` | ✓ |  |
| `correlation_id` | `uuid` |  | `gen_random_uuid()` |
| `reasoning_hash` | `bytea` | ✓ |  |
| `input_payload` | `jsonb` | ✓ |  |
| `output_payload` | `jsonb` | ✓ |  |
| `source_refs` | `jsonb` | ✓ |  |
| `error` | `jsonb` | ✓ |  |
| `is_shadow` | `boolean` |  | `false` |
| `reasoning_prompt_text` | `text` | ✓ |  |
| `reasoning_output_text` | `text` | ✓ |  |
| `reasoning_r2_key` | `text` | ✓ |  |

**Indexes:**
- `agent_events_2026_04_agent_name_created_at_idx`
- `agent_events_2026_04_correlation_id_idx`
- `agent_events_2026_04_entity_entity_id_idx`
- `agent_events_2026_04_is_shadow_idx`
- `agent_events_2026_04_parent_event_id_idx`
- `agent_events_2026_04_tool_name_status_idx`

**Check constraints:**
- `agent_events_status_check`: `CHECK ((status = ANY (ARRAY['pending'::text, 'in_progress'::text, 'success'::text, 'error'::text, 'budget_halt'::text, 'improve_rejected'::text, 'shadow_diff'::text])))`

<details><summary>DDL</summary>

```sql
CREATE TABLE public."agent_events_2026_04" (
  "event_id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "agent_name" text NOT NULL,
  "action" text NOT NULL,
  "tool_name" text,
  "entity" text,
  "entity_id" text,
  "status" text NOT NULL,
  "cost_cents" integer NOT NULL DEFAULT 0,
  "confidence" numeric(5,4),
  "parent_event_id" uuid,
  "correlation_id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "reasoning_hash" bytea,
  "input_payload" jsonb,
  "output_payload" jsonb,
  "source_refs" jsonb,
  "error" jsonb,
  "is_shadow" boolean NOT NULL DEFAULT false,
  "reasoning_prompt_text" text,
  "reasoning_output_text" text,
  "reasoning_r2_key" text,
  PRIMARY KEY ("event_id", "created_at")
);
ALTER TABLE public."agent_events_2026_04" ADD CONSTRAINT "agent_events_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'in_progress'::text, 'success'::text, 'error'::text, 'budget_halt'::text, 'improve_rejected'::text, 'shadow_diff'::text])));
```

</details>

### <a id="agent-events-2026-05"></a>`agent_events_2026_05`

**Rows:** 0 · **PK:** `event_id, created_at`

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `event_id` | `uuid` |  | `gen_random_uuid()` |
| `created_at` | `timestamp with time zone` |  | `now()` |
| `agent_name` | `text` |  |  |
| `action` | `text` |  |  |
| `tool_name` | `text` | ✓ |  |
| `entity` | `text` | ✓ |  |
| `entity_id` | `text` | ✓ |  |
| `status` | `text` |  |  |
| `cost_cents` | `integer` |  | `0` |
| `confidence` | `numeric(5,4)` | ✓ |  |
| `parent_event_id` | `uuid` | ✓ |  |
| `correlation_id` | `uuid` |  | `gen_random_uuid()` |
| `reasoning_hash` | `bytea` | ✓ |  |
| `input_payload` | `jsonb` | ✓ |  |
| `output_payload` | `jsonb` | ✓ |  |
| `source_refs` | `jsonb` | ✓ |  |
| `error` | `jsonb` | ✓ |  |
| `is_shadow` | `boolean` |  | `false` |
| `reasoning_prompt_text` | `text` | ✓ |  |
| `reasoning_output_text` | `text` | ✓ |  |
| `reasoning_r2_key` | `text` | ✓ |  |

**Indexes:**
- `agent_events_2026_05_agent_name_created_at_idx`
- `agent_events_2026_05_correlation_id_idx`
- `agent_events_2026_05_entity_entity_id_idx`
- `agent_events_2026_05_is_shadow_idx`
- `agent_events_2026_05_parent_event_id_idx`
- `agent_events_2026_05_tool_name_status_idx`

**Check constraints:**
- `agent_events_status_check`: `CHECK ((status = ANY (ARRAY['pending'::text, 'in_progress'::text, 'success'::text, 'error'::text, 'budget_halt'::text, 'improve_rejected'::text, 'shadow_diff'::text])))`

<details><summary>DDL</summary>

```sql
CREATE TABLE public."agent_events_2026_05" (
  "event_id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "agent_name" text NOT NULL,
  "action" text NOT NULL,
  "tool_name" text,
  "entity" text,
  "entity_id" text,
  "status" text NOT NULL,
  "cost_cents" integer NOT NULL DEFAULT 0,
  "confidence" numeric(5,4),
  "parent_event_id" uuid,
  "correlation_id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "reasoning_hash" bytea,
  "input_payload" jsonb,
  "output_payload" jsonb,
  "source_refs" jsonb,
  "error" jsonb,
  "is_shadow" boolean NOT NULL DEFAULT false,
  "reasoning_prompt_text" text,
  "reasoning_output_text" text,
  "reasoning_r2_key" text,
  PRIMARY KEY ("event_id", "created_at")
);
ALTER TABLE public."agent_events_2026_05" ADD CONSTRAINT "agent_events_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'in_progress'::text, 'success'::text, 'error'::text, 'budget_halt'::text, 'improve_rejected'::text, 'shadow_diff'::text])));
```

</details>

### <a id="agent-events-default"></a>`agent_events_default`

**Rows:** 0 · **PK:** `event_id, created_at`

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `event_id` | `uuid` |  | `gen_random_uuid()` |
| `created_at` | `timestamp with time zone` |  | `now()` |
| `agent_name` | `text` |  |  |
| `action` | `text` |  |  |
| `tool_name` | `text` | ✓ |  |
| `entity` | `text` | ✓ |  |
| `entity_id` | `text` | ✓ |  |
| `status` | `text` |  |  |
| `cost_cents` | `integer` |  | `0` |
| `confidence` | `numeric(5,4)` | ✓ |  |
| `parent_event_id` | `uuid` | ✓ |  |
| `correlation_id` | `uuid` |  | `gen_random_uuid()` |
| `reasoning_hash` | `bytea` | ✓ |  |
| `input_payload` | `jsonb` | ✓ |  |
| `output_payload` | `jsonb` | ✓ |  |
| `source_refs` | `jsonb` | ✓ |  |
| `error` | `jsonb` | ✓ |  |
| `is_shadow` | `boolean` |  | `false` |
| `reasoning_prompt_text` | `text` | ✓ |  |
| `reasoning_output_text` | `text` | ✓ |  |
| `reasoning_r2_key` | `text` | ✓ |  |

**Indexes:**
- `agent_events_default_agent_name_created_at_idx`
- `agent_events_default_correlation_id_idx`
- `agent_events_default_entity_entity_id_idx`
- `agent_events_default_is_shadow_idx`
- `agent_events_default_parent_event_id_idx`
- `agent_events_default_tool_name_status_idx`

**Check constraints:**
- `agent_events_status_check`: `CHECK ((status = ANY (ARRAY['pending'::text, 'in_progress'::text, 'success'::text, 'error'::text, 'budget_halt'::text, 'improve_rejected'::text, 'shadow_diff'::text])))`

<details><summary>DDL</summary>

```sql
CREATE TABLE public."agent_events_default" (
  "event_id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "agent_name" text NOT NULL,
  "action" text NOT NULL,
  "tool_name" text,
  "entity" text,
  "entity_id" text,
  "status" text NOT NULL,
  "cost_cents" integer NOT NULL DEFAULT 0,
  "confidence" numeric(5,4),
  "parent_event_id" uuid,
  "correlation_id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "reasoning_hash" bytea,
  "input_payload" jsonb,
  "output_payload" jsonb,
  "source_refs" jsonb,
  "error" jsonb,
  "is_shadow" boolean NOT NULL DEFAULT false,
  "reasoning_prompt_text" text,
  "reasoning_output_text" text,
  "reasoning_r2_key" text,
  PRIMARY KEY ("event_id", "created_at")
);
ALTER TABLE public."agent_events_default" ADD CONSTRAINT "agent_events_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'in_progress'::text, 'success'::text, 'error'::text, 'budget_halt'::text, 'improve_rejected'::text, 'shadow_diff'::text])));
```

</details>

### <a id="agent-health-rollup"></a>`agent_health_rollup`

*Phase 62b OBS-05: per-agent 15-minute health metrics (loop_completion_rate, review_latency_seconds, pattern_promotion_rate, confidence_drift, cost_to_value_ratio). Refreshed by refresh_agent_health_rollup() on pg_cron.*

**Rows:** 924 · **PK:** `agent_name, bucket_start` · **FK → :** `agent_registry`

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `bucket_start` | `timestamp with time zone` |  |  |
| `agent_name` | `text` |  |  |
| `loop_completion_rate` | `numeric(5,4)` | ✓ |  |
| `review_latency_seconds` | `integer` | ✓ |  |
| `pattern_promotion_rate` | `numeric(5,4)` | ✓ |  |
| `confidence_drift` | `numeric(6,4)` | ✓ |  |
| `cost_to_value_ratio` | `numeric(10,4)` | ✓ |  |
| `events_total` | `integer` | ✓ |  |

<details><summary>DDL</summary>

```sql
CREATE TABLE public."agent_health_rollup" (
  "bucket_start" timestamp with time zone NOT NULL,
  "agent_name" text NOT NULL,
  "loop_completion_rate" numeric(5,4),
  "review_latency_seconds" integer,
  "pattern_promotion_rate" numeric(5,4),
  "confidence_drift" numeric(6,4),
  "cost_to_value_ratio" numeric(10,4),
  "events_total" integer,
  PRIMARY KEY ("agent_name", "bucket_start")
);
ALTER TABLE public."agent_health_rollup" ADD CONSTRAINT "agent_health_rollup_agent_name_fkey" FOREIGN KEY ("agent_name") REFERENCES public."agent_registry" ("agent_name");
```

</details>

### <a id="agent-lessons"></a>`agent_lessons`

*Phase 62b LOOP-05: named, generalizable lessons produced by AgentBase.understand(). Superseded rows preserved for audit.*

**Rows:** 0 · **PK:** `lesson_id` · **FK → :** `agent_lessons`, `agent_registry`

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `lesson_id` | `bigint` |  | `nextval('agent_lessons_lesson_id_seq'::regclass)` |
| `created_at` | `timestamp with time zone` |  | `now()` |
| `agent_name` | `text` |  |  |
| `lesson_name` | `text` |  |  |
| `description` | `text` |  |  |
| `evidence_refs` | `jsonb` |  | `'[]'::jsonb` |
| `confidence` | `numeric(5,4)` | ✓ |  |
| `superseded_by` | `bigint` | ✓ |  |
| `source_event_id` | `uuid` | ✓ |  |

**Indexes:**
- `agent_lessons_active_idx`
- `agent_lessons_agent_idx`
- `agent_lessons_agent_name_lesson_name_key` (unique)

<details><summary>DDL</summary>

```sql
CREATE TABLE public."agent_lessons" (
  "lesson_id" bigint NOT NULL DEFAULT nextval('agent_lessons_lesson_id_seq'::regclass),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "agent_name" text NOT NULL,
  "lesson_name" text NOT NULL,
  "description" text NOT NULL,
  "evidence_refs" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "confidence" numeric(5,4),
  "superseded_by" bigint,
  "source_event_id" uuid,
  PRIMARY KEY ("lesson_id"),
  CONSTRAINT "agent_lessons_agent_name_lesson_name_key" UNIQUE ("agent_name", "lesson_name")
);
ALTER TABLE public."agent_lessons" ADD CONSTRAINT "agent_lessons_agent_name_fkey" FOREIGN KEY ("agent_name") REFERENCES public."agent_registry" ("agent_name");
ALTER TABLE public."agent_lessons" ADD CONSTRAINT "agent_lessons_superseded_by_fkey" FOREIGN KEY ("superseded_by") REFERENCES public."agent_lessons" ("lesson_id");
```

</details>

### <a id="agent-messages"></a>`agent_messages`

*Phase 62a: empty table. Phase 62b wires handshake protocol (Darwin<->Knox challenge/prove/accept/reject, Atlas escalation on N unresolved rounds).*

**Rows:** 1,836 · **PK:** `message_id` · **FK → :** `agent_messages`

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `message_id` | `uuid` |  | `gen_random_uuid()` |
| `created_at` | `timestamp with time zone` |  | `now()` |
| `sender_agent` | `text` |  |  |
| `recipient_agent` | `text` |  |  |
| `intent` | `text` |  |  |
| `state` | `text` |  | `'open'::text` |
| `correlation_id` | `uuid` |  |  |
| `parent_message_id` | `uuid` | ✓ |  |
| `parent_event_id` | `uuid` | ✓ |  |
| `payload` | `jsonb` |  | `'{}'::jsonb` |
| `round_number` | `integer` |  | `1` |
| `expires_at` | `timestamp with time zone` | ✓ |  |
| `resolved_at` | `timestamp with time zone` | ✓ |  |
| `resolved_by_event_id` | `uuid` | ✓ |  |

**Indexes:**
- `agent_messages_accept_fee_verified_idx`
- `agent_messages_correlation_idx`
- `agent_messages_expires_idx`
- `agent_messages_recipient_state_idx`

**Check constraints:**
- `agent_messages_intent_check`: `CHECK ((intent = ANY (ARRAY['challenge'::text, 'prove'::text, 'accept'::text, 'reject'::text, 'escalate'::text, 'coverage_request'::text, 'clarify'::text])))`
- `agent_messages_state_check`: `CHECK ((state = ANY (ARRAY['open'::text, 'answered'::text, 'resolved'::text, 'escalated'::text, 'expired'::text])))`

<details><summary>DDL</summary>

```sql
CREATE TABLE public."agent_messages" (
  "message_id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "sender_agent" text NOT NULL,
  "recipient_agent" text NOT NULL,
  "intent" text NOT NULL,
  "state" text NOT NULL DEFAULT 'open'::text,
  "correlation_id" uuid NOT NULL,
  "parent_message_id" uuid,
  "parent_event_id" uuid,
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "round_number" integer NOT NULL DEFAULT 1,
  "expires_at" timestamp with time zone,
  "resolved_at" timestamp with time zone,
  "resolved_by_event_id" uuid,
  PRIMARY KEY ("message_id")
);
ALTER TABLE public."agent_messages" ADD CONSTRAINT "agent_messages_parent_message_id_fkey" FOREIGN KEY ("parent_message_id") REFERENCES public."agent_messages" ("message_id");
ALTER TABLE public."agent_messages" ADD CONSTRAINT "agent_messages_intent_check" CHECK ((intent = ANY (ARRAY['challenge'::text, 'prove'::text, 'accept'::text, 'reject'::text, 'escalate'::text, 'coverage_request'::text, 'clarify'::text])));
ALTER TABLE public."agent_messages" ADD CONSTRAINT "agent_messages_state_check" CHECK ((state = ANY (ARRAY['open'::text, 'answered'::text, 'resolved'::text, 'escalated'::text, 'expired'::text])));
```

</details>

### <a id="agent-registry"></a>`agent_registry`

*Phase 62a AGENT-05: canonical agent identity table. 4 top-level + 51 state agents seeded.*

**Rows:** 56 · **PK:** `agent_name` · **FK → :** `agent_registry`

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `agent_name` | `text` |  |  |
| `display_name` | `text` |  |  |
| `description` | `text` | ✓ |  |
| `role` | `text` |  |  |
| `parent_agent` | `text` | ✓ |  |
| `state_code` | `text` | ✓ |  |
| `is_active` | `boolean` |  | `true` |
| `last_run_at` | `timestamp with time zone` | ✓ |  |
| `created_at` | `timestamp with time zone` |  | `now()` |
| `lifecycle_state` | `text` |  | `'q1_validation'::text` |
| `review_schedule` | `text` | ✓ |  |

**Check constraints:**
- `agent_registry_check`: `CHECK ((((role = 'state_agent'::text) AND (state_code IS NOT NULL) AND (length(state_code) = 2)) OR ((role <> 'state_agent'::text) AND (state_code IS NULL))))`
- `agent_registry_lifecycle_state_check`: `CHECK ((lifecycle_state = ANY (ARRAY['q1_validation'::text, 'q2_high_confidence'::text, 'q3_autonomy'::text, 'paused'::text])))`
- `agent_registry_role_check`: `CHECK ((role = ANY (ARRAY['supervisor'::text, 'data'::text, 'classifier'::text, 'orchestrator'::text, 'analyst'::text, 'state_agent'::text])))`

<details><summary>DDL</summary>

```sql
CREATE TABLE public."agent_registry" (
  "agent_name" text NOT NULL,
  "display_name" text NOT NULL,
  "description" text,
  "role" text NOT NULL,
  "parent_agent" text,
  "state_code" text,
  "is_active" boolean NOT NULL DEFAULT true,
  "last_run_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "lifecycle_state" text NOT NULL DEFAULT 'q1_validation'::text,
  "review_schedule" text,
  PRIMARY KEY ("agent_name")
);
ALTER TABLE public."agent_registry" ADD CONSTRAINT "agent_registry_parent_agent_fkey" FOREIGN KEY ("parent_agent") REFERENCES public."agent_registry" ("agent_name");
ALTER TABLE public."agent_registry" ADD CONSTRAINT "agent_registry_check" CHECK ((((role = 'state_agent'::text) AND (state_code IS NOT NULL) AND (length(state_code) = 2)) OR ((role <> 'state_agent'::text) AND (state_code IS NULL))));
ALTER TABLE public."agent_registry" ADD CONSTRAINT "agent_registry_lifecycle_state_check" CHECK ((lifecycle_state = ANY (ARRAY['q1_validation'::text, 'q2_high_confidence'::text, 'q3_autonomy'::text, 'paused'::text])));
ALTER TABLE public."agent_registry" ADD CONSTRAINT "agent_registry_role_check" CHECK ((role = ANY (ARRAY['supervisor'::text, 'data'::text, 'classifier'::text, 'orchestrator'::text, 'analyst'::text, 'state_agent'::text])));
```

</details>

### <a id="agent-run-results"></a>`agent_run_results`

**Rows:** 77,334 · **PK:** `id` · **FK → :** `agent_runs`

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `id` | `integer` |  | `nextval('agent_run_results_id_seq'::regclass)` |
| `agent_run_id` | `integer` | ✓ |  |
| `crawl_target_id` | `integer` |  |  |
| `stage` | `text` |  |  |
| `status` | `text` |  |  |
| `detail` | `jsonb` | ✓ |  |
| `created_at` | `timestamp with time zone` | ✓ | `now()` |

**Indexes:**
- `idx_agent_run_results_run`

<details><summary>DDL</summary>

```sql
CREATE TABLE public."agent_run_results" (
  "id" integer NOT NULL DEFAULT nextval('agent_run_results_id_seq'::regclass),
  "agent_run_id" integer,
  "crawl_target_id" integer NOT NULL,
  "stage" text NOT NULL,
  "status" text NOT NULL,
  "detail" jsonb,
  "created_at" timestamp with time zone DEFAULT now(),
  PRIMARY KEY ("id")
);
ALTER TABLE public."agent_run_results" ADD CONSTRAINT "agent_run_results_agent_run_id_fkey" FOREIGN KEY ("agent_run_id") REFERENCES public."agent_runs" ("id");
```

</details>

### <a id="agent-runs"></a>`agent_runs`

**Rows:** 225 · **PK:** `id`

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `id` | `integer` |  | `nextval('agent_runs_id_seq'::regclass)` |
| `state_code` | `text` |  |  |
| `status` | `text` |  | `'running'::text` |
| `started_at` | `timestamp with time zone` | ✓ | `now()` |
| `completed_at` | `timestamp with time zone` | ✓ |  |
| `total_institutions` | `integer` | ✓ | `0` |
| `discovered` | `integer` | ✓ | `0` |
| `classified` | `integer` | ✓ | `0` |
| `extracted` | `integer` | ✓ | `0` |
| `validated` | `integer` | ✓ | `0` |
| `failed` | `integer` | ✓ | `0` |
| `current_stage` | `text` | ✓ |  |
| `current_institution` | `text` | ✓ |  |
| `pass_number` | `integer` | ✓ | `1` |
| `strategy` | `text` | ✓ | `'tier1'::text` |

<details><summary>DDL</summary>

```sql
CREATE TABLE public."agent_runs" (
  "id" integer NOT NULL DEFAULT nextval('agent_runs_id_seq'::regclass),
  "state_code" text NOT NULL,
  "status" text NOT NULL DEFAULT 'running'::text,
  "started_at" timestamp with time zone DEFAULT now(),
  "completed_at" timestamp with time zone,
  "total_institutions" integer DEFAULT 0,
  "discovered" integer DEFAULT 0,
  "classified" integer DEFAULT 0,
  "extracted" integer DEFAULT 0,
  "validated" integer DEFAULT 0,
  "failed" integer DEFAULT 0,
  "current_stage" text,
  "current_institution" text,
  "pass_number" integer DEFAULT 1,
  "strategy" text DEFAULT 'tier1'::text,
  PRIMARY KEY ("id")
);
```

</details>

### <a id="classification-cache"></a>`classification_cache`

*LLM classification results for fee names with no alias match. Prevents repeated Haiku API calls for the same normalized fee name.*

**Rows:** 552 · **PK:** `id`

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `normalized_name` | `text` | ✓ |  |
| `canonical_fee_key` | `text` | ✓ |  |
| `confidence` | `double precision` |  |  |
| `model` | `text` |  |  |
| `created_at` | `timestamp with time zone` | ✓ | `now()` |
| `cache_key` | `text` | ✓ |  |
| `source` | `text` | ✓ |  |
| `updated_at` | `timestamp with time zone` | ✓ |  |
| `id` | `bigint` |  | `nextval('classification_cache_id_seq'::regclass)` |

**Indexes:**
- `classification_cache_cache_key_uniq` (unique)
- `idx_classification_cache_key`
- `idx_classification_cache_low_conf`

<details><summary>DDL</summary>

```sql
CREATE TABLE public."classification_cache" (
  "normalized_name" text,
  "canonical_fee_key" text,
  "confidence" double precision NOT NULL,
  "model" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now(),
  "cache_key" text,
  "source" text,
  "updated_at" timestamp with time zone,
  "id" bigint NOT NULL DEFAULT nextval('classification_cache_id_seq'::regclass),
  PRIMARY KEY ("id"),
  CONSTRAINT "classification_cache_cache_key_uniq" UNIQUE ("cache_key")
);
```

</details>

### <a id="jobs"></a>`jobs`

**Rows:** 24,214 · **PK:** `id`

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `id` | `bigint` |  | `nextval('jobs_id_seq'::regclass)` |
| `queue` | `text` | ✓ |  |
| `entity_id` | `text` |  |  |
| `payload` | `jsonb` | ✓ |  |
| `status` | `text` |  | `'pending'::text` |
| `priority` | `integer` |  | `0` |
| `attempts` | `integer` |  | `0` |
| `max_attempts` | `integer` |  | `3` |
| `run_at` | `timestamp with time zone` |  | `now()` |
| `locked_by` | `text` | ✓ |  |
| `locked_at` | `timestamp with time zone` | ✓ |  |
| `completed_at` | `timestamp with time zone` | ✓ |  |
| `error` | `text` | ✓ |  |
| `created_at` | `timestamp with time zone` |  | `now()` |
| `job_type` | `text` | ✓ |  |
| `target_id` | `bigint` | ✓ |  |
| `result` | `jsonb` | ✓ |  |
| `updated_at` | `timestamp with time zone` | ✓ |  |

**Indexes:**
- `idx_jobs_queue_pending`

<details><summary>DDL</summary>

```sql
CREATE TABLE public."jobs" (
  "id" bigint NOT NULL DEFAULT nextval('jobs_id_seq'::regclass),
  "queue" text,
  "entity_id" text NOT NULL,
  "payload" jsonb,
  "status" text NOT NULL DEFAULT 'pending'::text,
  "priority" integer NOT NULL DEFAULT 0,
  "attempts" integer NOT NULL DEFAULT 0,
  "max_attempts" integer NOT NULL DEFAULT 3,
  "run_at" timestamp with time zone NOT NULL DEFAULT now(),
  "locked_by" text,
  "locked_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "error" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "job_type" text,
  "target_id" bigint,
  "result" jsonb,
  "updated_at" timestamp with time zone,
  PRIMARY KEY ("id")
);
```

</details>

### <a id="knox-overrides"></a>`knox_overrides`

*Roadmap #7 Knox review UI: human verdicts on Knox rejection messages. Append-only from the UI; one row per reviewer-action on a given rejection_msg_id. override decisions feed future Knox rule tuning.*

**Rows:** 0 · **PK:** `id` · **FK → :** `agent_messages`, `fees_published`, `users`

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `id` | `bigint` |  | `nextval('knox_overrides_id_seq'::regclass)` |
| `created_at` | `timestamp with time zone` |  | `now()` |
| `rejection_msg_id` | `uuid` |  |  |
| `fee_verified_id` | `bigint` | ✓ |  |
| `decision` | `text` |  |  |
| `reviewer_id` | `integer` |  |  |
| `note` | `text` | ✓ |  |
| `promoted_fee_published_id` | `bigint` | ✓ |  |

**Indexes:**
- `knox_overrides_fee_verified_idx`
- `knox_overrides_rejection_msg_unique` (unique)
- `knox_overrides_reviewer_time_idx`

**Check constraints:**
- `knox_overrides_decision_check`: `CHECK ((decision = ANY (ARRAY['confirm'::text, 'override'::text])))`

<details><summary>DDL</summary>

```sql
CREATE TABLE public."knox_overrides" (
  "id" bigint NOT NULL DEFAULT nextval('knox_overrides_id_seq'::regclass),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "rejection_msg_id" uuid NOT NULL,
  "fee_verified_id" bigint,
  "decision" text NOT NULL,
  "reviewer_id" integer NOT NULL,
  "note" text,
  "promoted_fee_published_id" bigint,
  PRIMARY KEY ("id")
);
ALTER TABLE public."knox_overrides" ADD CONSTRAINT "knox_overrides_promoted_fee_published_id_fkey" FOREIGN KEY ("promoted_fee_published_id") REFERENCES public."fees_published" ("fee_published_id");
ALTER TABLE public."knox_overrides" ADD CONSTRAINT "knox_overrides_rejection_msg_id_fkey" FOREIGN KEY ("rejection_msg_id") REFERENCES public."agent_messages" ("message_id");
ALTER TABLE public."knox_overrides" ADD CONSTRAINT "knox_overrides_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES public."users" ("id");
ALTER TABLE public."knox_overrides" ADD CONSTRAINT "knox_overrides_decision_check" CHECK ((decision = ANY (ARRAY['confirm'::text, 'override'::text])));
```

</details>

### <a id="ops-jobs"></a>`ops_jobs`

**Rows:** 42 · **PK:** `id`

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `id` | `bigint` |  | `nextval('ops_jobs_id_seq'::regclass)` |
| `command` | `text` |  |  |
| `params_json` | `jsonb` |  | `'{}'::jsonb` |
| `status` | `text` |  | `'queued'::text` |
| `triggered_by` | `text` |  |  |
| `target_id` | `bigint` | ✓ |  |
| `crawl_run_id` | `bigint` | ✓ |  |
| `pid` | `integer` | ✓ |  |
| `log_path` | `text` | ✓ |  |
| `started_at` | `timestamp with time zone` | ✓ |  |
| `completed_at` | `timestamp with time zone` | ✓ |  |
| `exit_code` | `integer` | ✓ |  |
| `stdout_tail` | `text` | ✓ |  |
| `error_summary` | `text` | ✓ |  |
| `result_summary` | `text` | ✓ |  |
| `created_at` | `timestamp with time zone` |  | `now()` |

**Indexes:**
- `idx_ops_jobs_created`
- `idx_ops_jobs_status`

<details><summary>DDL</summary>

```sql
CREATE TABLE public."ops_jobs" (
  "id" bigint NOT NULL DEFAULT nextval('ops_jobs_id_seq'::regclass),
  "command" text NOT NULL,
  "params_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "status" text NOT NULL DEFAULT 'queued'::text,
  "triggered_by" text NOT NULL,
  "target_id" bigint,
  "crawl_run_id" bigint,
  "pid" integer,
  "log_path" text,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "exit_code" integer,
  "stdout_tail" text,
  "error_summary" text,
  "result_summary" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);
```

</details>

### <a id="report-jobs"></a>`report_jobs`

**Rows:** 11 · **PK:** `id`

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `id` | `uuid` |  | `gen_random_uuid()` |
| `report_type` | `text` |  |  |
| `status` | `text` |  | `'pending'::text` |
| `params` | `jsonb` | ✓ |  |
| `data_manifest` | `jsonb` | ✓ |  |
| `artifact_key` | `text` | ✓ |  |
| `error` | `text` | ✓ |  |
| `created_at` | `timestamp with time zone` |  | `now()` |
| `completed_at` | `timestamp with time zone` | ✓ |  |
| `user_id` | `integer` | ✓ |  |

**Indexes:**
- `report_jobs_status_created_at_idx`

**Check constraints:**
- `report_jobs_report_type_check`: `CHECK ((report_type = ANY (ARRAY['national_index'::text, 'state_index'::text, 'peer_brief'::text, 'monthly_pulse'::text])))`
- `report_jobs_status_check`: `CHECK ((status = ANY (ARRAY['pending'::text, 'assembling'::text, 'rendering'::text, 'complete'::text, 'failed'::text])))`

<details><summary>DDL</summary>

```sql
CREATE TABLE public."report_jobs" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "report_type" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending'::text,
  "params" jsonb,
  "data_manifest" jsonb,
  "artifact_key" text,
  "error" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "completed_at" timestamp with time zone,
  "user_id" integer,
  PRIMARY KEY ("id")
);
ALTER TABLE public."report_jobs" ADD CONSTRAINT "report_jobs_report_type_check" CHECK ((report_type = ANY (ARRAY['national_index'::text, 'state_index'::text, 'peer_brief'::text, 'monthly_pulse'::text])));
ALTER TABLE public."report_jobs" ADD CONSTRAINT "report_jobs_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'assembling'::text, 'rendering'::text, 'complete'::text, 'failed'::text])));
```

</details>

### <a id="roomba-log"></a>`roomba_log`

**Rows:** 6,210 · **PK:** `id`

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `id` | `integer` |  | `nextval('roomba_log_id_seq'::regclass)` |
| `fee_id` | `integer` |  |  |
| `field_changed` | `text` |  |  |
| `old_value` | `text` | ✓ |  |
| `new_value` | `text` | ✓ |  |
| `reason` | `text` | ✓ |  |
| `created_at` | `timestamp with time zone` | ✓ | `now()` |

<details><summary>DDL</summary>

```sql
CREATE TABLE public."roomba_log" (
  "id" integer NOT NULL DEFAULT nextval('roomba_log_id_seq'::regclass),
  "fee_id" integer NOT NULL,
  "field_changed" text NOT NULL,
  "old_value" text,
  "new_value" text,
  "reason" text,
  "created_at" timestamp with time zone DEFAULT now(),
  PRIMARY KEY ("id")
);
```

</details>

### <a id="shadow-outputs"></a>`shadow_outputs`

*Phase 62b D-21: when agent context has shadow_run_id, gateway routes business-table writes here instead of the target table. Parallel-implementation diff source.*

**Rows:** 0 · **PK:** `shadow_output_id` · **FK → :** `agent_registry`

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `shadow_output_id` | `bigint` |  | `nextval('shadow_outputs_shadow_output_id_seq'::regclass)` |
| `created_at` | `timestamp with time zone` |  | `now()` |
| `shadow_run_id` | `uuid` |  |  |
| `agent_name` | `text` |  |  |
| `entity` | `text` |  |  |
| `payload_diff` | `jsonb` |  |  |
| `agent_event_id` | `uuid` | ✓ |  |

**Indexes:**
- `shadow_outputs_event_idx`
- `shadow_outputs_run_idx`

<details><summary>DDL</summary>

```sql
CREATE TABLE public."shadow_outputs" (
  "shadow_output_id" bigint NOT NULL DEFAULT nextval('shadow_outputs_shadow_output_id_seq'::regclass),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "shadow_run_id" uuid NOT NULL,
  "agent_name" text NOT NULL,
  "entity" text NOT NULL,
  "payload_diff" jsonb NOT NULL,
  "agent_event_id" uuid,
  PRIMARY KEY ("shadow_output_id")
);
ALTER TABLE public."shadow_outputs" ADD CONSTRAINT "shadow_outputs_agent_name_fkey" FOREIGN KEY ("agent_name") REFERENCES public."agent_registry" ("agent_name");
```

</details>

### <a id="upload-jobs"></a>`upload_jobs`

**Rows:** 0 · **PK:** `id` · **FK → :** `crawl_targets`, `users`

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `id` | `bigint` |  | `nextval('upload_jobs_id_seq'::regclass)` |
| `crawl_target_id` | `bigint` |  |  |
| `user_id` | `bigint` | ✓ |  |
| `file_path` | `text` |  |  |
| `file_name` | `text` | ✓ |  |
| `status` | `text` |  | `'queued'::text` |
| `fee_count` | `integer` | ✓ |  |
| `error_message` | `text` | ✓ |  |
| `created_at` | `timestamp with time zone` |  | `now()` |
| `completed_at` | `timestamp with time zone` | ✓ |  |

<details><summary>DDL</summary>

```sql
CREATE TABLE public."upload_jobs" (
  "id" bigint NOT NULL DEFAULT nextval('upload_jobs_id_seq'::regclass),
  "crawl_target_id" bigint NOT NULL,
  "user_id" bigint,
  "file_path" text NOT NULL,
  "file_name" text,
  "status" text NOT NULL DEFAULT 'queued'::text,
  "fee_count" integer,
  "error_message" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "completed_at" timestamp with time zone,
  PRIMARY KEY ("id")
);
ALTER TABLE public."upload_jobs" ADD CONSTRAINT "upload_jobs_crawl_target_id_fkey" FOREIGN KEY ("crawl_target_id") REFERENCES public."crawl_targets" ("id");
ALTER TABLE public."upload_jobs" ADD CONSTRAINT "upload_jobs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES public."users" ("id");
```

</details>

### <a id="wave-runs"></a>`wave_runs`

**Rows:** 0 · **PK:** `id`

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `id` | `integer` |  | `nextval('wave_runs_id_seq'::regclass)` |
| `states` | `text[]` | ✓ |  |
| `wave_size` | `integer` |  |  |
| `total_states` | `integer` |  |  |
| `completed_states` | `integer` | ✓ | `0` |
| `failed_states` | `integer` | ✓ | `0` |
| `status` | `text` | ✓ | `'pending'::text` |
| `created_at` | `timestamp with time zone` | ✓ | `now()` |
| `completed_at` | `timestamp with time zone` | ✓ |  |
| `campaign_id` | `text` | ✓ |  |
| `wave_type` | `text` | ✓ |  |
| `state_codes` | `text[]` | ✓ |  |
| `planned_targets` | `integer` | ✓ |  |

**Indexes:**
- `wave_runs_campaign_id_idx`
- `wave_runs_status_created_at_idx`

**Check constraints:**
- `wave_runs_status_check`: `CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'complete'::text, 'failed'::text])))`

<details><summary>DDL</summary>

```sql
CREATE TABLE public."wave_runs" (
  "id" integer NOT NULL DEFAULT nextval('wave_runs_id_seq'::regclass),
  "states" text[],
  "wave_size" integer NOT NULL,
  "total_states" integer NOT NULL,
  "completed_states" integer DEFAULT 0,
  "failed_states" integer DEFAULT 0,
  "status" text DEFAULT 'pending'::text,
  "created_at" timestamp with time zone DEFAULT now(),
  "completed_at" timestamp with time zone,
  "campaign_id" text,
  "wave_type" text,
  "state_codes" text[],
  "planned_targets" integer,
  PRIMARY KEY ("id")
);
ALTER TABLE public."wave_runs" ADD CONSTRAINT "wave_runs_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'complete'::text, 'failed'::text])));
```

</details>

### <a id="wave-state-runs"></a>`wave_state_runs`

**Rows:** 0 · **PK:** `id` · **FK → :** `wave_runs`

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `id` | `integer` |  | `nextval('wave_state_runs_id_seq'::regclass)` |
| `wave_run_id` | `integer` |  |  |
| `state_code` | `text` |  |  |
| `status` | `text` | ✓ | `'pending'::text` |
| `agent_run_id` | `integer` | ✓ |  |
| `started_at` | `timestamp with time zone` | ✓ |  |
| `completed_at` | `timestamp with time zone` | ✓ |  |
| `error` | `text` | ✓ |  |
| `extracted_count` | `integer` | ✓ |  |
| `failure_reason` | `text` | ✓ |  |
| `updated_at` | `timestamp with time zone` | ✓ |  |

**Indexes:**
- `wave_state_runs_wave_run_id_state_code_key` (unique)
- `wave_state_runs_wave_status_idx`

**Check constraints:**
- `wave_state_runs_status_check`: `CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'complete'::text, 'failed'::text, 'skipped'::text])))`

<details><summary>DDL</summary>

```sql
CREATE TABLE public."wave_state_runs" (
  "id" integer NOT NULL DEFAULT nextval('wave_state_runs_id_seq'::regclass),
  "wave_run_id" integer NOT NULL,
  "state_code" text NOT NULL,
  "status" text DEFAULT 'pending'::text,
  "agent_run_id" integer,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "error" text,
  "extracted_count" integer,
  "failure_reason" text,
  "updated_at" timestamp with time zone,
  PRIMARY KEY ("id"),
  CONSTRAINT "wave_state_runs_wave_run_id_state_code_key" UNIQUE ("wave_run_id", "state_code")
);
ALTER TABLE public."wave_state_runs" ADD CONSTRAINT "wave_state_runs_wave_run_id_fkey" FOREIGN KEY ("wave_run_id") REFERENCES public."wave_runs" ("id");
ALTER TABLE public."wave_state_runs" ADD CONSTRAINT "wave_state_runs_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'complete'::text, 'failed'::text, 'skipped'::text])));
```

</details>

### <a id="workers-last-run"></a>`workers_last_run`

*Phase 62b WR-05: singleton-per-job marker table so every-minute crons can detect missed daily runs (idempotent guard for run_post_processing etc.).*

**Rows:** 5 · **PK:** `job_name`

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `job_name` | `text` |  |  |
| `completed_at` | `timestamp with time zone` | ✓ |  |
| `status` | `text` | ✓ |  |
| `notes` | `text` | ✓ |  |

<details><summary>DDL</summary>

```sql
CREATE TABLE public."workers_last_run" (
  "job_name" text NOT NULL,
  "completed_at" timestamp with time zone,
  "status" text,
  "notes" text,
  PRIMARY KEY ("job_name")
);
```

</details>

---

## Hamilton research platform

### <a id="articles"></a>`articles`

**Rows:** 0 · **PK:** `id`

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `id` | `bigint` |  | `nextval('articles_id_seq'::regclass)` |
| `slug` | `text` |  |  |
| `title` | `text` |  |  |
| `article_type` | `text` | ✓ |  |
| `fee_category` | `text` | ✓ |  |
| `fed_district` | `integer` | ✓ |  |
| `status` | `text` |  | `'draft'::text` |
| `review_tier` | `integer` |  | `2` |
| `content_md` | `text` |  |  |
| `data_context` | `text` |  |  |
| `summary` | `text` | ✓ |  |
| `model_id` | `text` | ✓ |  |
| `prompt_hash` | `text` | ✓ |  |
| `generated_at` | `text` |  |  |
| `reviewed_by` | `text` | ✓ |  |
| `reviewed_at` | `text` | ✓ |  |
| `published_at` | `text` | ✓ |  |
| `created_at` | `timestamp with time zone` |  | `now()` |
| `updated_at` | `timestamp with time zone` |  | `now()` |
| `word_count` | `integer` | ✓ |  |
| `reading_time_min` | `integer` | ✓ |  |
| `data_snapshot_date` | `text` | ✓ |  |
| `quality_gate_results` | `text` | ✓ |  |
| `body` | `text` | ✓ |  |
| `author` | `text` | ✓ |  |
| `tags` | `text[]` | ✓ |  |

**Indexes:**
- `articles_slug_key` (unique)
- `idx_articles_published`
- `idx_articles_slug`
- `idx_articles_status`
- `idx_articles_type`

<details><summary>DDL</summary>

```sql
CREATE TABLE public."articles" (
  "id" bigint NOT NULL DEFAULT nextval('articles_id_seq'::regclass),
  "slug" text NOT NULL,
  "title" text NOT NULL,
  "article_type" text,
  "fee_category" text,
  "fed_district" integer,
  "status" text NOT NULL DEFAULT 'draft'::text,
  "review_tier" integer NOT NULL DEFAULT 2,
  "content_md" text NOT NULL,
  "data_context" text NOT NULL,
  "summary" text,
  "model_id" text,
  "prompt_hash" text,
  "generated_at" text NOT NULL,
  "reviewed_by" text,
  "reviewed_at" text,
  "published_at" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "word_count" integer,
  "reading_time_min" integer,
  "data_snapshot_date" text,
  "quality_gate_results" text,
  "body" text,
  "author" text,
  "tags" text[],
  PRIMARY KEY ("id"),
  CONSTRAINT "articles_slug_key" UNIQUE ("slug")
);
```

</details>

### <a id="hamilton-conversations"></a>`hamilton_conversations`

**Rows:** 17 · **PK:** `id`

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `id` | `uuid` |  | `gen_random_uuid()` |
| `user_id` | `text` |  |  |
| `title` | `text` | ✓ |  |
| `created_at` | `timestamp with time zone` |  | `now()` |
| `updated_at` | `timestamp with time zone` |  | `now()` |

**Indexes:**
- `idx_hamilton_conv_user`

<details><summary>DDL</summary>

```sql
CREATE TABLE public."hamilton_conversations" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "user_id" text NOT NULL,
  "title" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);
```

</details>

### <a id="hamilton-messages"></a>`hamilton_messages`

**Rows:** 36 · **PK:** `id` · **FK → :** `hamilton_conversations`

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `id` | `uuid` |  | `gen_random_uuid()` |
| `conversation_id` | `uuid` |  |  |
| `role` | `text` |  |  |
| `content` | `text` |  |  |
| `token_count` | `integer` | ✓ |  |
| `created_at` | `timestamp with time zone` |  | `now()` |
| `user_id` | `text` | ✓ |  |
| `tool_calls` | `jsonb` | ✓ |  |

**Indexes:**
- `idx_hamilton_msg_conv`

**Check constraints:**
- `hamilton_messages_role_check`: `CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text])))`

<details><summary>DDL</summary>

```sql
CREATE TABLE public."hamilton_messages" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "conversation_id" uuid NOT NULL,
  "role" text NOT NULL,
  "content" text NOT NULL,
  "token_count" integer,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "user_id" text,
  "tool_calls" jsonb,
  PRIMARY KEY ("id")
);
ALTER TABLE public."hamilton_messages" ADD CONSTRAINT "hamilton_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES public."hamilton_conversations" ("id") ON DELETE CASCADE;
ALTER TABLE public."hamilton_messages" ADD CONSTRAINT "hamilton_messages_role_check" CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text])));
```

</details>

### <a id="hamilton-priority-alerts"></a>`hamilton_priority_alerts`

**Rows:** 4 · **PK:** `id` · **FK → :** `hamilton_signals`

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `id` | `uuid` |  | `gen_random_uuid()` |
| `user_id` | `text` |  |  |
| `signal_id` | `uuid` |  |  |
| `status` | `text` |  | `'active'::text` |
| `acknowledged_at` | `timestamp with time zone` | ✓ |  |
| `created_at` | `timestamp with time zone` |  | `now()` |
| `priority` | `text` | ✓ |  |

**Indexes:**
- `idx_hamilton_alert_signal`
- `idx_hamilton_alert_user`

**Check constraints:**
- `hamilton_priority_alerts_status_check`: `CHECK ((status = ANY (ARRAY['active'::text, 'acknowledged'::text, 'dismissed'::text])))`

<details><summary>DDL</summary>

```sql
CREATE TABLE public."hamilton_priority_alerts" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "user_id" text NOT NULL,
  "signal_id" uuid NOT NULL,
  "status" text NOT NULL DEFAULT 'active'::text,
  "acknowledged_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "priority" text,
  PRIMARY KEY ("id")
);
ALTER TABLE public."hamilton_priority_alerts" ADD CONSTRAINT "hamilton_priority_alerts_signal_id_fkey" FOREIGN KEY ("signal_id") REFERENCES public."hamilton_signals" ("id") ON DELETE CASCADE;
ALTER TABLE public."hamilton_priority_alerts" ADD CONSTRAINT "hamilton_priority_alerts_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'acknowledged'::text, 'dismissed'::text])));
```

</details>

### <a id="hamilton-reports"></a>`hamilton_reports`

**Rows:** 11 · **PK:** `id` · **FK → :** `hamilton_scenarios`

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `id` | `uuid` |  | `gen_random_uuid()` |
| `user_id` | `text` |  |  |
| `institution_id` | `text` |  |  |
| `scenario_id` | `uuid` | ✓ |  |
| `report_type` | `text` |  |  |
| `report_json` | `jsonb` |  |  |
| `exported_at` | `timestamp with time zone` | ✓ |  |
| `created_at` | `timestamp with time zone` |  | `now()` |
| `status` | `text` |  | `'generated'::text` |
| `title` | `text` | ✓ |  |
| `sections` | `jsonb` | ✓ |  |

**Indexes:**
- `idx_hamilton_report_scenario`
- `idx_hamilton_report_status`
- `idx_hamilton_report_user`

<details><summary>DDL</summary>

```sql
CREATE TABLE public."hamilton_reports" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "user_id" text NOT NULL,
  "institution_id" text NOT NULL,
  "scenario_id" uuid,
  "report_type" text NOT NULL,
  "report_json" jsonb NOT NULL,
  "exported_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "status" text NOT NULL DEFAULT 'generated'::text,
  "title" text,
  "sections" jsonb,
  PRIMARY KEY ("id")
);
ALTER TABLE public."hamilton_reports" ADD CONSTRAINT "hamilton_reports_scenario_id_fkey" FOREIGN KEY ("scenario_id") REFERENCES public."hamilton_scenarios" ("id") ON DELETE SET NULL;
```

</details>

### <a id="hamilton-saved-analyses"></a>`hamilton_saved_analyses`

**Rows:** 10 · **PK:** `id`

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `id` | `uuid` |  | `gen_random_uuid()` |
| `user_id` | `text` |  |  |
| `institution_id` | `text` |  |  |
| `title` | `text` |  |  |
| `analysis_focus` | `text` |  |  |
| `prompt` | `text` | ✓ |  |
| `response_json` | `jsonb` |  |  |
| `status` | `text` |  | `'active'::text` |
| `archived_at` | `timestamp with time zone` | ✓ |  |
| `created_at` | `timestamp with time zone` |  | `now()` |
| `updated_at` | `timestamp with time zone` |  | `now()` |
| `question` | `text` | ✓ |  |
| `response` | `text` | ✓ |  |
| `model` | `text` | ✓ |  |

**Indexes:**
- `idx_hamilton_analysis_inst`
- `idx_hamilton_analysis_user`

**Check constraints:**
- `hamilton_saved_analyses_status_check`: `CHECK ((status = ANY (ARRAY['active'::text, 'archived'::text])))`

<details><summary>DDL</summary>

```sql
CREATE TABLE public."hamilton_saved_analyses" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "user_id" text NOT NULL,
  "institution_id" text NOT NULL,
  "title" text NOT NULL,
  "analysis_focus" text NOT NULL,
  "prompt" text,
  "response_json" jsonb NOT NULL,
  "status" text NOT NULL DEFAULT 'active'::text,
  "archived_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "question" text,
  "response" text,
  "model" text,
  PRIMARY KEY ("id")
);
ALTER TABLE public."hamilton_saved_analyses" ADD CONSTRAINT "hamilton_saved_analyses_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'archived'::text])));
```

</details>

### <a id="hamilton-scenarios"></a>`hamilton_scenarios`

**Rows:** 0 · **PK:** `id`

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `id` | `uuid` |  | `gen_random_uuid()` |
| `user_id` | `text` |  |  |
| `institution_id` | `text` |  |  |
| `fee_category` | `text` |  |  |
| `peer_set_id` | `text` | ✓ |  |
| `horizon` | `text` | ✓ |  |
| `current_value` | `numeric` |  |  |
| `proposed_value` | `numeric` |  |  |
| `result_json` | `jsonb` |  |  |
| `confidence_tier` | `text` |  |  |
| `status` | `text` |  | `'active'::text` |
| `archived_at` | `timestamp with time zone` | ✓ |  |
| `created_at` | `timestamp with time zone` |  | `now()` |
| `updated_at` | `timestamp with time zone` |  | `now()` |
| `name` | `text` | ✓ |  |
| `changes` | `jsonb` | ✓ |  |

**Indexes:**
- `idx_hamilton_scenario_inst`
- `idx_hamilton_scenario_user`

**Check constraints:**
- `hamilton_scenarios_confidence_tier_check`: `CHECK ((confidence_tier = ANY (ARRAY['strong'::text, 'provisional'::text, 'insufficient'::text])))`
- `hamilton_scenarios_status_check`: `CHECK ((status = ANY (ARRAY['active'::text, 'archived'::text])))`

<details><summary>DDL</summary>

```sql
CREATE TABLE public."hamilton_scenarios" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "user_id" text NOT NULL,
  "institution_id" text NOT NULL,
  "fee_category" text NOT NULL,
  "peer_set_id" text,
  "horizon" text,
  "current_value" numeric NOT NULL,
  "proposed_value" numeric NOT NULL,
  "result_json" jsonb NOT NULL,
  "confidence_tier" text NOT NULL,
  "status" text NOT NULL DEFAULT 'active'::text,
  "archived_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "name" text,
  "changes" jsonb,
  PRIMARY KEY ("id")
);
ALTER TABLE public."hamilton_scenarios" ADD CONSTRAINT "hamilton_scenarios_confidence_tier_check" CHECK ((confidence_tier = ANY (ARRAY['strong'::text, 'provisional'::text, 'insufficient'::text])));
ALTER TABLE public."hamilton_scenarios" ADD CONSTRAINT "hamilton_scenarios_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'archived'::text])));
```

</details>

### <a id="hamilton-signals"></a>`hamilton_signals`

**Rows:** 5 · **PK:** `id`

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `id` | `uuid` |  | `gen_random_uuid()` |
| `institution_id` | `text` | ✓ |  |
| `signal_type` | `text` |  |  |
| `severity` | `text` |  |  |
| `title` | `text` |  |  |
| `body` | `text` |  |  |
| `source_json` | `jsonb` | ✓ |  |
| `created_at` | `timestamp with time zone` |  | `now()` |
| `canonical_fee_key` | `text` | ✓ |  |
| `payload` | `jsonb` | ✓ |  |

**Indexes:**
- `idx_hamilton_signal_inst`
- `idx_hamilton_signal_type`

<details><summary>DDL</summary>

```sql
CREATE TABLE public."hamilton_signals" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "institution_id" text,
  "signal_type" text NOT NULL,
  "severity" text NOT NULL,
  "title" text NOT NULL,
  "body" text NOT NULL,
  "source_json" jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "canonical_fee_key" text,
  "payload" jsonb,
  PRIMARY KEY ("id")
);
```

</details>

### <a id="hamilton-watchlists"></a>`hamilton_watchlists`

**Rows:** 1 · **PK:** `id`

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `id` | `uuid` |  | `gen_random_uuid()` |
| `user_id` | `text` |  |  |
| `institution_ids` | `jsonb` |  | `'[]'::jsonb` |
| `fee_categories` | `jsonb` |  | `'[]'::jsonb` |
| `regions` | `jsonb` |  | `'[]'::jsonb` |
| `peer_set_ids` | `jsonb` |  | `'[]'::jsonb` |
| `created_at` | `timestamp with time zone` |  | `now()` |
| `updated_at` | `timestamp with time zone` |  | `now()` |
| `name` | `text` | ✓ |  |
| `filters` | `jsonb` | ✓ |  |
| `notify_on_change` | `boolean` | ✓ |  |

**Indexes:**
- `idx_hamilton_watchlist_user`

<details><summary>DDL</summary>

```sql
CREATE TABLE public."hamilton_watchlists" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "user_id" text NOT NULL,
  "institution_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "fee_categories" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "regions" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "peer_set_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "name" text,
  "filters" jsonb,
  "notify_on_change" boolean,
  PRIMARY KEY ("id")
);
```

</details>

### <a id="research-articles"></a>`research_articles`

**Rows:** 0 · **PK:** `id`

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `id` | `bigint` |  | `nextval('research_articles_id_seq'::regclass)` |
| `slug` | `text` |  |  |
| `title` | `text` |  |  |
| `subtitle` | `text` | ✓ |  |
| `content` | `text` |  | `''::text` |
| `category` | `text` |  | `'analysis'::text` |
| `tags` | `text` | ✓ |  |
| `author` | `text` | ✓ | `'Bank Fee Index'::text` |
| `status` | `text` |  | `'draft'::text` |
| `generated_by` | `text` | ✓ |  |
| `conversation_id` | `integer` | ✓ |  |
| `published_at` | `text` | ✓ |  |
| `created_at` | `timestamp with time zone` |  | `now()` |
| `updated_at` | `timestamp with time zone` |  | `now()` |
| `view_count` | `integer` |  | `0` |

**Indexes:**
- `idx_research_articles_slug`
- `idx_research_articles_status`
- `research_articles_slug_key` (unique)

<details><summary>DDL</summary>

```sql
CREATE TABLE public."research_articles" (
  "id" bigint NOT NULL DEFAULT nextval('research_articles_id_seq'::regclass),
  "slug" text NOT NULL,
  "title" text NOT NULL,
  "subtitle" text,
  "content" text NOT NULL DEFAULT ''::text,
  "category" text NOT NULL DEFAULT 'analysis'::text,
  "tags" text,
  "author" text DEFAULT 'Bank Fee Index'::text,
  "status" text NOT NULL DEFAULT 'draft'::text,
  "generated_by" text,
  "conversation_id" integer,
  "published_at" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "view_count" integer NOT NULL DEFAULT 0,
  PRIMARY KEY ("id"),
  CONSTRAINT "research_articles_slug_key" UNIQUE ("slug")
);
```

</details>

### <a id="research-conversations"></a>`research_conversations`

**Rows:** 0 · **PK:** `id`

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `id` | `bigint` |  | `nextval('research_conversations_id_seq'::regclass)` |
| `user_id` | `bigint` |  |  |
| `agent_id` | `text` |  |  |
| `title` | `text` | ✓ |  |
| `created_at` | `timestamp with time zone` |  | `now()` |
| `updated_at` | `timestamp with time zone` |  | `now()` |

**Indexes:**
- `idx_research_conv_user`

<details><summary>DDL</summary>

```sql
CREATE TABLE public."research_conversations" (
  "id" bigint NOT NULL DEFAULT nextval('research_conversations_id_seq'::regclass),
  "user_id" bigint NOT NULL,
  "agent_id" text NOT NULL,
  "title" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);
```

</details>

### <a id="research-messages"></a>`research_messages`

**Rows:** 0 · **PK:** `id` · **FK → :** `research_conversations`

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `id` | `bigint` |  | `nextval('research_messages_id_seq'::regclass)` |
| `conversation_id` | `bigint` |  |  |
| `role` | `text` |  |  |
| `content` | `text` |  |  |
| `tool_calls` | `text` | ✓ |  |
| `token_count` | `integer` | ✓ |  |
| `created_at` | `timestamp with time zone` |  | `now()` |

**Indexes:**
- `idx_research_msg_conv`

**Check constraints:**
- `research_messages_role_check`: `CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text, 'tool'::text])))`

<details><summary>DDL</summary>

```sql
CREATE TABLE public."research_messages" (
  "id" bigint NOT NULL DEFAULT nextval('research_messages_id_seq'::regclass),
  "conversation_id" bigint NOT NULL,
  "role" text NOT NULL,
  "content" text NOT NULL,
  "tool_calls" text,
  "token_count" integer,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);
ALTER TABLE public."research_messages" ADD CONSTRAINT "research_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES public."research_conversations" ("id") ON DELETE CASCADE;
ALTER TABLE public."research_messages" ADD CONSTRAINT "research_messages_role_check" CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text, 'tool'::text])));
```

</details>

### <a id="research-usage"></a>`research_usage`

**Rows:** 69 · **PK:** `id`

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `id` | `bigint` |  | `nextval('research_usage_id_seq'::regclass)` |
| `user_id` | `bigint` | ✓ |  |
| `ip_address` | `text` | ✓ |  |
| `agent_id` | `text` |  |  |
| `input_tokens` | `integer` |  | `0` |
| `output_tokens` | `integer` |  | `0` |
| `estimated_cost_cents` | `integer` |  | `0` |
| `created_at` | `timestamp with time zone` |  | `now()` |

**Indexes:**
- `idx_research_usage_ip_date`
- `idx_research_usage_user_date`

<details><summary>DDL</summary>

```sql
CREATE TABLE public."research_usage" (
  "id" bigint NOT NULL DEFAULT nextval('research_usage_id_seq'::regclass),
  "user_id" bigint,
  "ip_address" text,
  "agent_id" text NOT NULL,
  "input_tokens" integer NOT NULL DEFAULT 0,
  "output_tokens" integer NOT NULL DEFAULT 0,
  "estimated_cost_cents" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);
```

</details>

---

## External economic data

### <a id="beige-book-themes"></a>`beige_book_themes`

**Rows:** 48 · **PK:** `id`

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `id` | `bigint` |  | `nextval('beige_book_themes_id_seq'::regclass)` |
| `release_code` | `text` |  |  |
| `fed_district` | `integer` |  |  |
| `theme_category` | `text` |  |  |
| `sentiment` | `text` |  |  |
| `summary` | `text` |  |  |
| `confidence` | `double precision` |  | `0.0` |
| `extracted_at` | `timestamp with time zone` |  | `now()` |
| `model_used` | `text` |  | `'claude-haiku-4-5-20251001'::text` |
| `district` | `text` | ✓ |  |
| `period` | `text` | ✓ |  |
| `theme` | `text` | ✓ |  |
| `source_url` | `text` | ✓ |  |

**Indexes:**
- `beige_book_themes_release_code_fed_district_theme_category_key` (unique)
- `idx_beige_themes_category`
- `idx_beige_themes_district`

<details><summary>DDL</summary>

```sql
CREATE TABLE public."beige_book_themes" (
  "id" bigint NOT NULL DEFAULT nextval('beige_book_themes_id_seq'::regclass),
  "release_code" text NOT NULL,
  "fed_district" integer NOT NULL,
  "theme_category" text NOT NULL,
  "sentiment" text NOT NULL,
  "summary" text NOT NULL,
  "confidence" double precision NOT NULL DEFAULT 0.0,
  "extracted_at" timestamp with time zone NOT NULL DEFAULT now(),
  "model_used" text NOT NULL DEFAULT 'claude-haiku-4-5-20251001'::text,
  "district" text,
  "period" text,
  "theme" text,
  "source_url" text,
  PRIMARY KEY ("id"),
  CONSTRAINT "beige_book_themes_release_code_fed_district_theme_category_key" UNIQUE ("release_code", "fed_district", "theme_category")
);
```

</details>

### <a id="external-intelligence"></a>`external_intelligence`

**Rows:** 0 · **PK:** `id`

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `id` | `integer` |  | `nextval('external_intelligence_id_seq'::regclass)` |
| `source_name` | `text` | ✓ |  |
| `source_date` | `date` |  |  |
| `category` | `text` |  |  |
| `tags` | `text[]` |  | `'{}'::text[]` |
| `content_text` | `text` |  |  |
| `source_url` | `text` | ✓ |  |
| `created_at` | `timestamp with time zone` |  | `now()` |
| `created_by` | `text` | ✓ |  |
| `search_vector` | `tsvector` | ✓ |  |
| `source` | `text` | ✓ |  |
| `series_id` | `text` | ✓ |  |
| `title` | `text` | ✓ |  |
| `body` | `text` | ✓ |  |
| `payload` | `jsonb` | ✓ |  |
| `observed_at` | `timestamp with time zone` | ✓ |  |

**Indexes:**
- `idx_ext_intel_category`
- `idx_ext_intel_search`
- `idx_ext_intel_source_date`
- `idx_ext_intel_tags`

**Check constraints:**
- `external_intelligence_category_check`: `CHECK ((category = ANY (ARRAY['research'::text, 'survey'::text, 'regulation'::text, 'news'::text, 'analysis'::text])))`

<details><summary>DDL</summary>

```sql
CREATE TABLE public."external_intelligence" (
  "id" integer NOT NULL DEFAULT nextval('external_intelligence_id_seq'::regclass),
  "source_name" text,
  "source_date" date NOT NULL,
  "category" text NOT NULL,
  "tags" text[] NOT NULL DEFAULT '{}'::text[],
  "content_text" text NOT NULL,
  "source_url" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "created_by" text,
  "search_vector" tsvector,
  "source" text,
  "series_id" text,
  "title" text,
  "body" text,
  "payload" jsonb,
  "observed_at" timestamp with time zone,
  PRIMARY KEY ("id")
);
ALTER TABLE public."external_intelligence" ADD CONSTRAINT "external_intelligence_category_check" CHECK ((category = ANY (ARRAY['research'::text, 'survey'::text, 'regulation'::text, 'news'::text, 'analysis'::text])));
```

</details>

### <a id="fed-beige-book"></a>`fed_beige_book`

**Rows:** 130 · **PK:** `id`

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `id` | `bigint` |  | `nextval('fed_beige_book_id_seq'::regclass)` |
| `release_date` | `text` |  |  |
| `release_code` | `text` |  |  |
| `fed_district` | `integer` | ✓ |  |
| `section_name` | `text` |  |  |
| `content_text` | `text` |  |  |
| `source_url` | `text` |  |  |
| `fetched_at` | `timestamp with time zone` |  | `now()` |

**Indexes:**
- `fed_beige_book_release_code_fed_district_section_name_key` (unique)
- `idx_beige_book_district`

<details><summary>DDL</summary>

```sql
CREATE TABLE public."fed_beige_book" (
  "id" bigint NOT NULL DEFAULT nextval('fed_beige_book_id_seq'::regclass),
  "release_date" text NOT NULL,
  "release_code" text NOT NULL,
  "fed_district" integer,
  "section_name" text NOT NULL,
  "content_text" text NOT NULL,
  "source_url" text NOT NULL,
  "fetched_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("id"),
  CONSTRAINT "fed_beige_book_release_code_fed_district_section_name_key" UNIQUE ("release_code", "fed_district", "section_name")
);
```

</details>

### <a id="fed-content"></a>`fed_content`

**Rows:** 439 · **PK:** `id`

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `id` | `bigint` |  | `nextval('fed_content_id_seq'::regclass)` |
| `content_type` | `text` |  |  |
| `title` | `text` |  |  |
| `speaker` | `text` | ✓ |  |
| `fed_district` | `integer` | ✓ |  |
| `source_url` | `text` |  |  |
| `published_at` | `text` |  |  |
| `description` | `text` | ✓ |  |
| `source_feed` | `text` | ✓ |  |
| `fetched_at` | `timestamp with time zone` |  | `now()` |

**Indexes:**
- `fed_content_source_url_key` (unique)
- `idx_fed_content_district`
- `idx_fed_content_type`

<details><summary>DDL</summary>

```sql
CREATE TABLE public."fed_content" (
  "id" bigint NOT NULL DEFAULT nextval('fed_content_id_seq'::regclass),
  "content_type" text NOT NULL,
  "title" text NOT NULL,
  "speaker" text,
  "fed_district" integer,
  "source_url" text NOT NULL,
  "published_at" text NOT NULL,
  "description" text,
  "source_feed" text,
  "fetched_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("id"),
  CONSTRAINT "fed_content_source_url_key" UNIQUE ("source_url")
);
```

</details>

### <a id="fed-economic-indicators"></a>`fed_economic_indicators`

**Rows:** 49,005 · **PK:** `id`

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `id` | `bigint` |  | `nextval('fed_economic_indicators_id_seq'::regclass)` |
| `series_id` | `text` |  |  |
| `series_title` | `text` | ✓ |  |
| `fed_district` | `integer` | ✓ |  |
| `observation_date` | `text` |  |  |
| `value` | `double precision` | ✓ |  |
| `units` | `text` | ✓ |  |
| `frequency` | `text` | ✓ |  |
| `fetched_at` | `timestamp with time zone` |  | `now()` |

**Indexes:**
- `fed_economic_indicators_series_id_observation_date_key` (unique)
- `idx_fed_indicators_series`

<details><summary>DDL</summary>

```sql
CREATE TABLE public."fed_economic_indicators" (
  "id" bigint NOT NULL DEFAULT nextval('fed_economic_indicators_id_seq'::regclass),
  "series_id" text NOT NULL,
  "series_title" text,
  "fed_district" integer,
  "observation_date" text NOT NULL,
  "value" double precision,
  "units" text,
  "frequency" text,
  "fetched_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("id"),
  CONSTRAINT "fed_economic_indicators_series_id_observation_date_key" UNIQUE ("series_id", "observation_date")
);
```

</details>

### <a id="reg-articles"></a>`reg_articles`

**Rows:** 97 · **PK:** `guid`

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `guid` | `text` |  |  |
| `source` | `text` |  |  |
| `title` | `text` |  |  |
| `link` | `text` |  |  |
| `topic` | `text` |  | `'general'::text` |
| `published_at` | `text` | ✓ |  |
| `created_at` | `timestamp with time zone` | ✓ | `now()` |

**Indexes:**
- `idx_reg_articles_published`

<details><summary>DDL</summary>

```sql
CREATE TABLE public."reg_articles" (
  "guid" text NOT NULL,
  "source" text NOT NULL,
  "title" text NOT NULL,
  "link" text NOT NULL,
  "topic" text NOT NULL DEFAULT 'general'::text,
  "published_at" text,
  "created_at" timestamp with time zone DEFAULT now(),
  PRIMARY KEY ("guid")
);
```

</details>

---

## Users, auth, billing, audit

### <a id="leads"></a>`leads`

**Rows:** 6 · **PK:** `id`

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `id` | `bigint` |  | `nextval('leads_id_seq'::regclass)` |
| `name` | `text` |  |  |
| `email` | `text` |  |  |
| `company` | `text` | ✓ |  |
| `role` | `text` | ✓ |  |
| `use_case` | `text` | ✓ |  |
| `source` | `text` |  | `'coming_soon'::text` |
| `status` | `text` |  | `'new'::text` |
| `created_at` | `timestamp with time zone` |  | `now()` |

<details><summary>DDL</summary>

```sql
CREATE TABLE public."leads" (
  "id" bigint NOT NULL DEFAULT nextval('leads_id_seq'::regclass),
  "name" text NOT NULL,
  "email" text NOT NULL,
  "company" text,
  "role" text,
  "use_case" text,
  "source" text NOT NULL DEFAULT 'coming_soon'::text,
  "status" text NOT NULL DEFAULT 'new'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);
```

</details>

### <a id="saved-peer-sets"></a>`saved_peer_sets`

**Rows:** 0 · **PK:** `id`

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `id` | `bigint` |  | `nextval('saved_peer_sets_id_seq'::regclass)` |
| `name` | `text` |  |  |
| `tiers` | `text` | ✓ |  |
| `districts` | `text` | ✓ |  |
| `charter_type` | `text` | ✓ |  |
| `created_by` | `text` | ✓ |  |
| `created_at` | `timestamp with time zone` | ✓ | `now()` |
| `filters` | `jsonb` | ✓ |  |

<details><summary>DDL</summary>

```sql
CREATE TABLE public."saved_peer_sets" (
  "id" bigint NOT NULL DEFAULT nextval('saved_peer_sets_id_seq'::regclass),
  "name" text NOT NULL,
  "tiers" text,
  "districts" text,
  "charter_type" text,
  "created_by" text,
  "created_at" timestamp with time zone DEFAULT now(),
  "filters" jsonb,
  PRIMARY KEY ("id")
);
```

</details>

### <a id="saved-subscriber-peer-groups"></a>`saved_subscriber_peer_groups`

**Rows:** 0 · **PK:** `id` · **FK → :** `organizations`

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `id` | `bigint` |  | `nextval('saved_subscriber_peer_groups_id_seq'::regclass)` |
| `organization_id` | `bigint` | ✓ |  |
| `name` | `text` |  |  |
| `charter_types` | `text` | ✓ |  |
| `asset_tiers` | `text` | ✓ |  |
| `districts` | `text` | ✓ |  |
| `created_at` | `timestamp with time zone` |  | `now()` |
| `user_id` | `text` | ✓ |  |
| `institution_ids` | `integer[]` | ✓ |  |

**Indexes:**
- `idx_sub_peer_groups_org`

<details><summary>DDL</summary>

```sql
CREATE TABLE public."saved_subscriber_peer_groups" (
  "id" bigint NOT NULL DEFAULT nextval('saved_subscriber_peer_groups_id_seq'::regclass),
  "organization_id" bigint,
  "name" text NOT NULL,
  "charter_types" text,
  "asset_tiers" text,
  "districts" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "user_id" text,
  "institution_ids" integer[],
  PRIMARY KEY ("id")
);
ALTER TABLE public."saved_subscriber_peer_groups" ADD CONSTRAINT "saved_subscriber_peer_groups_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES public."organizations" ("id");
```

</details>

### <a id="sessions"></a>`sessions`

**Rows:** 20 · **PK:** `id` · **FK → :** `users`

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `id` | `text` |  |  |
| `user_id` | `bigint` |  |  |
| `expires_at` | `timestamp with time zone` |  |  |
| `created_at` | `timestamp with time zone` |  | `now()` |

<details><summary>DDL</summary>

```sql
CREATE TABLE public."sessions" (
  "id" text NOT NULL,
  "user_id" bigint NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);
ALTER TABLE public."sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES public."users" ("id");
```

</details>

### <a id="stripe-events"></a>`stripe_events`

**Rows:** 0 · **PK:** `id`

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `id` | `bigint` |  | `nextval('stripe_events_id_seq'::regclass)` |
| `stripe_event_id` | `text` |  |  |
| `event_type` | `text` |  |  |
| `processed_at` | `timestamp with time zone` |  | `now()` |

**Indexes:**
- `idx_stripe_events_type`
- `stripe_events_stripe_event_id_key` (unique)

<details><summary>DDL</summary>

```sql
CREATE TABLE public."stripe_events" (
  "id" bigint NOT NULL DEFAULT nextval('stripe_events_id_seq'::regclass),
  "stripe_event_id" text NOT NULL,
  "event_type" text NOT NULL,
  "processed_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("id"),
  CONSTRAINT "stripe_events_stripe_event_id_key" UNIQUE ("stripe_event_id")
);
```

</details>

### <a id="subscriptions"></a>`subscriptions`

**Rows:** 0 · **PK:** `id` · **FK → :** `organizations`

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `id` | `bigint` |  | `nextval('subscriptions_id_seq'::regclass)` |
| `organization_id` | `bigint` |  |  |
| `stripe_subscription_id` | `text` |  |  |
| `plan` | `text` |  | `'starter'::text` |
| `status` | `text` |  | `'active'::text` |
| `current_period_start` | `text` |  |  |
| `current_period_end` | `text` |  |  |
| `cancel_at_period_end` | `boolean` |  | `false` |
| `created_at` | `timestamp with time zone` |  | `now()` |
| `updated_at` | `timestamp with time zone` |  | `now()` |

**Indexes:**
- `subscriptions_stripe_subscription_id_key` (unique)

<details><summary>DDL</summary>

```sql
CREATE TABLE public."subscriptions" (
  "id" bigint NOT NULL DEFAULT nextval('subscriptions_id_seq'::regclass),
  "organization_id" bigint NOT NULL,
  "stripe_subscription_id" text NOT NULL,
  "plan" text NOT NULL DEFAULT 'starter'::text,
  "status" text NOT NULL DEFAULT 'active'::text,
  "current_period_start" text NOT NULL,
  "current_period_end" text NOT NULL,
  "cancel_at_period_end" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("id"),
  CONSTRAINT "subscriptions_stripe_subscription_id_key" UNIQUE ("stripe_subscription_id")
);
ALTER TABLE public."subscriptions" ADD CONSTRAINT "subscriptions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES public."organizations" ("id");
```

</details>

### <a id="usage-events"></a>`usage_events`

**Rows:** 11 · **PK:** `id`

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `id` | `bigint` |  | `nextval('usage_events_id_seq'::regclass)` |
| `organization_id` | `bigint` | ✓ |  |
| `anonymous_id` | `text` | ✓ |  |
| `event_type` | `text` |  |  |
| `metadata` | `jsonb` | ✓ |  |
| `created_at` | `timestamp with time zone` |  | `now()` |

**Indexes:**
- `idx_usage_anon`
- `idx_usage_org_type`

<details><summary>DDL</summary>

```sql
CREATE TABLE public."usage_events" (
  "id" bigint NOT NULL DEFAULT nextval('usage_events_id_seq'::regclass),
  "organization_id" bigint,
  "anonymous_id" text,
  "event_type" text NOT NULL,
  "metadata" jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);
```

</details>

### <a id="users"></a>`users`

**Rows:** 12 · **PK:** `id`

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `id` | `bigint` |  | `nextval('users_id_seq'::regclass)` |
| `username` | `text` |  |  |
| `password_hash` | `text` |  |  |
| `display_name` | `text` |  |  |
| `role` | `text` |  | `'viewer'::text` |
| `is_active` | `boolean` |  | `true` |
| `created_at` | `timestamp with time zone` |  | `now()` |
| `email` | `text` | ✓ |  |
| `stripe_customer_id` | `text` | ✓ |  |
| `subscription_status` | `text` | ✓ | `'none'::text` |
| `institution_name` | `text` | ✓ |  |
| `institution_type` | `text` | ✓ |  |
| `asset_tier` | `text` | ✓ |  |
| `state_code` | `character(2)` | ✓ |  |
| `job_role` | `text` | ✓ |  |
| `interests` | `jsonb` | ✓ |  |
| `fed_district` | `integer` | ✓ |  |

**Indexes:**
- `idx_users_email` (unique)
- `idx_users_stripe_customer` (unique)
- `users_username_key` (unique)

<details><summary>DDL</summary>

```sql
CREATE TABLE public."users" (
  "id" bigint NOT NULL DEFAULT nextval('users_id_seq'::regclass),
  "username" text NOT NULL,
  "password_hash" text NOT NULL,
  "display_name" text NOT NULL,
  "role" text NOT NULL DEFAULT 'viewer'::text,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "email" text,
  "stripe_customer_id" text,
  "subscription_status" text DEFAULT 'none'::text,
  "institution_name" text,
  "institution_type" text,
  "asset_tier" text,
  "state_code" character(2),
  "job_role" text,
  "interests" jsonb,
  "fed_district" integer,
  PRIMARY KEY ("id"),
  CONSTRAINT "users_username_key" UNIQUE ("username")
);
```

</details>

---

## Reference & taxonomy

### <a id="platform-registry"></a>`platform_registry`

**Rows:** 7 · **PK:** `platform`

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `platform` | `text` |  |  |
| `fee_paths` | `text[]` | ✓ |  |
| `extraction_method` | `text` |  | `'llm'::text` |
| `rule_enabled` | `boolean` |  | `false` |
| `validated_count` | `integer` |  | `0` |
| `success_rate` | `double precision` | ✓ |  |
| `institution_count` | `integer` | ✓ |  |
| `last_updated` | `timestamp with time zone` | ✓ | `now()` |

<details><summary>DDL</summary>

```sql
CREATE TABLE public."platform_registry" (
  "platform" text NOT NULL,
  "fee_paths" text[],
  "extraction_method" text NOT NULL DEFAULT 'llm'::text,
  "rule_enabled" boolean NOT NULL DEFAULT false,
  "validated_count" integer NOT NULL DEFAULT 0,
  "success_rate" double precision,
  "institution_count" integer,
  "last_updated" timestamp with time zone DEFAULT now(),
  PRIMARY KEY ("platform")
);
```

</details>

### <a id="schema-migrations"></a>`schema_migrations`

*Reliability Roadmap #9: records every supabase/migrations/*.sql file applied to this database. Written by scripts/apply-migration.mjs on successful apply.*

**Rows:** 47 · **PK:** `filename`

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `filename` | `text` |  |  |
| `applied_at` | `timestamp with time zone` |  | `now()` |
| `applied_by` | `text` | ✓ |  |
| `checksum` | `text` | ✓ |  |

<details><summary>DDL</summary>

```sql
CREATE TABLE public."schema_migrations" (
  "filename" text NOT NULL,
  "applied_at" timestamp with time zone NOT NULL DEFAULT now(),
  "applied_by" text,
  "checksum" text,
  PRIMARY KEY ("filename")
);
```

</details>

---

## Other

### <a id="alert-preferences"></a>`alert_preferences`

**Rows:** 0 · **PK:** `id` · **FK → :** `organizations`

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `id` | `bigint` |  | `nextval('alert_preferences_id_seq'::regclass)` |
| `organization_id` | `bigint` |  |  |
| `categories` | `text` | ✓ |  |
| `peer_group_id` | `integer` | ✓ |  |
| `frequency` | `text` |  | `'weekly'::text` |
| `enabled` | `boolean` |  | `true` |
| `created_at` | `timestamp with time zone` |  | `now()` |

**Indexes:**
- `alert_preferences_organization_id_key` (unique)

<details><summary>DDL</summary>

```sql
CREATE TABLE public."alert_preferences" (
  "id" bigint NOT NULL DEFAULT nextval('alert_preferences_id_seq'::regclass),
  "organization_id" bigint NOT NULL,
  "categories" text,
  "peer_group_id" integer,
  "frequency" text NOT NULL DEFAULT 'weekly'::text,
  "enabled" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("id"),
  CONSTRAINT "alert_preferences_organization_id_key" UNIQUE ("organization_id")
);
ALTER TABLE public."alert_preferences" ADD CONSTRAINT "alert_preferences_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES public."organizations" ("id");
```

</details>

### <a id="analysis-results"></a>`analysis_results`

**Rows:** 0 · **PK:** `id` · **FK → :** `crawl_targets`

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `id` | `bigint` |  | `nextval('analysis_results_id_seq'::regclass)` |
| `crawl_target_id` | `bigint` |  |  |
| `analysis_type` | `text` |  |  |
| `result_json` | `jsonb` |  |  |
| `computed_at` | `timestamp with time zone` |  | `now()` |

**Indexes:**
- `analysis_results_crawl_target_id_analysis_type_key` (unique)
- `idx_analysis_target_type`

<details><summary>DDL</summary>

```sql
CREATE TABLE public."analysis_results" (
  "id" bigint NOT NULL DEFAULT nextval('analysis_results_id_seq'::regclass),
  "crawl_target_id" bigint NOT NULL,
  "analysis_type" text NOT NULL,
  "result_json" jsonb NOT NULL,
  "computed_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("id"),
  CONSTRAINT "analysis_results_crawl_target_id_analysis_type_key" UNIQUE ("crawl_target_id", "analysis_type")
);
ALTER TABLE public."analysis_results" ADD CONSTRAINT "analysis_results_crawl_target_id_fkey" FOREIGN KEY ("crawl_target_id") REFERENCES public."crawl_targets" ("id");
```

</details>

### <a id="api-keys"></a>`api_keys`

**Rows:** 0 · **PK:** `id` · **FK → :** `organizations`

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `id` | `bigint` |  | `nextval('api_keys_id_seq'::regclass)` |
| `organization_id` | `bigint` |  |  |
| `key_hash` | `text` |  |  |
| `key_prefix` | `text` |  |  |
| `name` | `text` |  | `'Default'::text` |
| `last_used_at` | `timestamp with time zone` | ✓ |  |
| `created_at` | `timestamp with time zone` |  | `now()` |

**Indexes:**
- `api_keys_key_hash_key` (unique)

<details><summary>DDL</summary>

```sql
CREATE TABLE public."api_keys" (
  "id" bigint NOT NULL DEFAULT nextval('api_keys_id_seq'::regclass),
  "organization_id" bigint NOT NULL,
  "key_hash" text NOT NULL,
  "key_prefix" text NOT NULL,
  "name" text NOT NULL DEFAULT 'Default'::text,
  "last_used_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("id"),
  CONSTRAINT "api_keys_key_hash_key" UNIQUE ("key_hash")
);
ALTER TABLE public."api_keys" ADD CONSTRAINT "api_keys_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES public."organizations" ("id");
```

</details>

### <a id="branch-deposits"></a>`branch_deposits`

**Rows:** 76,727 · **PK:** `id` · **FK → :** `crawl_targets`

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `id` | `bigint` |  | `nextval('branch_deposits_id_seq'::regclass)` |
| `cert` | `integer` |  |  |
| `crawl_target_id` | `bigint` | ✓ |  |
| `year` | `integer` |  |  |
| `branch_number` | `integer` |  |  |
| `is_main_office` | `boolean` |  | `false` |
| `deposits` | `bigint` | ✓ |  |
| `state` | `text` | ✓ |  |
| `city` | `text` | ✓ |  |
| `county_fips` | `integer` | ✓ |  |
| `msa_code` | `integer` | ✓ |  |
| `msa_name` | `text` | ✓ |  |
| `fed_district` | `integer` | ✓ |  |
| `latitude` | `double precision` | ✓ |  |
| `longitude` | `double precision` | ✓ |  |
| `fetched_at` | `timestamp with time zone` |  | `now()` |

**Indexes:**
- `branch_deposits_cert_year_branch_number_key` (unique)
- `idx_branch_deposits_cert`
- `idx_branch_deposits_msa`

<details><summary>DDL</summary>

```sql
CREATE TABLE public."branch_deposits" (
  "id" bigint NOT NULL DEFAULT nextval('branch_deposits_id_seq'::regclass),
  "cert" integer NOT NULL,
  "crawl_target_id" bigint,
  "year" integer NOT NULL,
  "branch_number" integer NOT NULL,
  "is_main_office" boolean NOT NULL DEFAULT false,
  "deposits" bigint,
  "state" text,
  "city" text,
  "county_fips" integer,
  "msa_code" integer,
  "msa_name" text,
  "fed_district" integer,
  "latitude" double precision,
  "longitude" double precision,
  "fetched_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("id"),
  CONSTRAINT "branch_deposits_cert_year_branch_number_key" UNIQUE ("cert", "year", "branch_number")
);
ALTER TABLE public."branch_deposits" ADD CONSTRAINT "branch_deposits_crawl_target_id_fkey" FOREIGN KEY ("crawl_target_id") REFERENCES public."crawl_targets" ("id");
```

</details>

### <a id="canary-runs"></a>`canary_runs`

*Phase 62b LOOP-07 + D-20: per-agent canary regression runs. First run per (agent, corpus_version) is baseline; subsequent runs compare coverage/confidence/count deltas >= 0.*

**Rows:** 0 · **PK:** `run_id` · **FK → :** `agent_registry`, `canary_runs`

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `run_id` | `uuid` |  | `gen_random_uuid()` |
| `agent_name` | `text` |  |  |
| `corpus_version` | `text` |  |  |
| `started_at` | `timestamp with time zone` |  | `now()` |
| `finished_at` | `timestamp with time zone` | ✓ |  |
| `status` | `text` |  |  |
| `is_baseline` | `boolean` |  | `false` |
| `coverage` | `numeric(5,4)` | ✓ |  |
| `confidence_mean` | `numeric(5,4)` | ✓ |  |
| `extraction_count` | `integer` | ✓ |  |
| `coverage_delta` | `numeric(5,4)` | ✓ |  |
| `confidence_delta` | `numeric(5,4)` | ✓ |  |
| `extraction_count_delta` | `integer` | ✓ |  |
| `verdict` | `text` | ✓ |  |
| `report_payload` | `jsonb` | ✓ |  |
| `baseline_run_id` | `uuid` | ✓ |  |

**Indexes:**
- `canary_runs_agent_version_idx`
- `canary_runs_baseline_idx` (unique)

**Check constraints:**
- `canary_runs_status_check`: `CHECK ((status = ANY (ARRAY['running'::text, 'passed'::text, 'failed'::text, 'error'::text])))`

<details><summary>DDL</summary>

```sql
CREATE TABLE public."canary_runs" (
  "run_id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "agent_name" text NOT NULL,
  "corpus_version" text NOT NULL,
  "started_at" timestamp with time zone NOT NULL DEFAULT now(),
  "finished_at" timestamp with time zone,
  "status" text NOT NULL,
  "is_baseline" boolean NOT NULL DEFAULT false,
  "coverage" numeric(5,4),
  "confidence_mean" numeric(5,4),
  "extraction_count" integer,
  "coverage_delta" numeric(5,4),
  "confidence_delta" numeric(5,4),
  "extraction_count_delta" integer,
  "verdict" text,
  "report_payload" jsonb,
  "baseline_run_id" uuid,
  PRIMARY KEY ("run_id")
);
ALTER TABLE public."canary_runs" ADD CONSTRAINT "canary_runs_agent_name_fkey" FOREIGN KEY ("agent_name") REFERENCES public."agent_registry" ("agent_name");
ALTER TABLE public."canary_runs" ADD CONSTRAINT "canary_runs_baseline_run_id_fkey" FOREIGN KEY ("baseline_run_id") REFERENCES public."canary_runs" ("run_id");
ALTER TABLE public."canary_runs" ADD CONSTRAINT "canary_runs_status_check" CHECK ((status = ANY (ARRAY['running'::text, 'passed'::text, 'failed'::text, 'error'::text])));
```

</details>

### <a id="census-tracts"></a>`census_tracts`

**Rows:** 0 · **PK:** `id`

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `id` | `bigint` |  | `nextval('census_tracts_id_seq'::regclass)` |
| `tract_id` | `text` |  |  |
| `state_fips` | `text` |  |  |
| `county_fips` | `text` |  |  |
| `msa_code` | `text` | ✓ |  |
| `income_level` | `text` | ✓ |  |
| `median_family_income` | `integer` | ✓ |  |
| `tract_median_income` | `integer` | ✓ |  |
| `income_ratio` | `double precision` | ✓ |  |
| `population` | `integer` | ✓ |  |
| `minority_pct` | `double precision` | ✓ |  |
| `year` | `integer` |  |  |
| `fetched_at` | `timestamp with time zone` |  | `now()` |

**Indexes:**
- `census_tracts_tract_id_year_key` (unique)
- `idx_census_tracts_state`

<details><summary>DDL</summary>

```sql
CREATE TABLE public."census_tracts" (
  "id" bigint NOT NULL DEFAULT nextval('census_tracts_id_seq'::regclass),
  "tract_id" text NOT NULL,
  "state_fips" text NOT NULL,
  "county_fips" text NOT NULL,
  "msa_code" text,
  "income_level" text,
  "median_family_income" integer,
  "tract_median_income" integer,
  "income_ratio" double precision,
  "population" integer,
  "minority_pct" double precision,
  "year" integer NOT NULL,
  "fetched_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("id"),
  CONSTRAINT "census_tracts_tract_id_year_key" UNIQUE ("tract_id", "year")
);
```

</details>

### <a id="classification-history"></a>`classification_history`

*Reliability Roadmap #13: append-only log of every canonical_fee_key or variant_type change on fees_verified. Populated automatically via trigger; no app writes.*

**Rows:** 0 · **PK:** `id` · **FK → :** `fees_verified`

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `id` | `bigint` |  | `nextval('classification_history_id_seq'::regclass)` |
| `fee_verified_id` | `bigint` |  |  |
| `old_canonical_key` | `text` | ✓ |  |
| `new_canonical_key` | `text` |  |  |
| `old_variant_type` | `text` | ✓ |  |
| `new_variant_type` | `text` | ✓ |  |
| `agent_event_id` | `uuid` | ✓ |  |
| `changed_at` | `timestamp with time zone` |  | `now()` |
| `changed_by` | `text` | ✓ |  |

**Indexes:**
- `idx_classification_history_fee`
- `idx_classification_history_old_new`

<details><summary>DDL</summary>

```sql
CREATE TABLE public."classification_history" (
  "id" bigint NOT NULL DEFAULT nextval('classification_history_id_seq'::regclass),
  "fee_verified_id" bigint NOT NULL,
  "old_canonical_key" text,
  "new_canonical_key" text NOT NULL,
  "old_variant_type" text,
  "new_variant_type" text,
  "agent_event_id" uuid,
  "changed_at" timestamp with time zone NOT NULL DEFAULT now(),
  "changed_by" text,
  PRIMARY KEY ("id")
);
ALTER TABLE public."classification_history" ADD CONSTRAINT "classification_history_fee_verified_id_fkey" FOREIGN KEY ("fee_verified_id") REFERENCES public."fees_verified" ("fee_verified_id") ON DELETE CASCADE;
```

</details>

### <a id="community-submissions"></a>`community_submissions`

**Rows:** 0 · **PK:** `id` · **FK → :** `crawl_targets`

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `id` | `bigint` |  | `nextval('community_submissions_id_seq'::regclass)` |
| `crawl_target_id` | `bigint` | ✓ |  |
| `institution_name` | `text` |  |  |
| `fee_name` | `text` |  |  |
| `fee_category` | `text` | ✓ |  |
| `amount` | `double precision` | ✓ |  |
| `frequency` | `text` | ✓ |  |
| `source_url` | `text` |  |  |
| `submitter_ip` | `text` | ✓ |  |
| `review_status` | `text` |  | `'pending'::text` |
| `created_at` | `timestamp with time zone` |  | `now()` |

<details><summary>DDL</summary>

```sql
CREATE TABLE public."community_submissions" (
  "id" bigint NOT NULL DEFAULT nextval('community_submissions_id_seq'::regclass),
  "crawl_target_id" bigint,
  "institution_name" text NOT NULL,
  "fee_name" text NOT NULL,
  "fee_category" text,
  "amount" double precision,
  "frequency" text,
  "source_url" text NOT NULL,
  "submitter_ip" text,
  "review_status" text NOT NULL DEFAULT 'pending'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);
ALTER TABLE public."community_submissions" ADD CONSTRAINT "community_submissions_crawl_target_id_fkey" FOREIGN KEY ("crawl_target_id") REFERENCES public."crawl_targets" ("id");
```

</details>

### <a id="coverage-snapshots"></a>`coverage_snapshots`

**Rows:** 12 · **PK:** `id`

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `id` | `bigint` |  | `nextval('coverage_snapshots_id_seq'::regclass)` |
| `snapshot_date` | `text` |  |  |
| `total_institutions` | `integer` |  |  |
| `with_fee_url` | `integer` |  |  |
| `with_fees` | `integer` |  |  |
| `with_approved` | `integer` |  |  |
| `total_fees` | `integer` |  |  |
| `approved_fees` | `integer` |  |  |
| `created_at` | `timestamp with time zone` |  | `now()` |

**Indexes:**
- `coverage_snapshots_snapshot_date_key` (unique)

<details><summary>DDL</summary>

```sql
CREATE TABLE public."coverage_snapshots" (
  "id" bigint NOT NULL DEFAULT nextval('coverage_snapshots_id_seq'::regclass),
  "snapshot_date" text NOT NULL,
  "total_institutions" integer NOT NULL,
  "with_fee_url" integer NOT NULL,
  "with_fees" integer NOT NULL,
  "with_approved" integer NOT NULL,
  "total_fees" integer NOT NULL,
  "approved_fees" integer NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("id"),
  CONSTRAINT "coverage_snapshots_snapshot_date_key" UNIQUE ("snapshot_date")
);
```

</details>

### <a id="demographics"></a>`demographics`

**Rows:** 3,274 · **PK:** `id`

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `id` | `bigint` |  | `nextval('demographics_id_seq'::regclass)` |
| `geo_id` | `text` |  |  |
| `geo_type` | `text` |  |  |
| `geo_name` | `text` | ✓ |  |
| `state_fips` | `text` | ✓ |  |
| `county_fips` | `text` | ✓ |  |
| `median_household_income` | `integer` | ✓ |  |
| `poverty_count` | `integer` | ✓ |  |
| `total_population` | `integer` | ✓ |  |
| `year` | `integer` |  |  |
| `fetched_at` | `timestamp with time zone` |  | `now()` |

**Indexes:**
- `demographics_geo_id_geo_type_year_key` (unique)
- `idx_demographics_geo`

<details><summary>DDL</summary>

```sql
CREATE TABLE public."demographics" (
  "id" bigint NOT NULL DEFAULT nextval('demographics_id_seq'::regclass),
  "geo_id" text NOT NULL,
  "geo_type" text NOT NULL,
  "geo_name" text,
  "state_fips" text,
  "county_fips" text,
  "median_household_income" integer,
  "poverty_count" integer,
  "total_population" integer,
  "year" integer NOT NULL,
  "fetched_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("id"),
  CONSTRAINT "demographics_geo_id_geo_type_year_key" UNIQUE ("geo_id", "geo_type", "year")
);
```

</details>

### <a id="market-concentration"></a>`market_concentration`

**Rows:** 393 · **PK:** `id`

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `id` | `bigint` |  | `nextval('market_concentration_id_seq'::regclass)` |
| `year` | `integer` |  |  |
| `msa_code` | `integer` |  |  |
| `msa_name` | `text` | ✓ |  |
| `total_deposits` | `bigint` | ✓ |  |
| `institution_count` | `integer` | ✓ |  |
| `hhi` | `integer` | ✓ |  |
| `top3_share` | `double precision` | ✓ |  |
| `computed_at` | `timestamp with time zone` |  | `now()` |

**Indexes:**
- `idx_market_concentration_msa`
- `market_concentration_year_msa_code_key` (unique)

<details><summary>DDL</summary>

```sql
CREATE TABLE public."market_concentration" (
  "id" bigint NOT NULL DEFAULT nextval('market_concentration_id_seq'::regclass),
  "year" integer NOT NULL,
  "msa_code" integer NOT NULL,
  "msa_name" text,
  "total_deposits" bigint,
  "institution_count" integer,
  "hhi" integer,
  "top3_share" double precision,
  "computed_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("id"),
  CONSTRAINT "market_concentration_year_msa_code_key" UNIQUE ("year", "msa_code")
);
```

</details>

### <a id="org-members"></a>`org_members`

**Rows:** 0 · **PK:** `id` · **FK → :** `organizations`

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `id` | `bigint` |  | `nextval('org_members_id_seq'::regclass)` |
| `organization_id` | `bigint` |  |  |
| `email` | `text` |  |  |
| `password_hash` | `text` |  |  |
| `name` | `text` | ✓ |  |
| `role` | `text` |  | `'member'::text` |
| `created_at` | `timestamp with time zone` |  | `now()` |

**Indexes:**
- `idx_org_members_email` (unique)
- `org_members_organization_id_email_key` (unique)

<details><summary>DDL</summary>

```sql
CREATE TABLE public."org_members" (
  "id" bigint NOT NULL DEFAULT nextval('org_members_id_seq'::regclass),
  "organization_id" bigint NOT NULL,
  "email" text NOT NULL,
  "password_hash" text NOT NULL,
  "name" text,
  "role" text NOT NULL DEFAULT 'member'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("id"),
  CONSTRAINT "org_members_organization_id_email_key" UNIQUE ("organization_id", "email")
);
ALTER TABLE public."org_members" ADD CONSTRAINT "org_members_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES public."organizations" ("id");
```

</details>

### <a id="organizations"></a>`organizations`

**Rows:** 0 · **PK:** `id`

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `id` | `bigint` |  | `nextval('organizations_id_seq'::regclass)` |
| `name` | `text` |  |  |
| `slug` | `text` |  |  |
| `charter_type` | `text` | ✓ |  |
| `asset_tier` | `text` | ✓ |  |
| `cert_number` | `text` | ✓ |  |
| `stripe_customer_id` | `text` | ✓ |  |
| `created_at` | `timestamp with time zone` |  | `now()` |
| `updated_at` | `timestamp with time zone` |  | `now()` |

**Indexes:**
- `organizations_slug_key` (unique)
- `organizations_stripe_customer_id_key` (unique)

<details><summary>DDL</summary>

```sql
CREATE TABLE public."organizations" (
  "id" bigint NOT NULL DEFAULT nextval('organizations_id_seq'::regclass),
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "charter_type" text,
  "asset_tier" text,
  "cert_number" text,
  "stripe_customer_id" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("id"),
  CONSTRAINT "organizations_slug_key" UNIQUE ("slug"),
  CONSTRAINT "organizations_stripe_customer_id_key" UNIQUE ("stripe_customer_id")
);
```

</details>

### <a id="pipeline-runs"></a>`pipeline_runs`

**Rows:** 5 · **PK:** `id`

| Column | Type | Nullable | Default |
|---|---|:---:|---|
| `id` | `bigint` |  | `nextval('pipeline_runs_id_seq'::regclass)` |
| `status` | `text` |  | `'running'::text` |
| `last_completed_phase` | `integer` | ✓ | `0` |
| `last_completed_job` | `text` | ✓ |  |
| `config_json` | `jsonb` | ✓ |  |
| `started_at` | `timestamp with time zone` |  | `now()` |
| `completed_at` | `timestamp with time zone` | ✓ |  |
| `error_msg` | `text` | ✓ |  |
| `inst_count` | `integer` | ✓ |  |
| `summary_json` | `jsonb` | ✓ |  |

<details><summary>DDL</summary>

```sql
CREATE TABLE public."pipeline_runs" (
  "id" bigint NOT NULL DEFAULT nextval('pipeline_runs_id_seq'::regclass),
  "status" text NOT NULL DEFAULT 'running'::text,
  "last_completed_phase" integer DEFAULT 0,
  "last_completed_job" text,
  "config_json" jsonb,
  "started_at" timestamp with time zone NOT NULL DEFAULT now(),
  "completed_at" timestamp with time zone,
  "error_msg" text,
  "inst_count" integer,
  "summary_json" jsonb,
  PRIMARY KEY ("id")
);
```

</details>

---
