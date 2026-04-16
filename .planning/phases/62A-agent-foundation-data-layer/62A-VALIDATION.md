---
phase: 62a
slug: agent-foundation-data-layer
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-16
---

# Phase 62a — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 8.3.x (Python) + vitest 1.x (TypeScript) |
| **Config file** | `pytest.ini` + `vitest.config.ts` (both exist) |
| **Quick run command** | `pytest fee_crawler/tests/test_agent_tools -q && npx vitest run src/lib/agent-tools` |
| **Full suite command** | `pytest fee_crawler/tests/ && npx vitest run && ./scripts/ci-guards.sh` |
| **Estimated runtime** | ~60s quick / ~240s full (includes Postgres schema bootstrap) |

Python tests use per-test Postgres schema via `pytest-postgresql` or a custom `conftest.py` fixture (`CREATE SCHEMA test_<uuid>` → migrate → drop). `DATABASE_URL` points at local Postgres (docker-compose service added this phase) or CI Postgres service container.

---

## Sampling Rate

- **After every task commit:** Run quick command against touched module only
- **After every plan wave:** Run full suite for all plans in wave
- **Before `/gsd-verify-work`:** Full suite + SC-level tests (SC1..SC5) must be green
- **Max feedback latency:** 60 seconds (quick), 240 seconds (full)

---

## Per-Task Verification Map

Waves and tasks are still being finalized by the planner; the map below anchors per-REQ test expectations. The planner fills in exact task IDs per plan.

