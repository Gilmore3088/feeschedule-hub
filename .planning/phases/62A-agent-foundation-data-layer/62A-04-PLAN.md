---
phase: 62A
plan: 04
type: execute
wave: 0
depends_on: []
files_modified:
  - supabase/migrations/20260418_agent_messages.sql
  - supabase/migrations/20260419_agent_registry_and_budgets.sql
  - supabase/migrations/20260419_institution_dossiers.sql
autonomous: true
requirements:
  - AGENT-05
must_haves:
  truths:
    - "Developer can SELECT * FROM agent_messages LIMIT 0 (table exists, empty)"
    - "Developer can SELECT * FROM agent_registry LIMIT 0 returns seeded rows: hamilton, knox, darwin, atlas"
    - "Developer can SELECT * FROM agent_budgets LIMIT 0 returns seeded default budgets"
    - "Developer can SELECT * FROM institution_dossiers LIMIT 0 (table exists, empty)"
    - "agent_registry.role CHECK constraint accepts supervisor|data|classifier|orchestrator|analyst|state_agent only"
    - "agent_budgets FK to agent_registry enforces identity consistency"
  artifacts:
    - path: "supabase/migrations/20260418_agent_messages.sql"
      provides: "agent_messages table (empty in 62a; 62b wires protocol)"
      contains: "CREATE TABLE IF NOT EXISTS agent_messages"
    - path: "supabase/migrations/20260419_agent_registry_and_budgets.sql"
      provides: "agent_registry + agent_budgets tables with seeds for 4 top-level agents + 51 state agents"
      contains: "CREATE TABLE IF NOT EXISTS agent_registry"
    - path: "supabase/migrations/20260419_institution_dossiers.sql"
      provides: "Knox per-institution strategy memory table (empty in 62a, populated in Phase 63)"
      contains: "CREATE TABLE IF NOT EXISTS institution_dossiers"
  key_links:
    - from: "agent_budgets.agent_name"
      to: "agent_registry.agent_name"
      via: "FOREIGN KEY constraint"
      pattern: "REFERENCES agent_registry"
    - from: "institution_dossiers.institution_id"
      to: "crawl_targets.id"
      via: "FOREIGN KEY REFERENCES crawl_targets(id)"
      pattern: "REFERENCES crawl_targets"
---

<objective>
Land the remaining new-entity tables required by the agent data layer: `agent_messages` (empty; 62b wires handshake protocol), `agent_registry` + `agent_budgets` (seeded with Hamilton, Knox, Darwin, Atlas + 51 state agents + default budgets), and `institution_dossiers` (KNOX-03 strategy memory, empty in 62a; Phase 63 populates).

Purpose: The gateway (Plan 62A-05) reads `agent_budgets` for cost-quota enforcement. The tool layer (Plans 62A-09..12) operates CRUD against all 33 entities including these four. Without seeded registry data, budget lookups fail with "agent unknown" before any tool runs.

Output: Three migrations that land the tables + seed rows; all TIER/AGENT schema probe tests continue to pass; `agent_messages` test probe confirms empty table exists.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/62A-agent-foundation-data-layer/62A-CONTEXT.md
@.planning/phases/62A-agent-foundation-data-layer/62A-RESEARCH.md
@.planning/phases/62A-agent-foundation-data-layer/62A-VALIDATION.md
@supabase/migrations/20260417_agent_events_partitioned.sql
@supabase/migrations/20260418_fees_tier_tables.sql
@fee_crawler/tests/test_tier_promotion.py
</context>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Gateway → agent_budgets | Reads budget, optionally overrides from env var, accounts spent_cents. Write-isolation by service role |
| agent_registry.is_active flag | Disabled agents cannot execute tools; gateway short-circuits |
| institution_dossiers.updated_by_agent_event_id | Logical FK; not DB-enforced across partitions |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-62A04-01 | Spoofing | Agent writes budget rows for other agents | high | mitigate | Plan 62A-05 gateway hardcodes `x-agent-name` from request header; RLS in SEC-04 adds row-level enforcement |
| T-62A04-02 | Tampering | Agent resets its own spent_cents to 0 | high | mitigate | No tool exposed for UPDATE agent_budgets.spent_cents directly; only the gateway's internal `_account_budget` modifies this column. Plan 62A-09 verifies no registered tool writes spent_cents |
| T-62A04-03 | Denial of Service | Floods to agent_messages | medium | accept | 62a ships empty table; rate-limiting is 62b's responsibility when the protocol comes online |
| T-62A04-04 | Information Disclosure | institution_dossiers.notes JSONB leaks agent reasoning | low | accept | Dossier notes are internal-only; admin-only MCP read surface (Plan 62A-13) requires X-MCP-API-KEY |
| T-62A04-05 | Repudiation | State agent writes dossier without logging to agent_events | medium | mitigate | All writes go through the gateway (Plan 62A-05); `updated_by_agent_event_id` column is populated by the gateway on every upsert |
</threat_model>

