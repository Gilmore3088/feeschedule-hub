---
phase: 62A
plan: 03
type: execute
wave: 0
depends_on: []
files_modified:
  - supabase/migrations/20260418_fees_tier_tables.sql
  - supabase/migrations/20260418_tier_promotion_functions.sql
autonomous: true
requirements:
  - TIER-01
  - TIER-02
  - TIER-03
  - TIER-04
  - TIER-05
must_haves:
  truths:
    - "Developer can SELECT * FROM fees_raw, fees_verified, fees_published without error"
    - "fees_verified.canonical_fee_key is NOT NULL (Phase 55 foundation enforced at Tier 2)"
    - "fees_published.lineage_ref references fees_verified.fee_verified_id (FK enforced)"
    - "promote_to_tier2(p_fee_raw_id bigint, p_agent_name text, p_reasoning_hash bytea, p_verified_by_agent_event_id uuid) function signature exists"
    - "promote_to_tier3(p_fee_verified_id bigint, p_adversarial_event_id uuid) function signature exists"
    - "test_sc3_three_tiers_resolve, test_tier1, test_tier2, test_tier3 pass"
    - "test_promote_to_tier2_function_exists and test_promote_to_tier3_function_exists pass"
  artifacts:
    - path: "supabase/migrations/20260418_fees_tier_tables.sql"
      provides: "Three-tier fees tables (Raw/Verified/Published) with full denormalized lineage columns"
      contains: "CREATE TABLE IF NOT EXISTS fees_raw"
    - path: "supabase/migrations/20260418_tier_promotion_functions.sql"
      provides: "promote_to_tier2 + promote_to_tier3 SQL function stubs; logged to agent_events"
      contains: "CREATE OR REPLACE FUNCTION promote_to_tier2"
  key_links:
    - from: "fees_verified.fee_raw_id"
      to: "fees_raw.fee_raw_id"
      via: "REFERENCES fee_raw_id enforced at DB level"
      pattern: "REFERENCES fees_raw"
    - from: "fees_published.lineage_ref"
      to: "fees_verified.fee_verified_id"
      via: "REFERENCES fee_verified_id enforced at DB level"
      pattern: "REFERENCES fees_verified"
    - from: "promote_to_tier2()"
      to: "agent_events"
      via: "INSERT INTO agent_events on promotion; raises if p_agent_name <> 'darwin'"
      pattern: "INSERT INTO agent_events"
---

<objective>
Land the three-tier fee tables (Raw/Verified/Published) per D-01/D-02 and the SQL functions `promote_to_tier2` (TIER-04) and `promote_to_tier3` (TIER-05 — stub for 62b protocol wiring) per D-03. Enforce Phase 55 canonical_fee_key at Tier 2 as NOT NULL. Denormalize lineage columns on every tier row so OBS-02's one-query full trace becomes trivial.

Purpose: Every agent's read surface terminates at Tier 3 (Hamilton), and Knox's writes start at Tier 1. These three tables are the data-layer spine of the v10.0 architecture. Promotion functions are the only path between tiers — Darwin exclusively owns Tier 1→2, and Tier 2→3 requires adversarial handshake.

