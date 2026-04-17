# Agent Bootstrap Runbook

Phase 62b BOOT-01 (D-25). Version-controlled operator reference for Q1/Q2/Q3
graduation, rollback, and exception review.

**Operator SLA:** James reviews the daily exception digest within 48 hours.

---

## 1. Overview

Every agent in the v10.0 team — Knox, Darwin, Atlas, Hamilton, and the 51
state agents — lives in one of four lifecycle states, stored in
`agent_registry.lifecycle_state`:

| State                 | Behavior                                                              |
| --------------------- | --------------------------------------------------------------------- |
| `q1_validation`       | Every output held for human approval via the daily exception digest   |
| `q2_high_confidence`  | Auto-commit outputs with `confidence >= 0.85`; the rest + random 5% sample land in the digest |
| `q3_autonomy`         | Fully autonomous; quarterly random sampling audits drift               |
| `paused`              | `AgentBase.run_turn` aborts immediately with `AgentPaused`             |

State is enforced at turn start, not at write time. Pause any agent
mid-flight by updating a single column — rollback is one SQL statement,
not a code deploy.

---

## 2. Lifecycle Semantics

`AgentBase._wrap_with_context` reads `lifecycle_state` at the top of every
`run_turn()` call. Behavior per state:

- **`q1_validation`** — the wrapper proceeds, but the agent's commits are
  expected to route through the human-review path. Use
  `fee_crawler.agent_base.bootstrap.should_hold_for_human(state)` in
  per-agent logic to opt into the hold. Every output is expected in the
  digest.
- **`q2_high_confidence`** — outputs with `confidence >= 0.85` auto-commit.
  Outputs with lower confidence plus a random 5% sample land in the digest
  (see section 5).
- **`q3_autonomy`** — full auto; the digest only pulls rare samples.
- **`paused`** — `AgentBase` writes `agent_events action='paused_abort'`
  and raises `fee_crawler.agent_base.bootstrap.AgentPaused`. The subclass
  body never runs.

---

## 3. Graduation

Advance (or rollback) an agent's lifecycle_state:

```bash
python -m fee_crawler agent-graduate <agent_name> --to <state>
```

Allowed `--to` values: `q1_validation | q2_high_confidence | q3_autonomy | paused`.

Predicates live in `fee_crawler/commands/agent_graduate.py` as the
`PREDICATES` dict, keyed on `(agent_name, from_state, to_state)`. Each
value is a **fixed SQL string** — do not interpolate user input (research
§Pitfall 6). Adding a new transition means adding a dict entry and an
agent-side acceptance test.

### Examples

```bash
# Happy path: advance Knox from Q1 to Q2 once > 95% of the last 30 days
# of fees were human-accepted.
python -m fee_crawler agent-graduate knox --to q2_high_confidence

# Pause Darwin immediately (no predicate check).
python -m fee_crawler agent-graduate darwin --to paused

# Advance Knox to Q3 once 90-day mean extraction_confidence exceeds 0.90.
python -m fee_crawler agent-graduate knox --to q3_autonomy
```

### Exit Codes

| Code | Meaning                                                                 |
| ---- | ----------------------------------------------------------------------- |
| 0    | Graduated (or no-op — already in the target state)                      |
| 2    | Invalid `--to` value                                                     |
| 3    | Unknown agent (no row in `agent_registry`)                               |
| 4    | No predicate registered for `(agent, from_state, to_state)`              |
| 5    | Predicate returned FALSE; `lifecycle_state` stays on the current value   |

Exit 5 is the "you haven't earned this yet" signal. Read the predicate,
fix the upstream metric, re-run.

---

## 4. Rollback

**Pausing is always allowed — no predicate runs:**

```bash
python -m fee_crawler agent-graduate <agent_name> --to paused
```

The CLI UPDATEs `agent_registry.lifecycle_state` directly. Next `run_turn`
call raises `AgentPaused`.

**Returning to autonomous operation:** the CLI does NOT define a
(paused → q2) shortcut. Re-graduate through the normal sequence —
`paused` → `q1_validation` → `q2_high_confidence` → `q3_autonomy` — each
step gated by its predicate (or explicitly admitted via the direct
`lifecycle_state` UPDATE documented in section 6).

---

## 5. Exception Review SLA

James reviews the daily exception digest within 48 hours (D-25).

### Generate a digest

```bash
# default: last 24 hours, stdout
python -m fee_crawler exception-digest

# custom window, write to file
python -m fee_crawler exception-digest --hours 48 --out /tmp/digest.md
```

### Digest sources (D-08, D-11, D-24)

1. **`agent_events` where `status='improve_rejected'`** — LOOP-07 failed
   IMPROVE gates. The proposed lesson is NOT applied; James decides
   accept/discard/iterate.