<tasks>

<task type="auto">
  <name>Task 1: Write supabase/migrations/20260418_agent_messages.sql</name>
  <files>supabase/migrations/20260418_agent_messages.sql</files>
  <read_first>
    - .planning/phases/62A-agent-foundation-data-layer/62A-RESEARCH.md §7.3 (agent_messages schema)
    - .planning/phases/62A-agent-foundation-data-layer/62A-CONTEXT.md §D-03 (62a ships table empty; 62b wires)
    - fee_crawler/tests/test_tier_promotion.py::test_adversarial_gate_exists (probes for the table)
  </read_first>
  <action>
Create `supabase/migrations/20260418_agent_messages.sql` with exactly this content:

```sql
-- Phase 62a — AGENT-05 (entity #32), foreshadows COMMS-01..05 (Phase 62b)
-- agent_messages: inter-agent handshake protocol. Empty in 62a; 62b wires send/receive logic.

CREATE TABLE IF NOT EXISTS agent_messages (
    message_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sender_agent          TEXT NOT NULL,
    recipient_agent       TEXT NOT NULL,
    intent                TEXT NOT NULL CHECK (intent IN (
                            'challenge','prove','accept','reject','escalate',
                            'coverage_request','clarify'
                          )),
    state                 TEXT NOT NULL DEFAULT 'open' CHECK (state IN (
                            'open','answered','resolved','escalated','expired'
                          )),
    correlation_id        UUID NOT NULL,
    parent_message_id     UUID REFERENCES agent_messages(message_id),
    parent_event_id       UUID,
    payload               JSONB NOT NULL DEFAULT '{}'::jsonb,
    round_number          INTEGER NOT NULL DEFAULT 1,
    expires_at            TIMESTAMPTZ,
    resolved_at           TIMESTAMPTZ,
    resolved_by_event_id  UUID
);

COMMENT ON TABLE agent_messages IS 'Phase 62a: empty table. Phase 62b wires handshake protocol (Darwin<->Knox challenge/prove/accept/reject, Atlas escalation on N unresolved rounds).';
COMMENT ON COLUMN agent_messages.intent IS 'COMMS-01..05 + coverage_request (HAM-05 demand reflection) + clarify (discretion add).';
COMMENT ON COLUMN agent_messages.round_number IS 'Escalation counter: after N unresolved rounds, Atlas routes to daily digest (ATLAS-04).';

CREATE INDEX IF NOT EXISTS agent_messages_recipient_state_idx
    ON agent_messages (recipient_agent, state, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_messages_correlation_idx
    ON agent_messages (correlation_id);
CREATE INDEX IF NOT EXISTS agent_messages_expires_idx
    ON agent_messages (expires_at) WHERE expires_at IS NOT NULL AND state = 'open';
```
  </action>
  <verify>
    <automated>export DATABASE_URL_TEST="${DATABASE_URL_TEST:-postgres://postgres:postgres@localhost:5433/bfi_test}" && pytest fee_crawler/tests/test_tier_promotion.py::test_adversarial_gate_exists -v --no-header</automated>
  </verify>
  <acceptance_criteria>
    - File exists with `CREATE TABLE IF NOT EXISTS agent_messages`
    - Intent CHECK contains `challenge,prove,accept,reject,escalate,coverage_request,clarify` (exactly 7 values)
    - State CHECK contains `open,answered,resolved,escalated,expired` (5 values)
    - 3 `CREATE INDEX IF NOT EXISTS agent_messages_` lines
    - `test_adversarial_gate_exists` passes
  </acceptance_criteria>
  <done>agent_messages table lands empty with full intent + state enums and 3 indexes; probe test passes.</done>
</task>

<task type="auto">
  <name>Task 2: Write supabase/migrations/20260419_agent_registry_and_budgets.sql with seeds</name>
  <files>supabase/migrations/20260419_agent_registry_and_budgets.sql</files>
  <read_first>
    - .planning/phases/62A-agent-foundation-data-layer/62A-RESEARCH.md §7.4 (agent_registry + agent_budgets + seed pattern)
    - .planning/phases/62A-agent-foundation-data-layer/62A-CONTEXT.md §D-06 (agent name enum includes knox|darwin|atlas|hamilton|state_<abbr>)
  </read_first>
  <action>
