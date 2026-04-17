---
phase: 62B
slug: agent-foundation-runtime-layer
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-17
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
| LOOP-01 | AgentBase subclass receives LOG/REVIEW/DISSECT/UNDERSTAND/IMPROVE hooks | unit (contract) | `pytest fee_crawler/tests/test_agent_base_auto_wrap.py::test_subclass_gets_hooks -x` | ❌ W0 | ⬜ pending |
| LOOP-02 | Tool call auto-writes agent_events | integration | `pytest fee_crawler/tests/test_agent_gateway.py -x` | ✅ (62a) | ⬜ pending |
| LOOP-03 | Unreviewed events discovered within 15 min of landing | integration (pg_cron clock-fast-forward) | `pytest fee_crawler/tests/test_agent_base_auto_wrap.py::test_review_latency -x` | ❌ W0 | ⬜ pending |
| LOOP-04 | DISSECT writes agent_events action='dissect' with delta payload | unit | `pytest fee_crawler/tests/test_agent_base_auto_wrap.py::test_dissect_writes_event -x` | ❌ W0 | ⬜ pending |
| LOOP-05 | UNDERSTAND writes to agent_lessons | unit | `pytest fee_crawler/tests/test_agent_base_auto_wrap.py::test_understand_writes_lesson -x` | ❌ W0 | ⬜ pending |
| LOOP-06 | IMPROVE captures before/after in agent_events | unit | `pytest fee_crawler/tests/test_agent_base_auto_wrap.py::test_improve_before_after -x` | ❌ W0 | ⬜ pending |
| LOOP-07 | Canary regression gate — failed IMPROVE writes improve_rejected | integration | `pytest fee_crawler/tests/test_adversarial_gate.py -x` | ❌ W0 | ⬜ pending |
| COMMS-01 | agent_messages insert + NOTIFY fires + listener picks up | integration (real Postgres, session mode :5432) | `pytest fee_crawler/tests/test_agent_messaging.py::test_listen_notify_roundtrip -x` | ❌ W0 | ⬜ pending |
| COMMS-02 | Darwin challenges Knox — 3-message sequence resolves | integration | `pytest fee_crawler/tests/test_agent_messaging.py::test_darwin_knox_handshake -x` | ❌ W0 | ⬜ pending |
| COMMS-03 | Knox challenges Darwin — reverse direction | integration | `pytest fee_crawler/tests/test_agent_messaging.py::test_knox_darwin_handshake -x` | ❌ W0 | ⬜ pending |
| COMMS-04 | Escalation after 3 rounds OR 24h age | integration (time-travel with `SET LOCAL`) | `pytest fee_crawler/tests/test_agent_messaging.py::test_escalation_three_rounds -x` | ❌ W0 | ⬜ pending |
| COMMS-05 | `get_reasoning_trace(correlation_id)` returns timeline | integration | `pytest fee_crawler/tests/test_agent_messaging.py::test_reasoning_trace_tool -x` | ❌ W0 | ⬜ pending |
| OBS-01 | Tier 3 → Tier 1 lineage chain queryable | integration | `pytest fee_crawler/tests/test_lineage_graph.py::test_lineage_chain_queryable -x` | ❌ W0 | ⬜ pending |
| OBS-02 | One SQL query returns full trace to R2 | integration | `pytest fee_crawler/tests/test_lineage_graph.py::test_single_query_full_trace -x` | ❌ W0 | ⬜ pending |
| OBS-03 | Admin UI traces in 3 clicks | manual-only | UAT / optional Playwright | manual | ⬜ pending |
| OBS-04 | Replay by reasoning_hash renders timeline | unit + integration | `pytest fee_crawler/tests/test_agent_messaging.py::test_replay_by_hash -x` + `vitest src/app/admin/agents/replay/` | ❌ W0 | ⬜ pending |
| OBS-05 | 5 health metrics with sparkline data | integration | `pytest fee_crawler/tests/test_agent_health_rollup.py -x` | ❌ W0 | ⬜ pending |
| BOOT-01 | Q1→Q2→Q3 graduation executable + named predicate | integration | `pytest fee_crawler/tests/test_agent_bootstrap.py::test_graduate_q1_to_q2 -x` | ❌ W0 | ⬜ pending |
| BOOT-03 | Contract + fixture + canary + shadow tests ship | smoke (meta) | `pytest fee_crawler/tests/test_fake_anthropic.py fee_crawler/tests/test_canary_runner.py fee_crawler/tests/test_shadow_helpers.py -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `fee_crawler/tests/test_agent_base_auto_wrap.py` — covers LOOP-01, 03, 04, 05, 06
- [ ] `fee_crawler/tests/test_adversarial_gate.py` — covers LOOP-07
- [ ] `fee_crawler/tests/test_agent_messaging.py` — covers COMMS-01..05 + OBS-04 replay
- [ ] `fee_crawler/tests/test_lineage_graph.py` — covers OBS-01, OBS-02
- [ ] `fee_crawler/tests/test_agent_health_rollup.py` — covers OBS-05
- [ ] `fee_crawler/tests/test_agent_bootstrap.py` — covers BOOT-01
- [ ] `fee_crawler/tests/test_fake_anthropic.py` — meta-test for D-19 FakeAnthropicClient
- [ ] `fee_crawler/tests/test_canary_runner.py` — meta-test for D-20 canary runner
- [ ] `fee_crawler/tests/test_shadow_helpers.py` — meta-test for D-21 shadow gate
- [ ] `src/app/admin/agents/overview/__tests__/tiles.test.tsx` — sparkline render + metric tile
- [ ] `src/app/admin/agents/lineage/__tests__/tree-view.test.tsx` — Radix Collapsible tree for lineage
- [ ] `fee_crawler/tests/conftest.py` — extend existing fixture with: `fake_anthropic_client`, `session_mode_pool` (port 5432), `agent_messaging_listener`
- [ ] Optional dependency check: confirm raw asyncpg works for LISTEN/NOTIFY (no need for `asyncpg-listen` wrapper per research)

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

- [ ] All 19 requirements have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify (LOOP-03 is integration-heavy; break up with unit tests)
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags (pytest `-x` fail-fast, vitest `run` not `--watch`)
- [ ] Feedback latency < 90s quick / 120s full
- [ ] `nyquist_compliant: true` set in frontmatter after wave 0 lands

**Approval:** pending
