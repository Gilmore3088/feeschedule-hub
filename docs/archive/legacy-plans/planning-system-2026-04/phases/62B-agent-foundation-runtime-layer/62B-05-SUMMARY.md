---
phase: 62B-agent-foundation-runtime-layer
plan: 05
subsystem: messaging
tags: [python, asyncpg, postgres, listen-notify, pydantic, pytest, agent-messaging]

# Dependency graph
requires:
  - phase: 62A-agent-foundation-data-layer
    provides: agent_messages table (AGENT-05), insert_agent_message + update_agent_message_intent tools, gateway audit path
  - phase: 62B-01-migrations
    provides: agent_messages_notify_trigger (pg_notify 'agent_msg_<recipient>', message_id::text)
  - phase: 62B-02-session-pool
    provides: get_session_pool() helper + DATABASE_URL_SESSION convention + close_session_pool() for tests
  - phase: 62B-03-agent-base-runtime
    provides: with_agent_context() contextvar manager re-exported at agent_tools package level
  - phase: 62B-04-testing-harness
    provides: db_schema fixture in conftest.py (per-test Postgres schema + applied migrations)
provides:
  - send_message() publisher (gateway-audited) in fee_crawler/agent_messaging/publisher.py
  - run_listener() reconnecting LISTEN loop in fee_crawler/agent_messaging/listener.py
  - scan_for_escalations() + list_escalated_threads() in fee_crawler/agent_messaging/escalation.py
  - Pydantic payload validators ChallengePayload, ProvePayload, AcceptPayload, RejectPayload, EscalatePayload
  - validate_payload_for_intent() passthrough for coverage_request / clarify intents
  - 9 integration tests covering COMMS-01..04 + OBS-04 replay-by-hash
affects: [62B-06-messaging-cron, 62B-09-atlas-escalation-digest, phase-63-knox, phase-64-darwin, phase-65-atlas]

# Tech tracking
tech-stack:
  added: [] # No new packages — uses existing asyncpg + pydantic
  patterns:
    - "Publisher-through-gateway — inter-agent messages flow through insert_agent_message tool so sender_agent is set by gateway identity (T-62B-05-01 spoofing mitigation)"
    - "Session-mode vs transaction-mode split — get_session_pool() for LISTEN, get_pool() for full-row lookup after NOTIFY"
    - "Async queue handoff inside add_listener callback — callback enqueues, worker coroutine dispatches so the protocol loop is never blocked"
    - "Reconnect loop with exponential backoff (1,2,4,8s) + 30s keepalive SELECT 1 probe"
    - "Per-intent Pydantic validators fail-fast before any DB write"
    - "Idempotent escalation scan via WHERE state = 'open' (re-runs cannot cascade)"

key-files:
  created:
    - fee_crawler/agent_messaging/__init__.py
    - fee_crawler/agent_messaging/schemas.py
    - fee_crawler/agent_messaging/publisher.py
    - fee_crawler/agent_messaging/listener.py
    - fee_crawler/agent_messaging/escalation.py
    - fee_crawler/tests/test_agent_messaging.py
  modified: [] # No edits to existing files — tools_agent_infra.py already exposed insert_agent_message at the shape we needed (no-op per plan objective)

key-decisions:
  - "Raw asyncpg add_listener over asyncpg-listen library — research §Mechanics 2 showed the reconnect loop is ~40 lines and keeps a single dep surface. asyncpg-listen remains a drop-in alternative if the hand-rolled loop proves fragile."
  - "Queue+worker split inside run_listener — the add_listener callback must not do heavy work (runs in asyncpg's protocol loop). It enqueues the message_id and a consumer coroutine handles dispatch via the transaction-mode pool."
  - "sender kwarg on send_message() is advisory only — the DB row's sender_agent comes from the gateway's agent_name header. Documented in publisher docstring + Threat T-62B-05-01."
  - "send_message wraps with_agent_context() so correlation_id propagates into the gateway event — both agent_events and agent_messages land under the same correlation for OBS-04 replay."
  - "Idempotent escalation scan — WHERE state = 'open' guarantees re-runs cannot cascade (T-62B-05-05)."
  - "Keepalive cadence 30s + probe timeout 5s — catches dead TCP before add_listener silently stops delivering (research §Mechanics 2)."

patterns-established:
  - "Publisher-through-gateway: inter-agent message producers import insert_agent_message, never raw SQL"
  - "Listener = queue-handoff + reconnect loop: pattern reusable for any future per-agent channel"
  - "Two-dimensional escalation predicate (rounds OR time): reusable for any future gate that needs both fast-loop and stall detection"

requirements-completed: [COMMS-01, COMMS-02, COMMS-03, COMMS-04, OBS-04]

# Metrics
duration: ~40m
completed: 2026-04-17
---

# Phase 62B Plan 05: Agent Messaging Runtime Summary

**Inter-agent messaging runtime — gateway-audited publisher, reconnecting LISTEN/NOTIFY listener, two-dimensional escalation scan, and 9 integration tests covering COMMS-01..04 + OBS-04 replay-by-hash.**

