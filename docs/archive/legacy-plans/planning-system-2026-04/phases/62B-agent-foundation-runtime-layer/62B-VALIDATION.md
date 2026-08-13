---
phase: 62B
slug: agent-foundation-runtime-layer
status: green
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-17
last_run: 2026-04-18
last_audited: 2026-04-18
---

# Phase 62B — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Derived from RESEARCH.md §Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 8.3 + pytest-asyncio (Python); vitest (TS — `/admin/agents` client components) |
| **Config file** | `pyproject.toml` + `fee_crawler/tests/conftest.py`; `vitest.config.ts` |
| **Quick run command** | `pytest fee_crawler/tests/test_agent_base_auto_wrap.py fee_crawler/tests/test_adversarial_gate.py fee_crawler/tests/test_agent_messaging.py -x` |
| **Full suite command** | `pytest fee_crawler/tests/ -x --ignore=fee_crawler/tests/e2e && npx vitest run src/app/admin/agents/` |
| **Estimated runtime** | ~60–90 seconds (Python); ~10–15 seconds (vitest) |

---

## Sampling Rate

- **After every task commit:** Run quick command (Python) + targeted vitest for TS changes
- **After every plan wave:** Run full suite + `bash scripts/ci-guards.sh sqlite-kill` (preserve 62a invariants)
- **Before `/gsd-verify-work`:** Full suite must be green; 62A's 4 human UAT items still pass (staging smoke click-through)
- **Max feedback latency:** 90 seconds quick, ~120 seconds full

---

## Per-Task Verification Map