Create `supabase/migrations/20260419_agent_registry_and_budgets.sql` with exactly this content. The seed block uses a PL/pgSQL loop to generate all 51 state agents (50 states + DC) to avoid a 51-line INSERT VALUES clause.

```sql
-- Phase 62a — AGENT-05 (entity #33)
-- agent_registry: source of truth for agent identity + hierarchy.
-- agent_budgets: per-agent cost quotas (per_cycle | per_batch | per_report | per_day | per_month).

-- ========================================================================
-- agent_registry
-- ========================================================================
CREATE TABLE IF NOT EXISTS agent_registry (
    agent_name      TEXT PRIMARY KEY,
    display_name    TEXT NOT NULL,
    description     TEXT,
    role            TEXT NOT NULL CHECK (role IN (
                      'supervisor','data','classifier','orchestrator','analyst','state_agent'
                    )),
    parent_agent    TEXT REFERENCES agent_registry(agent_name),
    state_code      TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    last_run_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (
        (role = 'state_agent' AND state_code IS NOT NULL AND length(state_code) = 2)
        OR (role <> 'state_agent' AND state_code IS NULL)
    )
);

COMMENT ON TABLE agent_registry IS 'Phase 62a AGENT-05: canonical agent identity table. 4 top-level + 51 state agents seeded.';
COMMENT ON COLUMN agent_registry.role IS 'state_agent is the only role permitted to have state_code; all others must have state_code IS NULL.';

-- ========================================================================
-- agent_budgets
-- ========================================================================
CREATE TABLE IF NOT EXISTS agent_budgets (
    agent_name         TEXT NOT NULL REFERENCES agent_registry(agent_name) ON DELETE CASCADE,
    window             TEXT NOT NULL CHECK (window IN (
                         'per_cycle','per_batch','per_report','per_day','per_month'
                       )),
    limit_cents        INTEGER NOT NULL CHECK (limit_cents >= 0),
    spent_cents        INTEGER NOT NULL DEFAULT 0 CHECK (spent_cents >= 0),
    window_started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    halted_at          TIMESTAMPTZ,
    halted_reason      TEXT,
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (agent_name, window)
);

COMMENT ON TABLE agent_budgets IS 'Phase 62a AGENT-05: per-agent cost quota. Gateway reads limit_cents (env override > this row > config.yaml fallback); gateway writes spent_cents + halted_at. Direct UPDATE tools forbidden — only gateway internals.';

CREATE INDEX IF NOT EXISTS agent_budgets_halted_idx
    ON agent_budgets (halted_at) WHERE halted_at IS NOT NULL;

-- ========================================================================
-- Seed top-level agents
-- ========================================================================
INSERT INTO agent_registry (agent_name, display_name, description, role, parent_agent) VALUES
    ('hamilton', 'Hamilton', 'Research analyst; reads Tier 3; synthesizes reports.', 'analyst', NULL),
    ('knox',     'Knox',     'Supervisor of state-agent fleet; coordinates crawl rollups; promotes cross-state patterns to national knowledge.', 'supervisor', NULL),
    ('darwin',   'Darwin',   'Classifier + verifier; promotes fees_raw -> fees_verified; challenges Knox via agent_messages.', 'classifier', NULL),
    ('atlas',    'Atlas',    'Orchestrator; schedules wave runs; enforces cost budgets; routes remediation.', 'orchestrator', NULL)
ON CONFLICT (agent_name) DO NOTHING;

-- ========================================================================
-- Seed 51 state agents (50 states + DC) as children of Knox.
-- ========================================================================
DO $$
DECLARE
    state_codes TEXT[] := ARRAY[
        'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
        'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
        'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
        'VA','WA','WV','WI','WY','DC'
    ];
    c TEXT;
BEGIN
    FOREACH c IN ARRAY state_codes LOOP
        INSERT INTO agent_registry (agent_name, display_name, role, parent_agent, state_code) VALUES
            ('state_' || lower(c), 'State Agent ' || c, 'state_agent', 'knox', c)
        ON CONFLICT (agent_name) DO NOTHING;
    END LOOP;
END $$;

-- ========================================================================
-- Seed default budgets (config.yaml fallback; operator can override via UPDATE).
-- ========================================================================
INSERT INTO agent_budgets (agent_name, window, limit_cents) VALUES
    ('knox',     'per_cycle',  50000),  -- $500 per quarterly cycle
    ('darwin',   'per_batch',  10000),  -- $100 per verification batch
    ('hamilton', 'per_report',  1000),  -- $10 per generated report
    ('atlas',    'per_month',  10000)   -- $100 per month of orchestration
ON CONFLICT (agent_name, window) DO NOTHING;

-- Per-state-agent default budget: $50 per cycle, applied only if not already set.
DO $$
DECLARE
    c TEXT;
BEGIN
    FOR c IN SELECT agent_name FROM agent_registry WHERE role = 'state_agent' LOOP
        INSERT INTO agent_budgets (agent_name, window, limit_cents) VALUES (c, 'per_cycle', 5000)
        ON CONFLICT (agent_name, window) DO NOTHING;
    END LOOP;
END $$;
```