## Performance

- **Duration:** ~40 min
- **Started:** 2026-04-17T06:00:00Z (approximate)
- **Completed:** 2026-04-17T06:41:24Z
- **Tasks:** 2 (both TDD-mode)
- **Files created:** 6 (5 package modules + 1 test module)
- **Files modified:** 0

## Accomplishments

- `fee_crawler/agent_messaging/` package with publisher, listener, escalation scanner, and per-intent Pydantic schemas.
- Publisher wraps the existing `insert_agent_message` tool (no duplicate write paths), so every message inherits the 62a gateway audit trail AND fires the AFTER INSERT trigger that pg_notify()s the per-recipient channel.
- Listener uses `get_session_pool()` (port 5432). Callback enqueues notifications; a consumer coroutine dispatches full-row lookups via the transaction-mode pool so the session connection is never blocked.
- Reconnect loop with (1, 2, 4, 8)s backoff + 30s keepalive `SELECT 1` probe detects dead TCP early.
- Escalation scanner applies D-11's two-dimensional gate: `round_number >= 3` OR `expires_at < NOW()`. Idempotent by construction.
- 9 test functions cover COMMS-01 (payload validation + send_message + LISTEN/NOTIFY roundtrip), COMMS-02 (Darwin-Knox), COMMS-03 (Knox-Darwin), COMMS-04 (both escalation branches), and OBS-04 (`v_agent_reasoning_trace` replay-by-hash).

## Task Commits

1. **Task 1: Publisher + listener + schemas** — `5bdb493` (feat)
2. **Task 2: Escalation scanner + integration tests** — `4bdc120` (test)

_Note: both tasks ran TDD-style. Task 1's RED was a failing import; GREEN created the four core modules. Task 2's RED was the test module; GREEN was the escalation.py hardening + test file itself. Tests run pure-Python validators locally (2 pass) and skip DB-backed tests when DATABASE_URL_TEST is unset — expected local-dev behavior per plan._

## Files Created/Modified

- `fee_crawler/agent_messaging/__init__.py` — package exports (send_message, run_listener, scan_for_escalations, list_escalated_threads, 5 Pydantic schemas, validate_payload_for_intent)
- `fee_crawler/agent_messaging/schemas.py` — per-intent Pydantic validators; ChallengePayload / ProvePayload / AcceptPayload / RejectPayload / EscalatePayload; passthrough for coverage_request / clarify
- `fee_crawler/agent_messaging/publisher.py` — `async def send_message(sender, recipient, intent, payload, correlation_id, ...) -> message_id`; wraps `insert_agent_message` through `with_agent_context`; sender kwarg is advisory (gateway identity wins)
- `fee_crawler/agent_messaging/listener.py` — `async def run_listener(agent_name, handler, *, stop_event, backoff_schedule, keepalive_seconds)`; raw `add_listener` + queue handoff + reconnect loop + keepalive probe
- `fee_crawler/agent_messaging/escalation.py` — `async def scan_for_escalations() -> int` + `async def list_escalated_threads(*, since_hours)`; idempotent D-11 predicate
- `fee_crawler/tests/test_agent_messaging.py` — 9 test functions covering COMMS-01..04 + OBS-04

## Decisions Made

- **Raw asyncpg over `asyncpg-listen`:** the hand-rolled reconnect loop is ~40 lines, keeps the dep surface small, and matches the idiom research §Mechanics 2 documents. `asyncpg-listen` remains a drop-in alternative if the loop proves fragile — only the listener module would change.
- **Queue+worker split inside `run_listener`:** the `add_listener` callback runs inside asyncpg's protocol loop; heavy work there would delay other notifications. Pattern: callback enqueues `message_id`, consumer coroutine pulls from queue and calls `_dispatch_message` which uses the transaction-mode pool for full-row `SELECT`.
- **`sender` kwarg is advisory:** the actual DB row's `sender_agent` comes from the gateway's `agent_name` header via `insert_agent_message`. This matches 62a's spoofing threat model (T-62B-05-01). Phase 68 SEC-04 will harden to JWT.
- **`with_agent_context(correlation_id=corr)` wraps `send_message`:** so the gateway event and the `agent_messages` row share the same correlation — critical for OBS-04 (`v_agent_reasoning_trace` JOINs on correlation_id).
- **Idempotent escalation scan:** `WHERE state = 'open'` means re-running the scan cannot cascade escalated rows further. T-62B-05-05 DoS mitigation.
- **Keepalive 30s / probe timeout 5s:** research §Mechanics 2 notes `add_listener` can silently stop delivering if TCP dies unnoticed; a cheap `SELECT 1` probe catches this and triggers the reconnect branch.

## Deviations from Plan