2. **`agent_messages` where `state='escalated'`** — handshakes past 3
   rounds or 24h without terminal status. Escalation scanner
   (`fee_crawler.agent_messaging.escalation.scan_for_escalations`) runs
   on pg_cron and flips rows to `escalated`.
3. **Q2 exception samples** — for agents in `q2_high_confidence`:
   `agent_events.status='success'` rows where `confidence < 0.85` OR a
   random 5% sample. Guards against overconfident-but-wrong outputs.

### Reviewer actions

- **Approve** — accept the agent's proposed change; the rejection row is
  informational. For Q2 low-confidence outputs, no action needed —
  auto-commit already happened.
- **Override** — flip the fee / lesson back by hand; optionally record a
  corrective lesson on the agent.
- **Pause** — if the agent shows systemic drift, run
  `agent-graduate <name> --to paused` and investigate.

---

## 6. Failure Modes

| Symptom                                  | Root cause                                                                           | Response                                                                                               |
| ---------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `graduate` exits 5 even with good data   | Predicate metric hasn't rolled up yet (e.g. 30-day window)                            | Wait for window; inspect predicate SQL against live data                                                |
| Predicate returns NULL                   | Empty source table (no rows to aggregate)                                             | `COALESCE(..., FALSE)` in-predicate treats NULL as failure; seed data or wait                           |
| `graduate` exits 3 on a known agent      | `agent_registry` seed missing; row was deleted                                         | Re-run `supabase/migrations/20260422_agent_registry_and_budgets.sql` or insert row manually             |
| Regression after graduation              | Predicate was satisfied by a biased window                                             | `agent-graduate <name> --to paused`; tighten predicate; re-graduate                                      |
| `paused_abort` events spamming           | Another operator paused the agent; scheduler keeps ticking                             | Check `agent_registry.lifecycle_state`; coordinate with the pauser                                      |
| Q2 digest is huge                        | Agent emitting many low-confidence rows; threshold may be wrong for this agent         | Temporarily widen window (`--hours 1`); investigate; consider per-agent threshold (deferred post-62b)   |

**Manual state override** (emergency only, bypasses predicate):

```sql
UPDATE agent_registry
   SET lifecycle_state = 'q1_validation'
 WHERE agent_name = 'knox';
```

Use sparingly. Every manual UPDATE should be followed by a short note in
the operator log.

---

## 7. SLAs per Loop Step

These are framework-level bars. Per-agent phases tighten them further.

| Step                                      | Target latency                                        |
| ----------------------------------------- | ----------------------------------------------------- |
| LOG (tool call → `agent_events` row)      | < 100 ms (Phase 62a gateway)                           |
| REVIEW (pg_cron tick → `review()` called) | < 15 minutes (SC1; Plan 62B-08 dispatcher)             |
| IMPROVE (lesson → canary verdict)         | < 5 minutes                                            |
| Escalation (3rd unresolved round → digest)| < 24 hours                                             |
| Daily digest → operator review            | < 48 hours (D-25)                                      |

---

## 8. On-Call Flowchart

**Symptom-driven triage:**

- **`/admin/agents` Overview tile is red (coverage drop)** → query
  `agent_events WHERE action='error' AND agent_name=<x> AND created_at > NOW() - INTERVAL '1 hour'`.
  Cross-reference with `agent_budgets` for halts.

- **Listener not receiving messages** → confirm `DATABASE_URL_SESSION`
  points at port 5432, not the transaction pooler on 6543. Session mode
  is required for LISTEN/NOTIFY (research §Pitfall 2). Restart the
  listener process after fixing.

- **Graduation predicate keeps failing despite good data** → print the
  predicate's actual result:
  ```sql
  -- Copy the predicate body from fee_crawler/commands/agent_graduate.py
  SELECT <predicate>;
  ```
  If it returns FALSE, the metric genuinely isn't there yet. If it
  returns TRUE but the CLI still reports failure, check for `search_path`
  drift or a stale connection.

- **`paused_abort` event spam** → `SELECT lifecycle_state FROM agent_registry WHERE agent_name=<x>`.
  Someone paused the agent. Stop the scheduler or re-graduate.

- **Digest is empty every day** → verify the escalation scanner is
  running (pg_cron job `escalation_scan`). Verify agents are actually
  writing `improve_rejected` events by sampling `SELECT * FROM agent_events WHERE status='improve_rejected' LIMIT 5`.

---

## References

- `fee_crawler/commands/agent_graduate.py` — PREDICATES dict + CLI.
- `fee_crawler/commands/exception_digest.py` — digest assembler.
- `fee_crawler/agent_base/bootstrap.py` — `AgentPaused`, `should_hold_for_human`.
- `fee_crawler/agent_base/base.py` — `_wrap_with_context` lifecycle branch.
- `supabase/migrations/20260502_agent_registry_lifecycle_state.sql` — column definition.
- `.planning/phases/62B-agent-foundation-runtime-layer/62B-CONTEXT.md` — D-22..D-25.