Output: Two migrations that land the three tables + two promotion SQL functions; schema probe + promotion-function-exists tests pass.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/62A-agent-foundation-data-layer/62A-CONTEXT.md
@.planning/phases/62A-agent-foundation-data-layer/62A-RESEARCH.md
@.planning/phases/62A-agent-foundation-data-layer/62A-VALIDATION.md
@supabase/migrations/20260409_canonical_fee_key.sql
@supabase/migrations/20260417_agent_events_partitioned.sql
@fee_crawler/tests/test_tier_schemas.py
@fee_crawler/tests/test_tier_promotion.py
</context>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Darwin → Tier 2 promotion | Only Darwin may call promote_to_tier2; function raises if p_agent_name != 'darwin' |
| Adversarial gate → Tier 3 promotion | 62a ships function stub; 62b wires Darwin+Knox handshake check |
| Tier 3 → Hamilton read | Hamilton is read-only on Tier 3; Plan 62A-13 confirms no UPDATE tool exists for fees_published |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-62A03-01 | Spoofing | Any agent could call promote_to_tier2 pretending to be Darwin | high | mitigate | Function body `IF p_agent_name <> 'darwin' THEN RAISE EXCEPTION`. SEC-04 (Phase 68) adds RLS so only the `darwin_agent` Postgres role can execute. Tested in test_darwin_only (Plan 62A-06) |
| T-62A03-02 | Tampering | Direct UPDATE to fees_verified bypassing promote_to_tier2 | high | mitigate | Plan 62A-09 write-CRUD tool layer is the only sanctioned update path; gateway writes agent_auth_log. SEC-04 adds table-level RLS DENY for non-service-role |
| T-62A03-03 | Information Disclosure | Denormalized source_url exposes document paths to Hamilton readers | low | accept | Documents are public fee schedules by design; source_url is a feature (OBS-03 "trace to source in 3 clicks") |
| T-62A03-04 | Repudiation | promote_to_tier2 writes agent_events row but reasoning_hash input is caller-supplied | medium | mitigate | Gateway computes reasoning_hash server-side; function receives it as parameter but SC-level test (Plan 62A-13) asserts hash is non-null and 32 bytes |
| T-62A03-05 | Denial of Service | Bulk promotion loop could write millions of agent_events rows | medium | accept | 18-month retention + partition rotation caps size; Atlas cost budget (Plan 62A-04) halts Darwin before runaway spend |
</threat_model>

<tasks>

<task type="auto">
  <name>Task 1: Write supabase/migrations/20260418_fees_tier_tables.sql</name>
  <files>supabase/migrations/20260418_fees_tier_tables.sql</files>
  <read_first>
    - .planning/phases/62A-agent-foundation-data-layer/62A-RESEARCH.md §7.6 (fees_raw / fees_verified / fees_published SQL)
    - .planning/phases/62A-agent-foundation-data-layer/62A-CONTEXT.md D-01, D-02, D-03 (tier decisions)
    - supabase/migrations/20260409_canonical_fee_key.sql (canonical_fee_key column type)
    - fee_crawler/tests/test_tier_schemas.py (required column sets)
  </read_first>
  <action>
Create `supabase/migrations/20260418_fees_tier_tables.sql` with exactly this content:

```sql
-- Phase 62a — TIER-01, TIER-02, TIER-03
-- Three-tier fee tables (Raw/Verified/Published) with heavy lineage denormalization per D-02.
-- Parallel to legacy extracted_fees (frozen for writes in plan 62A-12, reads preserved for Phase 66).

-- ========================================================================
-- TIER 1: Raw — Knox state agents append here; immutable amount/content.
-- ========================================================================
CREATE TABLE IF NOT EXISTS fees_raw (
    fee_raw_id              BIGSERIAL PRIMARY KEY,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Lineage (denormalized; required where the data supports it)
    institution_id          INTEGER NOT NULL,  -- FK to crawl_targets.id NOT enforced here because crawl_targets may be seeded/rewritten independently
    crawl_event_id          INTEGER,            -- crawl_results.id (optional for migration_v10 rows)
    document_r2_key         TEXT,
    source_url              TEXT,
    extraction_confidence   NUMERIC(5,4),
    agent_event_id          UUID NOT NULL,      -- Knox's extract event (sentinel uuid for migration_v10 rows)

    -- Content
    fee_name                TEXT NOT NULL,
    amount                  NUMERIC(12,2),
    frequency               TEXT,
    conditions              TEXT,

    -- Control
    outlier_flags           JSONB NOT NULL DEFAULT '[]'::jsonb,  -- Darwin can tag without re-promoting
    source                  TEXT NOT NULL DEFAULT 'knox'
                            CHECK (source IN ('knox','migration_v10','manual_import'))
);

COMMENT ON TABLE fees_raw IS 'Phase 62a TIER-01 Raw: append-only fees from Knox state agents + one-shot migration backfill (plan 62A-12). Immutable amount fields; outlier_flags may be updated.';
COMMENT ON COLUMN fees_raw.agent_event_id IS 'Logical FK to agent_events.event_id; sentinel 00000000-0000-0000-0000-000000000000 for migration_v10 rows pre-v10.0.';

CREATE INDEX IF NOT EXISTS fees_raw_institution_time_idx
    ON fees_raw (institution_id, created_at DESC);
CREATE INDEX IF NOT EXISTS fees_raw_agent_event_idx
    ON fees_raw (agent_event_id);
-- Partial index for lineage-missing (KNOX-09 remediation queue)
CREATE INDEX IF NOT EXISTS fees_raw_lineage_missing_idx
    ON fees_raw (institution_id) WHERE outlier_flags ? 'lineage_missing';
CREATE INDEX IF NOT EXISTS fees_raw_source_idx
    ON fees_raw (source, created_at DESC);

-- ========================================================================
-- TIER 2: Verified — Darwin-verified; canonical_fee_key NOT NULL enforced.
-- ========================================================================
CREATE TABLE IF NOT EXISTS fees_verified (
    fee_verified_id             BIGSERIAL PRIMARY KEY,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Lineage back to Tier 1
    fee_raw_id                  BIGINT NOT NULL REFERENCES fees_raw(fee_raw_id),

    -- Denormalized from Tier 1 (for OBS-02 one-query trace)
    institution_id              INTEGER NOT NULL,
    source_url                  TEXT,
    document_r2_key             TEXT,
    extraction_confidence       NUMERIC(5,4),

    -- Tier 2-specific
    canonical_fee_key           TEXT NOT NULL,   -- Phase 55 foundation MANDATORY at Tier 2
    variant_type                TEXT,
    outlier_flags               JSONB NOT NULL DEFAULT '[]'::jsonb,
    verified_by_agent_event_id  UUID NOT NULL,   -- Darwin's verification event

    -- Content snapshot from Tier 1 (immutable)
    fee_name                    TEXT NOT NULL,
    amount                      NUMERIC(12,2),
    frequency                   TEXT,

    review_status               TEXT NOT NULL DEFAULT 'verified'
                                CHECK (review_status IN ('verified','challenged','rejected','approved'))
);

COMMENT ON TABLE fees_verified IS 'Phase 62a TIER-02 Business: Darwin-verified fees; canonical_fee_key NOT NULL. Promoted from fees_raw via promote_to_tier2().';

CREATE INDEX IF NOT EXISTS fees_verified_canonical_institution_idx
    ON fees_verified (canonical_fee_key, institution_id);
CREATE INDEX IF NOT EXISTS fees_verified_raw_idx
    ON fees_verified (fee_raw_id);
CREATE INDEX IF NOT EXISTS fees_verified_status_idx
    ON fees_verified (review_status, created_at DESC);

-- ========================================================================
-- TIER 3: Published — adversarial-gated, Hamilton-consumable. INSERT-only (no UPDATE/DELETE).
-- ========================================================================
CREATE TABLE IF NOT EXISTS fees_published (
    fee_published_id                    BIGSERIAL PRIMARY KEY,
    published_at                        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Lineage chain (denormalized; one-query trace)
    lineage_ref                         BIGINT NOT NULL REFERENCES fees_verified(fee_verified_id),
    institution_id                      INTEGER NOT NULL,
    canonical_fee_key                   TEXT NOT NULL,
    source_url                          TEXT,
    document_r2_key                     TEXT,
    extraction_confidence               NUMERIC(5,4),
    agent_event_id                      UUID,        -- Knox's original extract event
    verified_by_agent_event_id          UUID,        -- Darwin's verification event
    published_by_adversarial_event_id   UUID NOT NULL,  -- Handshake event from 62b

    -- Content (immutable once published)
    fee_name                            TEXT NOT NULL,
    amount                              NUMERIC(12,2),
    frequency                           TEXT,
    variant_type                        TEXT,
    coverage_tier                       TEXT
                                        CHECK (coverage_tier IN ('strong','provisional','insufficient') OR coverage_tier IS NULL)
);

COMMENT ON TABLE fees_published IS 'Phase 62a TIER-03 Presentation: adversarial-gated, Hamilton-consumable. INSERT-only by design; no UPDATE/DELETE tools in 62a. Phase 66 Hamilton refactor reads here.';

CREATE INDEX IF NOT EXISTS fees_published_canonical_institution_idx
    ON fees_published (canonical_fee_key, institution_id);
CREATE INDEX IF NOT EXISTS fees_published_institution_time_idx
    ON fees_published (institution_id, published_at DESC);
CREATE INDEX IF NOT EXISTS fees_published_lineage_idx
    ON fees_published (lineage_ref);
```