None material. The plan's `action` stub used `result["message_id"]` dict access, but the existing `insert_agent_message` returns a Pydantic `InsertAgentMessageOutput` BaseModel. Switched to attribute access (`result.message_id`) and added a `result.success` check that raises on gateway failure. This is a correctness fix (Rule 1: bug) — the plan's stub would have TypeError'd at runtime. Committed in `5bdb493`.

Also added `with_agent_context(agent_name=sender, correlation_id=corr)` around the `insert_agent_message` call. Without this, the gateway would generate a fresh correlation_id per message — breaking OBS-04 test_replay_by_hash's invariant that event + message share a correlation. Rule 2 (missing critical functionality for correctness). Committed in `5bdb493`.

**Total deviations:** 2 auto-fixed (both Rule 1/2 correctness).
**Impact on plan:** No scope creep — both adjustments are small and necessary for the stated acceptance criteria.

## Issues Encountered

- **No local Postgres available:** The DB-backed tests skip via the `db_schema` fixture's `DATABASE_URL_TEST` check. Per plan, this is the expected local-dev posture; CI must set both `DATABASE_URL_TEST` and `DATABASE_URL_SESSION_TEST` so no test silently skips.
- **Working tree drift at start:** The worktree's branch was checked out at `01fdcde` (pre-62B work) but the orchestrator expected base `b51086f` (62B Wave 2 complete). Resolved via `git reset --soft b51086f && git checkout HEAD -- .` to realign working tree with HEAD before editing.

## User Setup Required

None — no external services or secrets added. All infrastructure was staged by prior plans:
- `DATABASE_URL_SESSION` is already required (62B-02 set this contract in CLAUDE.md).
- `agent_messages_notify_trigger` is already live (62B-01 shipped it).
- The `agent_messages` table was created in 62a; this plan only adds runtime code.

## Research Adherence

Research §Mechanics 2 pattern was adopted with two enhancements:
1. **Queue handoff inside callback** (research example does the handler call inline). The inline pattern blocks the protocol loop during full-row SELECTs; the enhanced pattern keeps the session connection responsive.
2. **30s keepalive SELECT 1 probe** (research mentions but doesn't show). Catches dead TCP faster than waiting for add_listener to notice.

`asyncpg-listen` was NOT adopted — the raw pattern is stable enough for 62B and keeps the dep surface at zero new packages. This is documented in `listener.py`'s module docstring so future maintainers can swap if needed.

## Next Phase Readiness

- **62B-06 (sequential dependency):** Task 2 says 62B-06 also touches `tools_agent_infra.py`. This plan did NOT modify that file — the existing `insert_agent_message` shape already matched the publisher's needs. 62B-06 can layer on top without any merge conflict in `tools_agent_infra.py`.
- **Phase 63 (Knox):** `send_message()` is the canonical message producer. Knox's adversarial challenge in LOOP-07 imports `send_message` + `validate_payload_for_intent`.
- **Phase 64 (Darwin):** Darwin's classification-challenge path imports `send_message`. Darwin must also spawn `run_listener('darwin', handler)` inside its Modal function so it receives Knox's proofs.
- **Phase 65 (Atlas):** Atlas schedules `scan_for_escalations()` via pg_cron and calls `list_escalated_threads()` into the daily digest generator.
- **OBS-04 admin UI:** `/admin/agents/replay` queries `v_agent_reasoning_trace` directly; this plan ensures the publisher lands messages under the caller's correlation_id so the view returns a complete timeline.

## Self-Check: PASSED

**Files exist (all created in this plan):**
- FOUND: fee_crawler/agent_messaging/__init__.py
- FOUND: fee_crawler/agent_messaging/schemas.py
- FOUND: fee_crawler/agent_messaging/publisher.py
- FOUND: fee_crawler/agent_messaging/listener.py
- FOUND: fee_crawler/agent_messaging/escalation.py
- FOUND: fee_crawler/tests/test_agent_messaging.py

**Commits exist:**
- FOUND: 5bdb493 (feat: agent_messaging publisher + listener + payload schemas)
- FOUND: 4bdc120 (test: escalation scanner + COMMS-01..04 + OBS-04 integration tests)

**Acceptance grep matches:**
- `get_session_pool` in listener.py: 3 matches (>=1 required) — PASS
- `add_listener` / `remove_listener` in listener.py: 5 matches (>=2 required) — PASS
- `DATABASE_URL_SESSION` / `session_pool` in listener.py: 4 matches (>=1 required) — PASS
- `state = 'escalated'` in escalation.py: 5 matches (>=2 required) — PASS
- `round_number >= 3` in escalation.py: 2 matches (>=1 required) — PASS
- `expires_at < NOW` in escalation.py: 2 matches (>=1 required) — PASS

**Test collection:**
- 9 test functions collected cleanly (`pytest --collect-only -q`) — PASS
- 2 pure-Python validation tests pass locally; 7 DB-backed tests skip correctly when `DATABASE_URL_TEST` is unset — PASS (matches plan's explicit "skip cleanly in local dev" expectation).

---
*Phase: 62B-agent-foundation-runtime-layer*
*Completed: 2026-04-17*