Expected seed count after migration: 55 registry rows (4 + 51), 4 + 51 = 55 budget rows.
  </action>
  <verify>
    <automated>export DATABASE_URL_TEST="${DATABASE_URL_TEST:-postgres://postgres:postgres@localhost:5433/bfi_test}" && python -c "
import asyncio, asyncpg, os
async def main():
    conn = await asyncpg.connect(os.environ.get('DATABASE_URL_TEST','postgres://postgres:postgres@localhost:5433/bfi_test'), statement_cache_size=0)
    import secrets; s=f'tmp_{secrets.token_hex(6)}'
    try:
        await conn.execute(f'CREATE SCHEMA \"{s}\"')
        await conn.execute(f'SET search_path TO \"{s}\", public')
        import pathlib
        for m in sorted(pathlib.Path('supabase/migrations').glob('*.sql')):
            await conn.execute(m.read_text())
        n_reg = await conn.fetchval('SELECT COUNT(*) FROM agent_registry')
        n_bud = await conn.fetchval('SELECT COUNT(*) FROM agent_budgets')
        assert n_reg == 55, f'agent_registry expected 55 got {n_reg}'
        assert n_bud == 55, f'agent_budgets expected 55 got {n_bud}'
        print(f'OK: {n_reg} registry + {n_bud} budgets')
    finally:
        await conn.execute(f'DROP SCHEMA \"{s}\" CASCADE')
        await conn.close()
asyncio.run(main())
"</automated>
  </verify>
  <acceptance_criteria>
    - File exists with `CREATE TABLE IF NOT EXISTS agent_registry` and `CREATE TABLE IF NOT EXISTS agent_budgets`
    - Role CHECK contains `supervisor,data,classifier,orchestrator,analyst,state_agent`
    - Window CHECK contains `per_cycle,per_batch,per_report,per_day,per_month`
    - agent_budgets has FK `REFERENCES agent_registry(agent_name)`
    - After migration: `SELECT COUNT(*) FROM agent_registry` returns 55 (4 top-level + 51 state)
    - After migration: `SELECT COUNT(*) FROM agent_budgets` returns 55 (4 top-level default + 51 state default)
    - `SELECT * FROM agent_registry WHERE agent_name IN ('hamilton','knox','darwin','atlas')` returns 4 rows
    - `SELECT * FROM agent_registry WHERE role='state_agent'` returns 51 rows
  </acceptance_criteria>
  <done>agent_registry + agent_budgets lands with FK integrity; 55 registry seeds + 55 budget seeds; role/window CHECK constraints enforced.</done>
</task>

<task type="auto">
  <name>Task 3: Write supabase/migrations/20260419_institution_dossiers.sql</name>
  <files>supabase/migrations/20260419_institution_dossiers.sql</files>
  <read_first>
    - .planning/phases/62A-agent-foundation-data-layer/62A-RESEARCH.md §7.5 (institution_dossiers schema)
    - .planning/phases/62A-agent-foundation-data-layer/62A-CONTEXT.md — Claude's Discretion "institution_dossiers schema"
  </read_first>
  <action>
Create `supabase/migrations/20260419_institution_dossiers.sql` with exactly this content:

```sql
-- Phase 62a — KNOX-03 foundation (table empty in 62a; Phase 63 populates).
-- Per-institution strategy memory: what URL was tried, what format, what outcome, what to try next.

CREATE TABLE IF NOT EXISTS institution_dossiers (
    institution_id             INTEGER PRIMARY KEY REFERENCES crawl_targets(id) ON DELETE CASCADE,
    last_url_tried             TEXT,
    last_document_format       TEXT CHECK (last_document_format IN (
                                 'pdf','html','js_rendered','stealth_pass_1','stealth_pass_2','unknown'
                               ) OR last_document_format IS NULL),
    last_strategy              TEXT,
    last_outcome               TEXT CHECK (last_outcome IN (
                                 'success','blocked','404','no_fees','captcha','rate_limited','unknown'
                               ) OR last_outcome IS NULL),
    last_cost_cents            INTEGER NOT NULL DEFAULT 0 CHECK (last_cost_cents >= 0),
    next_try_recommendation    TEXT CHECK (next_try_recommendation IN (
                                 'retry_same','stealth_pass_1','needs_playwright_stealth','skip','rediscover_url'
                               ) OR next_try_recommendation IS NULL),
    notes                      JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by_agent_event_id  UUID,
    updated_by_agent           TEXT
);

COMMENT ON TABLE institution_dossiers IS 'Phase 62a KNOX-03: per-institution strategy memory. Empty in 62a; Phase 63 state agents populate via upsert tool.';
COMMENT ON COLUMN institution_dossiers.updated_by_agent_event_id IS 'Logical FK to agent_events.event_id (cross-partition; not DB-enforced).';

CREATE INDEX IF NOT EXISTS institution_dossiers_outcome_idx
    ON institution_dossiers (last_outcome, updated_at DESC);
CREATE INDEX IF NOT EXISTS institution_dossiers_next_try_idx
    ON institution_dossiers (next_try_recommendation) WHERE next_try_recommendation IS NOT NULL;
CREATE INDEX IF NOT EXISTS institution_dossiers_updated_by_agent_idx
    ON institution_dossiers (updated_by_agent, updated_at DESC);
```
  </action>
  <verify>
    <automated>export DATABASE_URL_TEST="${DATABASE_URL_TEST:-postgres://postgres:postgres@localhost:5433/bfi_test}" && python -c "
import asyncio, asyncpg, os, secrets, pathlib
async def main():
    conn = await asyncpg.connect(os.environ.get('DATABASE_URL_TEST','postgres://postgres:postgres@localhost:5433/bfi_test'), statement_cache_size=0)
    s=f'tmp_{secrets.token_hex(6)}'
    try:
        await conn.execute(f'CREATE SCHEMA \"{s}\"'); await conn.execute(f'SET search_path TO \"{s}\", public')
        for m in sorted(pathlib.Path('supabase/migrations').glob('*.sql')):
            await conn.execute(m.read_text())
        r = await conn.fetchval(\"SELECT to_regclass('institution_dossiers')\")
        assert r is not None, 'institution_dossiers must exist'
        print('OK')
    finally:
        await conn.execute(f'DROP SCHEMA \"{s}\" CASCADE'); await conn.close()
asyncio.run(main())
"</automated>
  </verify>
  <acceptance_criteria>
    - File exists with `CREATE TABLE IF NOT EXISTS institution_dossiers`
    - Contains `PRIMARY KEY REFERENCES crawl_targets(id) ON DELETE CASCADE`
    - Contains 3 CHECK constraints: last_document_format, last_outcome, next_try_recommendation
    - 3 `CREATE INDEX IF NOT EXISTS institution_dossiers_` lines
    - Migration applies cleanly against a fresh schema with all prior migrations
  </acceptance_criteria>
  <done>institution_dossiers lands empty with FK to crawl_targets, 3 CHECK enums, 3 indexes.</done>
</task>

</tasks>

<verification>
Run the full migration stack against a fresh Postgres schema:

```bash
pytest fee_crawler/tests/test_agent_events_schema.py fee_crawler/tests/test_tier_schemas.py fee_crawler/tests/test_agent_auth_log.py fee_crawler/tests/test_tier_promotion.py fee_crawler/tests/test_sc3_tier_schema_contract.py -v
```

Expect every test to pass (adversarial_gate_exists now passes because agent_messages is in the migrations dir). Manual: psql into the test schema and confirm `SELECT agent_name, role FROM agent_registry ORDER BY role, agent_name` shows 55 rows.
</verification>

<success_criteria>
- 3 migrations land: agent_messages, agent_registry+agent_budgets (seeded with 55+55 rows), institution_dossiers
- All downstream schema probe tests pass
- agent_budgets FK enforces identity consistency with agent_registry
- institution_dossiers FK enforces institution consistency with crawl_targets
- All CHECK constraints match research SQL
</success_criteria>

<output>
After completion, create `.planning/phases/62A-agent-foundation-data-layer/62A-04-SUMMARY.md` noting:
- 3 migrations landed with AGENT-05 infrastructure
- 55 agents + 55 default budgets seeded
- agent_messages empty in 62a; 62b wires handshake
- institution_dossiers empty; Phase 63 populates
</output>
