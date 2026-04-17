---
phase: 62B-agent-foundation-runtime-layer
plan: 07
subsystem: testing
tags: [python, asyncio, adversarial-gate, canary-regression, loop-07, agent-messaging]

# Dependency graph
requires:
  - phase: 62B-03
    provides: AgentBase subclass contract + improve() override point
  - phase: 62B-04
    provides: canary_runner.run_canary + CanaryCorpus/CanaryVerdict schemas
  - phase: 62B-05
    provides: agent_messaging.send_message + challenge/accept/reject intents
  - phase: 62B-01
    provides: agent_events.status CHECK widen allowing 'improve_rejected' (migration 20260501)
provides:
  - fee_crawler/agent_base/adversarial_gate.py with run_gate/queue_improve_rejected/GateVerdict/default_corpus_loader
  - AgentBase.improve() rewired so every lesson runs through the LOOP-07 gate
  - Canary-required + peer-challenge-optional verdict contract
  - Digest-queue path for failed IMPROVE (D-08) discoverable via agent_events status='improve_rejected'
  - 8 pytest contract tests covering every reject reason + happy paths + digest query
affects:
  - 62B-08 pg_cron review dispatcher (reads improve_rejected as digest source)
  - 63-knox (Knox.improve automatically gated; agent must ship canary corpus)
  - 64-darwin (Darwin.improve automatically gated)
  - 65-atlas (Atlas.improve + daily digest includes improve_rejected rows)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "LOOP-07 gate: canary floor + peer ceiling + digest on fail (no silent drops)"
    - "Gate runs via dependency injection (canary_runner_fn, corpus_loader, agent_runner, send_message_fn) for testability"
    - "correlation_id kwarg on run_gate enables deterministic peer-accept tests without racing the 1s poll"
    - "Spoofing guard at the poll query: sender_agent=peer AND recipient_agent=originator (T-62B-07-02)"

key-files:
  created:
    - fee_crawler/agent_base/adversarial_gate.py
    - fee_crawler/tests/test_adversarial_gate.py
    - .planning/phases/62B-agent-foundation-runtime-layer/62B-07-SUMMARY.md
  modified:
    - fee_crawler/agent_base/base.py

key-decisions:
  - "Gate is plain function + dependency-injected callables; subclass override surface stays in AgentBase, not in the gate"
  - "Polling via 1s SELECT loop instead of LISTEN/NOTIFY — simpler, avoids session-mode pool dependency for a short-lived wait"
  - "default_corpus_loader is a thin shim over CanaryCorpus.model_validate_json to keep imports lazy (avoids circular import through fee_crawler.testing)"
  - "_canary_run_institution is a new AgentBase hook, leading underscore to stay out of AUTO_WRAP_METHODS"

patterns-established:
  - "GateVerdict NamedTuple (passed, reason, verdict_payload) — every reject reason is a string constant used in both code and test assertions"
  - "queue_improve_rejected writes exactly one agent_events row on reject; default_improve_commit runs only on pass — T-62B-07-01 repudiation guard codified by test_improve_bypasses_commit_on_reject"

requirements-completed: [LOOP-07]

# Metrics
duration: 8min
completed: 2026-04-16
---

# Phase 62B Plan 07: LOOP-07 Adversarial Review Gate Summary

**Adversarial gate (canary-floor + peer-ceiling) wired into `AgentBase.improve()`; failed IMPROVE queues to James's daily digest via `agent_events status='improve_rejected'`.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-04-17T06:49:51Z (base commit)
- **Completed:** 2026-04-17T06:56:04Z (final task commit)
- **Tasks:** 2
- **Files modified:** 3 (1 new module, 1 edit, 1 new test file)

## Accomplishments