Note: `institution_id` on all three tiers is NOT FK-constrained to `crawl_targets(id)` because `crawl_targets` may be deleted/rewritten; application-layer integrity + the gateway ensures consistency.
  </action>
  <verify>
    <automated>export DATABASE_URL_TEST="${DATABASE_URL_TEST:-postgres://postgres:postgres@localhost:5433/bfi_test}" && pytest fee_crawler/tests/test_tier_schemas.py fee_crawler/tests/test_sc3_tier_schema_contract.py -v --no-header</automated>
  </verify>
  <acceptance_criteria>
    - File exists: `supabase/migrations/20260418_fees_tier_tables.sql`
    - Contains `CREATE TABLE IF NOT EXISTS fees_raw`, `CREATE TABLE IF NOT EXISTS fees_verified`, `CREATE TABLE IF NOT EXISTS fees_published`
    - fees_verified has `canonical_fee_key           TEXT NOT NULL`
    - fees_verified has `fee_raw_id                  BIGINT NOT NULL REFERENCES fees_raw(fee_raw_id)`
    - fees_published has `lineage_ref                         BIGINT NOT NULL REFERENCES fees_verified(fee_verified_id)`
    - fees_published has `published_by_adversarial_event_id   UUID NOT NULL`
    - At least 10 `CREATE INDEX IF NOT EXISTS fees_` lines
    - pytest passes: `test_tier1`, `test_tier2`, `test_tier3`, `test_sc3_three_tiers_resolve`
  </acceptance_criteria>
  <done>Three-tier fee tables land with full lineage denormalization, canonical_fee_key NOT NULL at Tier 2, FK constraints fees_raw→fees_verified→fees_published; all TIER-01/02/03 schema tests pass.</done>
</task>

<task type="auto">
  <name>Task 2: Write supabase/migrations/20260418_tier_promotion_functions.sql</name>
  <files>supabase/migrations/20260418_tier_promotion_functions.sql</files>
  <read_first>
    - supabase/migrations/20260418_fees_tier_tables.sql (column names + types)
    - .planning/phases/62A-agent-foundation-data-layer/62A-CONTEXT.md §D-03 (promotion mechanics)
    - fee_crawler/tests/test_tier_promotion.py (what tests assert: function existence + darwin-only)
  </read_first>
  <action>
Create `supabase/migrations/20260418_tier_promotion_functions.sql` with exactly this content:

```sql
-- Phase 62a — TIER-04, TIER-05
-- Tier 1 -> Tier 2 promotion function: Darwin-only; logged to agent_events.
-- Tier 2 -> Tier 3 promotion function: stub signature this phase; 62b wires adversarial handshake.

-- ========================================================================
-- promote_to_tier2: Darwin verifies a fees_raw row and inserts fees_verified.
-- ========================================================================
CREATE OR REPLACE FUNCTION promote_to_tier2(
    p_fee_raw_id                  BIGINT,
    p_agent_name                  TEXT,
    p_reasoning_hash              BYTEA,
    p_verified_by_agent_event_id  UUID,
    p_canonical_fee_key           TEXT,
    p_variant_type                TEXT DEFAULT NULL,
    p_outlier_flags               JSONB DEFAULT '[]'::jsonb
) RETURNS BIGINT
LANGUAGE plpgsql AS $$
DECLARE
    v_raw          fees_raw%ROWTYPE;
    v_verified_id  BIGINT;
BEGIN
    -- TIER-04 gate: only Darwin may promote to Tier 2.
    IF p_agent_name IS DISTINCT FROM 'darwin' THEN
        RAISE EXCEPTION 'promote_to_tier2: only darwin may promote (got %)', p_agent_name
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF p_canonical_fee_key IS NULL OR length(p_canonical_fee_key) = 0 THEN
        RAISE EXCEPTION 'promote_to_tier2: canonical_fee_key required at Tier 2 (Phase 55 contract)';
    END IF;

    -- Load the Tier 1 row (locking it for concurrent-promotion safety).
    SELECT * INTO v_raw FROM fees_raw WHERE fee_raw_id = p_fee_raw_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'promote_to_tier2: fees_raw.fee_raw_id=% not found', p_fee_raw_id;
    END IF;

    -- Insert the verified row with denormalized lineage copied from Tier 1.
    INSERT INTO fees_verified (
        fee_raw_id, institution_id, source_url, document_r2_key,
        extraction_confidence, canonical_fee_key, variant_type, outlier_flags,
        verified_by_agent_event_id, fee_name, amount, frequency, review_status
    ) VALUES (
        v_raw.fee_raw_id, v_raw.institution_id, v_raw.source_url, v_raw.document_r2_key,
        v_raw.extraction_confidence, p_canonical_fee_key, p_variant_type, p_outlier_flags,
        p_verified_by_agent_event_id, v_raw.fee_name, v_raw.amount, v_raw.frequency, 'verified'
    ) RETURNING fee_verified_id INTO v_verified_id;

    -- Log to agent_events. Caller is expected to have already opened a tx via gateway;
    -- this insert is part of the same transaction.
    INSERT INTO agent_events (
        agent_name, action, tool_name, entity, entity_id, status,
        parent_event_id, reasoning_hash,
        input_payload, output_payload
    ) VALUES (
        p_agent_name, 'promote_to_tier2', 'promote_to_tier2', 'fees_verified',
        v_verified_id::TEXT, 'success',
        p_verified_by_agent_event_id, p_reasoning_hash,
        jsonb_build_object('fee_raw_id', p_fee_raw_id, 'canonical_fee_key', p_canonical_fee_key),
        jsonb_build_object('fee_verified_id', v_verified_id)
    );

    RETURN v_verified_id;
END;
$$;

COMMENT ON FUNCTION promote_to_tier2(BIGINT, TEXT, BYTEA, UUID, TEXT, TEXT, JSONB) IS
    'Phase 62a TIER-04: promotes a fees_raw row to fees_verified. Darwin-only; writes an agent_events row in the same transaction.';

-- ========================================================================
-- promote_to_tier3: stub signature; 62b wires Darwin+Knox adversarial handshake.
-- ========================================================================
CREATE OR REPLACE FUNCTION promote_to_tier3(
    p_fee_verified_id       BIGINT,
    p_adversarial_event_id  UUID
) RETURNS BIGINT
LANGUAGE plpgsql AS $$
DECLARE
    v_verified     fees_verified%ROWTYPE;
    v_published_id BIGINT;
    v_handshake_ok BOOLEAN;
BEGIN
    -- TIER-05 gate: require a resolved adversarial message pair. In 62a the check is stubbed —
    -- 62b wires the actual Darwin/Knox handshake lookup against agent_messages.
    SELECT EXISTS (
        SELECT 1 FROM agent_messages
        WHERE correlation_id = (
            SELECT correlation_id FROM agent_events WHERE event_id = p_adversarial_event_id
        )
        AND state = 'resolved'
    ) INTO v_handshake_ok;

    IF NOT v_handshake_ok THEN
        -- Stub behavior: permit promotion for 62a so downstream tests of the tier 3 insert path work.
        -- 62b replaces this `RAISE NOTICE` with a RAISE EXCEPTION enforcing the handshake.
        RAISE NOTICE 'promote_to_tier3: adversarial handshake not yet wired (62b). Permitting for 62a bootstrap.';
    END IF;

    SELECT * INTO v_verified FROM fees_verified WHERE fee_verified_id = p_fee_verified_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'promote_to_tier3: fees_verified.fee_verified_id=% not found', p_fee_verified_id;
    END IF;

    INSERT INTO fees_published (
        lineage_ref, institution_id, canonical_fee_key,
        source_url, document_r2_key, extraction_confidence,
        agent_event_id, verified_by_agent_event_id, published_by_adversarial_event_id,
        fee_name, amount, frequency, variant_type
    ) VALUES (
        v_verified.fee_verified_id, v_verified.institution_id, v_verified.canonical_fee_key,
        v_verified.source_url, v_verified.document_r2_key, v_verified.extraction_confidence,
        NULL,  -- filled in by 62b by walking fee_raw_id -> fees_raw.agent_event_id
        v_verified.verified_by_agent_event_id, p_adversarial_event_id,
        v_verified.fee_name, v_verified.amount, v_verified.frequency, v_verified.variant_type
    ) RETURNING fee_published_id INTO v_published_id;

    INSERT INTO agent_events (
        agent_name, action, tool_name, entity, entity_id, status,
        parent_event_id
    ) VALUES (
        '_adversarial', 'promote_to_tier3', 'promote_to_tier3', 'fees_published',
        v_published_id::TEXT, 'success', p_adversarial_event_id
    );

    RETURN v_published_id;
END;
$$;

COMMENT ON FUNCTION promote_to_tier3(BIGINT, UUID) IS
    'Phase 62a TIER-05 stub: promotes fees_verified -> fees_published. 62b replaces the handshake RAISE NOTICE with a RAISE EXCEPTION when the adversarial check fails.';
```