| REQ | Plan area | Wave | Test Type | Automated Command | Status |
|-----|-----------|------|-----------|-------------------|--------|
| AGENT-01 | agent_events table exists with required columns + partitions | 0 | unit | `pytest fee_crawler/tests/test_agent_events_schema.py -q` | ⬜ pending |
| AGENT-02 | Every agent action writes one row before side effects | 1 | integration | `pytest fee_crawler/tests/test_agent_gateway.py::test_tool_writes_event_before_target -q` | ⬜ pending |
| AGENT-03 | Sub-second query at 10M rows; partition + index present | 0 | unit + perf | `pytest fee_crawler/tests/test_agent_events_performance.py -q` | ⬜ pending |
| AGENT-04 | agent_auth_log row per agent write (before/after/tool/identity) | 1 | integration | `pytest fee_crawler/tests/test_agent_auth_log.py -q` | ⬜ pending |
| AGENT-05 | Write-CRUD tools across 33 entities with identity audit | 2-3 | contract | `pytest fee_crawler/tests/test_agent_tool_coverage.py -q` (asserts every entity has a registered tool) | ⬜ pending |
| TIER-01 | fees_raw exists with lineage columns (source_url, document_r2_key, extraction_confidence, agent_event_id) | 0 | unit | `pytest fee_crawler/tests/test_tier_schemas.py::test_tier1 -q` | ⬜ pending |
| TIER-02 | fees_verified exists with canonical_fee_key, variant_type, outlier_flags, verified_by_agent_event_id | 0 | unit | `pytest fee_crawler/tests/test_tier_schemas.py::test_tier2 -q` | ⬜ pending |
| TIER-03 | fees_published exists with lineage_ref + published_by_adversarial_event_id | 0 | unit | `pytest fee_crawler/tests/test_tier_schemas.py::test_tier3 -q` | ⬜ pending |
| TIER-04 | Tier 1 → Tier 2 promotion only via Darwin function; logged to agent_events | 1 | integration | `pytest fee_crawler/tests/test_tier_promotion.py::test_darwin_only -q` | ⬜ pending |
| TIER-05 | Tier 2 → Tier 3 requires adversarial success (empty agent_messages in 62a; 62b wires) | 1 | contract | `pytest fee_crawler/tests/test_tier_promotion.py::test_adversarial_gate_exists -q` | ⬜ pending |
| TIER-06 | SQLite gone: grep returns zero + pytest green on Postgres + db.py Postgres-only | 4 | CI guard | `./scripts/ci-guards.sh sqlite-kill && pytest fee_crawler/tests/` | ⬜ pending |
| SC1 | `SELECT COUNT(*) FROM agent_events WHERE agent_name='knox' AND created_at > now() - interval '1 hour'` sub-second | 5 | SC | `pytest fee_crawler/tests/test_sc1_recent_agent_events.py -q` | ⬜ pending |
| SC2 | agent_auth_log row per tool call (33 entities) | 5 | SC | `pytest fee_crawler/tests/test_sc2_auth_log_coverage.py -q` | ⬜ pending |
| SC3 | Three tier tables resolve with exact lineage columns | 5 | SC | `pytest fee_crawler/tests/test_sc3_tier_schema_contract.py -q` | ⬜ pending |
| SC4 | SQLite grep returns zero + pytest green + db.py Postgres-only | 5 | SC | `./scripts/ci-guards.sh sqlite-kill && pytest` | ⬜ pending |
| SC5 | `ATLAS_AGENT_BUDGET_KNOX_CENTS=1000` halts Knox with action='budget_halt' | 5 | SC | `pytest fee_crawler/tests/test_sc5_budget_halt.py -q` | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `fee_crawler/tests/conftest.py` — per-test Postgres schema fixture (replaces SQLite fixtures)
- [ ] `fee_crawler/tests/test_agent_events_schema.py` — stubs for AGENT-01, AGENT-03
- [ ] `fee_crawler/tests/test_tier_schemas.py` — stubs for TIER-01, TIER-02, TIER-03
- [ ] `fee_crawler/tests/test_agent_gateway.py` — stubs for AGENT-02, AGENT-04
- [ ] `fee_crawler/tests/test_tier_promotion.py` — stubs for TIER-04, TIER-05
- [ ] `fee_crawler/tests/test_agent_tool_coverage.py` — stubs for AGENT-05
- [ ] `fee_crawler/tests/test_sc1_recent_agent_events.py` through `test_sc5_budget_halt.py` — stubs for SC1-SC5
- [ ] `scripts/ci-guards.sh` — `sqlite-kill` subcommand + called from CI
- [ ] `docker-compose.yml` — local Postgres service for `DATABASE_URL`
- [ ] `pyproject.toml` / `requirements.txt` — add `asyncpg`, `pytest-postgresql` (or custom fixture); remove `sqlite3` if listed

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Supabase migration runs cleanly against staging DB | TIER-01..05 | Requires staging Postgres, not reproducible in CI isolation | Run `supabase db push --db-url $STAGING_DB` and confirm 6 new tables exist; verify with `\d+ agent_events` that partition is present |
| Modal preflight rejects missing tables | D-16 / SC1 | Requires Modal runtime | Deploy preflight to Modal staging, delete `agent_events` table in staging, invoke any cron function, confirm fail-fast with "required table not found" error |
| pg_cron partition job creates next month's partition | AGENT-03 | Requires time travel or 31-day wait; CI can only verify the function exists | Run SELECT on `cron.schedule` confirming job installed; manually `CALL create_next_month_partition()` and verify partition appears |
| MCP server discoverable from external client | D-07 tool home | Requires real MCP client | From a local claude CLI or another MCP-compatible client, connect to the deployed MCP server, list tools, verify the read tools appear |
| Stripe test payment does NOT invoke agent tools | SEC-04 foreshadow | Safety isolation sanity check | Trigger a Stripe webhook in staging, confirm agent_auth_log has no new rows |

---

## Canary / Golden Corpus Baseline

This phase is foundation-only; no data-pipeline canary yet (Phase 63 owns the 100-institution golden corpus for Knox).

For 62a, the "canary" is:
- Backfill SQL correctness: a 50-row seed of synthetic `extracted_fees` → migrated to `fees_raw` → asserts every row has non-NULL `source='migration_v10'`, `outlier_flag='lineage_missing'` set where `document_url IS NULL`
- Tool-gateway round-trip: call `approve_fee(fee_id=1, agent_name='darwin')` → assert `agent_events` + `agent_auth_log` + target row update all landed inside one transaction

---

## Notes

- Nyquist Dimension 8 coverage: each REQ-ID above maps to a test; SC1-SC5 have explicit acceptance-bar tests; CI guards enforce TIER-06's grep-zero acceptance
- Runtime latency for recent-hour `agent_events` query tested at 100K-row and 1M-row seed volumes before phase ships
- This file is refined by gsd-planner during planning — task IDs populate once plans are written
- Per RESEARCH.md §3, tests run against throwaway Postgres schemas (per-test isolation) — no shared state between tests