- New module `fee_crawler/agent_base/adversarial_gate.py` exporting `run_gate`, `queue_improve_rejected`, `GateVerdict`, `default_corpus_loader`.
- `AgentBase.improve()` rewritten to run every lesson through `run_gate` before any write. On pass → `default_improve_commit`. On fail → `queue_improve_rejected` (no silent drops).
- Canary floor enforced: missing `canary_corpus_path` OR negative-delta verdict rejects the lesson immediately with structured `verdict_payload` (deltas surfaced in the digest).
- Peer ceiling wired: when `lesson['peer_challenge_recipient']` is set, gate issues an `intent='challenge'` agent_messages row and polls for `accept` within a configurable `peer_wait_seconds` window. No reply → reject.
- New hook `AgentBase._canary_run_institution(institution_id) -> dict` lets Phase 63+ subclasses plug real extraction metrics in without touching the gate plumbing.
- 8 pytest contract tests in `fee_crawler/tests/test_adversarial_gate.py` cover every reject reason, both happy paths, the digest query, and the repudiation-guard (rejected lessons never leave a `status='success'` row).

## Task Commits

1. **Task 1: adversarial_gate module + AgentBase.improve rewiring** — `e296d69` (feat)
2. **Task 2: 8 adversarial-gate tests** — `1922ecb` (test)

## Files Created/Modified

- `fee_crawler/agent_base/adversarial_gate.py` *(created)* — `run_gate`, `queue_improve_rejected`, `GateVerdict`, `default_corpus_loader`, `_await_peer_accept` helper. Three reject reasons: `no_canary_corpus`, `canary_regression`, `peer_rejected_or_timeout`. Also surfaces `corpus_load_error: <exc>` when `CanaryCorpus.model_validate_json` throws.
- `fee_crawler/agent_base/base.py` *(modified)* — `improve()` now dispatches to `run_gate` with lazy imports for `adversarial_gate`, `default_improve_commit`, `run_canary`, and `send_message`. New `_canary_run_institution` hook returns neutral passing metrics by default so test ergonomics survive without a per-agent runner.
- `fee_crawler/tests/test_adversarial_gate.py` *(created)* — 8 tests, per-schema pool injection via `_pool_injected` fixture (same pattern as `test_agent_base_auto_wrap::_pool_injected` and `test_agent_messaging::_bind_pool`).

## Gate Contract (GateVerdict)

| Field | Type | Meaning |
|-------|------|---------|
| `passed` | `bool` | True only when both canary and (optional) peer branches succeed |
| `reason` | `str` | One of: `ok`, `no_canary_corpus`, `canary_regression`, `peer_rejected_or_timeout`, `corpus_load_error: <exc>` |
| `verdict_payload` | `Optional[dict]` | On canary fail: `{coverage_delta, confidence_delta, extraction_count_delta, reason}`. On peer fail: `{peer, correlation_id, wait_seconds}` |

### Reject reasons

1. `no_canary_corpus` — `canary_corpus_path is None or ""`. Prevents self-modification without a deterministic regression baseline.
2. `corpus_load_error: <exc>` — `CanaryCorpus.model_validate_json` raised (bad JSON / schema drift).
3. `canary_regression` — `CanaryVerdict.passed is False` (any of the three deltas < 0).
4. `peer_rejected_or_timeout` — `lesson['peer_challenge_recipient']` set but no `intent='accept'` reply seen within `peer_wait_seconds`. Explicit `intent='reject'` from the peer also lands here.

### Peer-poll mechanism (simplification note)

Peer reply detection uses a 1-second `SELECT` loop against `agent_messages` rather than Postgres LISTEN/NOTIFY. Rationale:

- Gate waits are short (default 60s, test default 2-5s). NOTIFY adds a session-mode pool dependency and complicates error paths (missed notifications during reconnect).
- Filter matches 62B-05 handshake direction: `sender_agent = peer AND recipient_agent = originator AND intent IN ('accept','reject')` — spoofing guard (T-62B-07-02).
- Terminates early on the first matching row. Returns `False` on timeout OR explicit `reject`.
- Tests pass `correlation_id` as a kwarg so the accept row can be pre-seeded before `run_gate` is called — deterministic and race-free.