Key design choices for the executor:
- `promote_to_tier2` does an `INSERT INTO agent_events` inside the function body. This works because the gateway (Plan 62A-05) opens the transaction before calling this function; the insert here is the "promote" event row in the same tx.
- `promote_to_tier3` in 62a intentionally does NOT reject on a missing handshake (RAISE NOTICE, not RAISE EXCEPTION) so 62a integration tests can exercise the insert path. 62b tightens this to an exception.
- `FOR UPDATE` row lock prevents concurrent promotion of the same Tier 1 row to duplicates.
  </action>
  <verify>
    <automated>export DATABASE_URL_TEST="${DATABASE_URL_TEST:-postgres://postgres:postgres@localhost:5433/bfi_test}" && pytest fee_crawler/tests/test_tier_promotion.py -v --no-header</automated>
  </verify>
  <acceptance_criteria>
    - File exists: `supabase/migrations/20260418_tier_promotion_functions.sql`
    - Contains `CREATE OR REPLACE FUNCTION promote_to_tier2(`
    - Contains `CREATE OR REPLACE FUNCTION promote_to_tier3(`
    - `grep -c "IF p_agent_name IS DISTINCT FROM 'darwin'" supabase/migrations/20260418_tier_promotion_functions.sql` returns 1
    - `grep -c "INSERT INTO agent_events" supabase/migrations/20260418_tier_promotion_functions.sql` returns 2
    - pytest passes: `test_promote_to_tier2_function_exists`, `test_promote_to_tier3_function_exists`, `test_adversarial_gate_exists` (but `test_adversarial_gate_exists` needs agent_messages table — delivered Plan 62A-04 — mark as xfail if run before 62A-04 merges, or run after 62A-04)
  </acceptance_criteria>
  <done>Two promotion SQL functions land; promote_to_tier2 enforces Darwin identity + logs agent_events; promote_to_tier3 is a callable stub for 62a bootstrap with 62b's stricter handshake noted in the function comment.</done>
</task>

</tasks>

<verification>
Run `pytest fee_crawler/tests/test_tier_schemas.py fee_crawler/tests/test_tier_promotion.py fee_crawler/tests/test_sc3_tier_schema_contract.py -v` against a freshly-bootstrapped db_schema fixture. Expect: `test_tier1`, `test_tier2`, `test_tier3`, `test_sc3_three_tiers_resolve`, `test_promote_to_tier2_function_exists`, `test_promote_to_tier3_function_exists` all PASS. `test_darwin_only` is xfailed (integration test in Plan 62A-06).

Manual: In a psql session against the test schema, `SELECT promote_to_tier2(1, 'knox', '\x00'::bytea, gen_random_uuid(), 'test.key');` should RAISE with `insufficient_privilege`; `SELECT promote_to_tier2(1, 'darwin', ...)` against a non-existent fee_raw_id should RAISE with "not found".
</verification>

<success_criteria>
- Three tier tables exist with full denormalized lineage columns (TIER-01, 02, 03)
- canonical_fee_key enforced NOT NULL at Tier 2
- FK constraints enforce fees_raw → fees_verified → fees_published chain
- promote_to_tier2 function exists, enforces Darwin-only, logs to agent_events (TIER-04)
- promote_to_tier3 function exists as callable stub; NOTICE on missing handshake (62b tightens) (TIER-05)
- All six tier-related tests pass
</success_criteria>

<output>
After completion, create `.planning/phases/62A-agent-foundation-data-layer/62A-03-SUMMARY.md` noting:
- Three tier tables landed
- Two promotion SQL functions landed
- TIER-04 Darwin-only gate enforced in function body
- TIER-05 stub permits insert for 62a bootstrap; documented that 62b replaces RAISE NOTICE with RAISE EXCEPTION
</output>