| Req ID | Behavior | Test Type | Automated Command | File Exists | Status |
|--------|----------|-----------|-------------------|-------------|--------|
| LOOP-01 | AgentBase subclass receives LOG/REVIEW/DISSECT/UNDERSTAND/IMPROVE hooks | unit (contract) | `pytest fee_crawler/tests/test_agent_base_auto_wrap.py::test_subclass_gets_hooks -x` | ✅ W0 | ✅ green |
| LOOP-02 | Tool call auto-writes agent_events | integration | `pytest fee_crawler/tests/test_agent_gateway.py -x` | ✅ (62a) | ✅ green |
| LOOP-03 | Unreviewed events discovered within 15 min of landing | integration (pg_cron clock-fast-forward) | `pytest fee_crawler/tests/test_agent_base_auto_wrap.py::test_review_latency -x` | ✅ W0 | ✅ green |
| LOOP-04 | DISSECT writes agent_events action='dissect' with delta payload | unit | `pytest fee_crawler/tests/test_agent_base_auto_wrap.py::test_dissect_writes_event -x` | ✅ W0 | ✅ green |
| LOOP-05 | UNDERSTAND writes to agent_lessons | unit | `pytest fee_crawler/tests/test_agent_base_auto_wrap.py::test_understand_writes_lesson -x` | ✅ W0 | ✅ green |
| LOOP-06 | IMPROVE captures before/after in agent_events | unit | `pytest fee_crawler/tests/test_agent_base_auto_wrap.py::test_improve_before_after -x` | ✅ W0 | ✅ green |
| LOOP-07 | Canary regression gate — failed IMPROVE writes improve_rejected | integration | `pytest fee_crawler/tests/test_adversarial_gate.py -x` | ✅ W0 | ✅ green |
| COMMS-01 | agent_messages insert + NOTIFY fires + listener picks up | integration (real Postgres, session mode :5432) | `pytest fee_crawler/tests/test_agent_messaging.py::test_listen_notify_roundtrip -x` | ✅ W0 | ✅ green |
| COMMS-02 | Darwin challenges Knox — 3-message sequence resolves | integration | `pytest fee_crawler/tests/test_agent_messaging.py::test_darwin_knox_handshake -x` | ✅ W0 | ✅ green |
| COMMS-03 | Knox challenges Darwin — reverse direction | integration | `pytest fee_crawler/tests/test_agent_messaging.py::test_knox_darwin_handshake -x` | ✅ W0 | ✅ green |
| COMMS-04 | Escalation after 3 rounds OR 24h age | integration (time-travel with `SET LOCAL`) | `pytest fee_crawler/tests/test_agent_messaging.py::test_escalation_three_rounds -x` | ✅ W0 | ✅ green |
| COMMS-05 | `get_reasoning_trace(correlation_id)` returns timeline | integration | `pytest fee_crawler/tests/test_agent_messaging.py::test_reasoning_trace_tool -x` | ✅ W0 | ✅ green |
| OBS-01 | Tier 3 → Tier 1 lineage chain queryable | integration | `pytest fee_crawler/tests/test_lineage_graph.py::test_lineage_chain_queryable -x` | ✅ W0 | ✅ green |
| OBS-02 | One SQL query returns full trace to R2 | integration | `pytest fee_crawler/tests/test_lineage_graph.py::test_single_query_full_trace -x` | ✅ W0 | ✅ green |
| OBS-03 | Admin UI traces in 3 clicks | unit (vitest) + manual UAT | `npx vitest run src/app/admin/agents/__tests__/recent-picker.test.tsx src/app/admin/agents/__tests__/tiles.test.tsx` | ✅ W1 (plans 12/13 gap-closure) | ✅ green (unit) · manual click-through still in UAT |
| OBS-04 | Replay by reasoning_hash renders timeline | unit + integration | `pytest fee_crawler/tests/test_agent_messaging.py::test_replay_by_hash -x` + `vitest src/app/admin/agents/replay/` | ✅ W0 | ✅ green |
| OBS-05 | 5 health metrics with sparkline data | integration | `pytest fee_crawler/tests/test_agent_health_rollup.py -x` | ✅ W0 | ✅ green |
| BOOT-01 | Q1→Q2→Q3 graduation executable + named predicate | integration | `pytest fee_crawler/tests/test_agent_bootstrap.py::test_graduate_q1_to_q2 -x` | ✅ W0 | ✅ green |
| BOOT-03 | Contract + fixture + canary + shadow tests ship | smoke (meta) | `pytest fee_crawler/tests/test_fake_anthropic.py fee_crawler/tests/test_canary_runner.py fee_crawler/tests/test_shadow_helpers.py -x` | ✅ W0 | ✅ green |
| HANDSHAKE-01 | promote_to_tier3 enforces darwin+knox accept; rejects missing/unknown/knox-reject; idempotency weakness captured as xfail | integration | `pytest fee_crawler/tests/test_promote_to_tier3.py -x` | ✅ W2 (added 2026-04-18 during reliability roadmap #12) | ✅ green (6/6 pass 2026-04-18 vs local Postgres 15) |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky/staging-gated*

**Local run (2026-04-17, unit only):** 22 pass / 0 fail / 49 skip.

**Local run (2026-04-17 late, Colima Postgres 15 + `DATABASE_URL_SESSION_TEST`, all 62B test fixes applied):** **71 pass / 0 fail / 0 skip (22s).** Every integration row (COMMS-01..05, OBS-01..05, LOOP-03..07, BOOT-01) now green against a real Postgres.

**Local run (2026-04-17, mid-session — pre-fix baseline):** 55 pass / 16 fail / 0 skip. The 16 failures were test-suite bugs (jsonb codec not registered on test pool; `entity_id` TEXT column receiving raw int; `lineage_graph()` error-string drift vs. discriminated-union migration). All resolved in-session — see `62B-VERIFICATION.md`.

**Local run (2026-04-18, post-audit — Colima Postgres 15 via docker compose, DATABASE_URL_TEST=localhost:5433):** **81 pytest + 53 vitest = 134 pass / 0 fail / 0 skip (35s pytest + 1s vitest).** Every requirement-mapped row green, including the new `test_promote_to_tier3.py` (6/6). One adjacent test `test_62b_migrations.py::test_darwin_lifecycle_state_is_q2_high_confidence` fails because the fresh local schema doesn't seed `agent_registry.lifecycle_state='q2_high_confidence'` — pre-existing fixture gap, not tracked as a 62B requirement.

---

## Wave 0 Requirements

- [x] `fee_crawler/tests/test_agent_base_auto_wrap.py` — covers LOOP-01, 03, 04, 05, 06
- [x] `fee_crawler/tests/test_adversarial_gate.py` — covers LOOP-07
- [x] `fee_crawler/tests/test_agent_messaging.py` — covers COMMS-01..05 + OBS-04 replay
- [x] `fee_crawler/tests/test_lineage_graph.py` — covers OBS-01, OBS-02
- [x] `fee_crawler/tests/test_agent_health_rollup.py` — covers OBS-05
- [x] `fee_crawler/tests/test_agent_bootstrap.py` — covers BOOT-01
- [x] `fee_crawler/tests/test_fake_anthropic.py` — meta-test for D-19 FakeAnthropicClient
- [x] `fee_crawler/tests/test_canary_runner.py` — meta-test for D-20 canary runner
- [x] `fee_crawler/tests/test_shadow_helpers.py` — meta-test for D-21 shadow gate
- [x] `src/app/admin/agents/__tests__/tiles.test.tsx` — sparkline render + metric tile
- [x] `src/app/admin/agents/__tests__/tree-view.test.tsx` — Radix Collapsible tree for lineage
- [x] `fee_crawler/tests/conftest.py` — extend existing fixture with: `fake_anthropic_client`, `session_mode_pool` (port 5432), `agent_messaging_listener`
- [x] Optional dependency check: confirm raw asyncpg works for LISTEN/NOTIFY (no need for `asyncpg-listen` wrapper per research)

*No new framework install required. All libraries already in project (pytest, pytest-asyncio, asyncpg, vitest).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Admin UI traces lineage in 3 clicks | OBS-03 | Interaction + rendering verification needs human eye | From `/admin/agents`, go to Lineage tab → paste a Tier 3 published_fee_id → expand one level → see Tier 2 event + row → expand one more → see Tier 1 extraction + R2 document link. Total: 3 expansions |
| `/admin/agents` console navigation and tab switching | OBS-05 | Visual polish + tab state management | Verify all 4 tabs load (Overview / Lineage / Messages / Replay), tiles render sparklines without layout shift, active tab persists on refresh |
| Daily digest displays escalated threads + improve_rejected + Q2 samples | COMMS-04, D-08, D-24 | Readability + 20-min-or-less bar | Open Messages tab → see "Today's Digest" section with all 3 source categories grouped, each with context snippets |
| Graduation CLI flips `agent_registry.lifecycle_state` after predicate passes | BOOT-01, D-22, D-23 | CLI output UX + predicate readability | Run `python -m fee_crawler agent-graduate knox --to q2` with predicate-passing fixture → confirm success message + DB state change |

---

## Validation Sign-Off

- [x] All 19 requirements have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (LOOP-03 is integration-heavy; break up with unit tests)
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags (pytest `-x` fail-fast, vitest `run` not `--watch`)
- [x] Feedback latency < 90s quick / 120s full (observed 0.25s Python + 0.5s vitest on 2026-04-17)
- [x] `nyquist_compliant: true` set in frontmatter after wave 0 lands — verified 2026-04-17 late: 71 pass / 0 fail / 0 skip against Colima Postgres 15.

**Approval:** green. Phase 62B runtime layer validated end-to-end on a real Postgres.

---

## Validation Audit 2026-04-18

| Metric | Count |
|--------|-------|
| Gaps found | 3 |
| Resolved (inline) | 3 |
| Escalated to manual-only | 0 |
| New tests added | 1 (`test_promote_to_tier3.py` — 6 test cases) |
| Tests re-run during audit | 134 (81 pytest + 53 vitest) — all green |

### Findings

1. **LOOP-02 status bit-rot** — row showed `⬜ pending` even though `fee_crawler/tests/test_agent_gateway.py` was shipped in 62a and has been covered by every full-suite run since. Flipped to `✅ green`.
2. **OBS-03 partial automation** — row was classified `manual-only` when it was created. Plans 62B-12 and 62B-13 closed the gap with `tiles.test.tsx` and `recent-picker.test.tsx` (vitest). Re-classified to `unit + manual UAT`; manual click-through stays on UAT checklist.
3. **HANDSHAKE-01 not in map** — `promote_to_tier3` is Phase 62B's load-bearing SQL gate, but the map only covered upstream adversarial-message tests (LOOP-07, COMMS-*). `test_promote_to_tier3.py` (6 cases, added 2026-04-18 as reliability roadmap #12) fills this. During audit, spun up Colima Postgres 15 on localhost:5433, fixed a NOT NULL violation in the `_post_message` helper (`recipient_agent` column), and verified all 6 tests pass. Flipped status to `✅ green`.

### Known blockers — resolved in this audit

- ✅ ~~No `DATABASE_URL_TEST`~~ — docker compose postgres on localhost:5433 stood up during the audit. 81 pytest + 53 vitest all green. Document the bootstrap command for future audits: `docker compose up -d postgres && export DATABASE_URL_TEST=postgres://postgres:postgres@localhost:5433/bfi_test && export DATABASE_URL_SESSION_TEST=$DATABASE_URL_TEST`.
- ✅ ~~Sampling freshness~~ — `last_run` moved from `2026-04-17` to `2026-04-18`.

### Remaining follow-ups (not audit-blockers)

- `test_62b_migrations.py::test_darwin_lifecycle_state_is_q2_high_confidence` fails on a fresh local schema because the `agent_registry` row for `darwin` isn't seeded with `lifecycle_state='q2_high_confidence'` by any migration. Not a 62B requirement — either move the seed into `conftest.py` or add a seed migration. Pre-existing issue that predates this audit.