If Phase 63+ Knox/Darwin handshakes need sub-second latency, we can swap the loop for a LISTEN subscription without touching call sites.

## Decisions Made

- **Dependency injection over monkey-patching.** `run_gate` takes `canary_runner_fn`, `corpus_loader`, `agent_runner`, and `send_message_fn` as kwargs so tests (and future subclasses) can swap them without touching module-level singletons. Keeps the contract narrow and testable.
- **`correlation_id` kwarg on `run_gate`.** Without it, the peer-accept test would need to race the 1s poll loop. Passing the correlation through lets the test seed the accept row up-front; production callers leave it unset and the gate generates a fresh UUID.
- **`_canary_run_institution` as a private hook.** Leading underscore keeps it out of `AUTO_WRAP_METHODS` (confirmed by existing `test_auto_wrap_allowlist_exact`). It runs inside the already-wrapped `improve`, so a second `with_agent_context` entry would be wasteful.
- **Lazy imports inside `improve()`.** Avoids a static cycle: `adversarial_gate` → `fee_crawler.testing.canary_schema` → (Pydantic); and `agent_messaging.publisher` → `agent_tools.schemas` → other gateway pieces. Matches the existing pattern in `loop.py`.

## Deviations from Plan

None — plan executed as written. Task 2 ships 8 tests (one more than the plan's 6-test minimum) because the repudiation-guard test (`test_improve_bypasses_commit_on_reject`) and the explicit-reject test (`test_peer_reject_rejects`) both map to threat-model mitigations (T-62B-07-01 repudiation; `peer_rejected_or_timeout` covers both timeout AND explicit reject paths). All 8 tests trace directly to acceptance criteria or threat-register items.

## Issues Encountered

- **Worktree base mismatch.** Worktree HEAD pointed at `01fdcde` (post-merge main) instead of the plan's expected base `6182d0d`. Followed the plan's `<worktree_branch_check>` protocol and `git reset --hard` to the expected base commit before touching any plan artifacts. Since the worktree was clean and the intended scope is only Plan 62B-07 deliverables, no planning work was lost.

## User Setup Required

None — LOOP-07 gate is pure Python + Postgres; no external services or secrets added.

## Self-Check

- `fee_crawler/agent_base/adversarial_gate.py` — FOUND (verified via `python -c "from fee_crawler.agent_base.adversarial_gate import ..."` returning `OK`)
- `fee_crawler/agent_base/base.py` — MODIFIED (grep returns 5+ matches for `run_gate` / `queue_improve_rejected`)
- `fee_crawler/tests/test_adversarial_gate.py` — FOUND with 8 async tests (collect-only confirms)
- Commit `e296d69` (Task 1 feat) — FOUND via `git log`
- Commit `1922ecb` (Task 2 test) — FOUND via `git log`
- Existing `test_agent_base_auto_wrap.py` — 5 passed / 5 DB-skipped (unchanged baseline behaviour)
- Acceptance greps all pass: three reject reason strings in gate module, `improve_rejected` status string present, 2+ `run_gate`/`queue_improve_rejected` references in base.py, `_canary_run_institution` defined exactly once.

## Self-Check: PASSED

## Next Phase Readiness

- Plan 62B-08 (pg_cron review dispatcher) can read the digest query directly:
  `SELECT * FROM agent_events WHERE status='improve_rejected' AND created_at > NOW() - INTERVAL '24 hours'`
- Phase 63 (Knox) + Phase 64 (Darwin) must ship per-agent canary corpora and override `_canary_run_institution` with real extraction metrics. Until then, their `improve()` calls either auto-reject (if `canary_corpus_path` unset) or pass trivially (neutral default metrics) — both behaviours are tested.
- Peer-challenge path is ready for Knox↔Darwin handshakes wired in Phase 63-64 without further plumbing.

---
*Phase: 62B-agent-foundation-runtime-layer*
*Completed: 2026-04-16*
