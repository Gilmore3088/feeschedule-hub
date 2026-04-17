---
phase: 62B-agent-foundation-runtime-layer
reviewed: 2026-04-16T18:30:00Z
depth: standard
files_reviewed: 46
files_reviewed_list:
  - fee_crawler/__main__.py
  - fee_crawler/agent_base/adversarial_gate.py
  - fee_crawler/agent_base/base.py
  - fee_crawler/agent_base/bootstrap.py
  - fee_crawler/agent_base/dispatcher.py
  - fee_crawler/agent_base/health_rollup.py
  - fee_crawler/agent_base/loop.py
  - fee_crawler/agent_messaging/escalation.py
  - fee_crawler/agent_messaging/listener.py
  - fee_crawler/agent_messaging/publisher.py
  - fee_crawler/agent_messaging/schemas.py
  - fee_crawler/agent_tools/context.py
  - fee_crawler/agent_tools/gateway.py
  - fee_crawler/agent_tools/pool.py
  - fee_crawler/agent_tools/schemas/agent_infra.py
  - fee_crawler/agent_tools/tools_agent_infra.py
  - fee_crawler/commands/agent_graduate.py
  - fee_crawler/commands/exception_digest.py
  - fee_crawler/modal_app.py
  - fee_crawler/testing/canary_runner.py
  - fee_crawler/testing/canary_schema.py
  - fee_crawler/testing/contract_test_base.py
  - fee_crawler/testing/fake_anthropic.py
  - fee_crawler/testing/shadow_helpers.py
  - src/app/admin/admin-nav.tsx
  - src/app/admin/agents/agent-tabs.tsx
  - src/app/admin/agents/layout.tsx
  - src/app/admin/agents/lineage/page.tsx
  - src/app/admin/agents/lineage/tree-view.tsx
  - src/app/admin/agents/messages/page.tsx
  - src/app/admin/agents/messages/thread-view.tsx
  - src/app/admin/agents/overview/tiles.tsx
  - src/app/admin/agents/page.tsx
  - src/app/admin/agents/replay/page.tsx
  - src/app/admin/agents/replay/timeline.tsx
  - src/lib/crawler-db/agent-console.ts
  - supabase/migrations/20260501_agent_events_status_widen.sql
  - supabase/migrations/20260502_agent_registry_lifecycle_state.sql
  - supabase/migrations/20260503_agent_lessons.sql
  - supabase/migrations/20260504_shadow_outputs.sql
  - supabase/migrations/20260505_canary_runs.sql
  - supabase/migrations/20260506_lineage_graph_function.sql
  - supabase/migrations/20260507_v_agent_reasoning_trace.sql
  - supabase/migrations/20260508_agent_messages_notify_trigger.sql
  - supabase/migrations/20260509_agent_health_rollup.sql
  - supabase/migrations/20260510_promote_to_tier3_tighten.sql
  - supabase/migrations/20260511_pg_cron_review_dispatcher.sql
  - supabase/migrations/20260512_agent_health_rollup_seed.sql
  - supabase/migrations/20260513_fix_refresh_agent_health_rollup.sql
findings:
  critical: 0
  warning: 6
  info: 8
  total: 14
status: issues_found
---

# Phase 62B: Code Review Report

**Reviewed:** 2026-04-16T18:30:00Z
**Depth:** standard
**Files Reviewed:** 46 (actual file count; some listed entries overlap with migration numbering)
**Status:** issues_found

## Summary

Reviewed Phase 62B runtime-layer files at standard depth with explicit attention to the five pitfalls flagged in the phase context:

1. **LISTEN/NOTIFY payload is message_id UUID only** — Verified. `20260508_agent_messages_notify_trigger.sql` sends `NEW.message_id::text` (36 bytes) on `agent_msg_<recipient>`; listener fetches the full row via `get_pool()`. Clean.
2. **Session-mode pool (port 5432) for LISTEN** — Verified. `pool.py::get_session_pool()` requires `DATABASE_URL_SESSION`, leaves `statement_cache_size` at default, uses `max_inactive_connection_lifetime=0`. Listener explicitly uses `get_session_pool()`; full-row fetch uses the transaction pool. Clean.
3. **Shadow-mode gate at gateway level** — Verified. `gateway.py` rewrites `status='shadow_diff'`, sets `is_shadow=true`, and `DELETE`s the `agent_auth_log` row inside the same transaction when `shadow_run_id` is in context. Per-tool code does not carry suppression logic. Clean.
4. **Graduation predicates are fixed strings** — Verified. `agent_graduate.py::PREDICATES` is a module-level `Dict[Tuple[str,str,str], str]` with literal SQL. The agent_name input is used ONLY as a dict-key lookup; no interpolation reaches `conn.fetchval(predicate)`. Clean.
5. **Cross-agent sender spoofing guard** — Verified. `insert_agent_message` writes `sender_agent` from its `agent_name` kwarg (gateway-derived identity), not from the payload. `adversarial_gate._await_peer_accept` filters on `sender_agent = peer AND recipient_agent = originator`. Clean.

Overall the framework is well-architected, well-documented, and internally consistent. Issues found are primarily correctness bugs in placeholder migration logic and a handful of reliability/style concerns. No Critical security findings.

## Warnings

### WR-01: `review_latency_seconds` computation is always NULL (stale placeholder)

**File:** `supabase/migrations/20260509_agent_health_rollup.sql:35` (and 20260513 line 27 — same bug re-introduced in the fix migration)
**Issue:** The review-latency aggregator computes `AVG(CASE WHEN action='review' THEN EXTRACT(EPOCH FROM (created_at - created_at))::INT ELSE NULL END)`. `created_at - created_at` is always zero by construction, so the metric reports `0` (or NULL) for every bucket. The OBS-05 acceptance bar is "unreviewed events discovered within 15 minutes" — this metric will silently mislead operators until Phase 63 rewrites it.
**Fix:** At minimum add a TODO annotation noting the value is a placeholder (a comment exists in 20260509 labelling it "Placeholder derivations; Phase 63 tunes per-agent semantics" but the comment was dropped from the 20260513 rewrite). Preferred: compute latency as `EXTRACT(EPOCH FROM (created_at - parent.created_at))` by joining `agent_events` to itself on `parent_event_id`, bounded to `action='review'` rows.

### WR-02: `cost_to_value_ratio` denominator uses non-existent `action='success'` filter

**File:** `supabase/migrations/20260509_agent_health_rollup.sql:38` and `20260513_fix_refresh_agent_health_rollup.sql:33`
**Issue:** `SUM(cost_cents)::NUMERIC / NULLIF(COUNT(*) FILTER (WHERE action='success'), 0)`. `action` values are verbs like `extract`, `review`, `improve`, `dissect`, `paused_abort`, `review_tick`, `pattern_promote` — never `'success'` (that's a `status` value). The filter will match zero rows, `NULLIF(0,0)` returns NULL, and the ratio is NULL for every bucket. Same category of bug as WR-01.
**Fix:**
```sql
SUM(cost_cents)::NUMERIC / NULLIF(COUNT(*) FILTER (WHERE status='success'), 0)
```

### WR-03: `dispatcher.py` releases row locks before processing, breaking SKIP LOCKED guarantee

**File:** `fee_crawler/agent_base/dispatcher.py:46-58`
**Issue:** The docstring promises "pre-claim rows inside a single transaction" and "FOR UPDATE SKIP LOCKED ensures two concurrent dispatchers partition the tick set." The code actually opens a transaction, runs `SELECT ... FOR UPDATE SKIP LOCKED`, then exits the `async with conn.transaction()` block with no intervening UPDATE. After the transaction commits the row locks are released, so a second dispatcher calling this function a moment later will re-select the same pending rows (since `_mark_success` runs outside the claim transaction). Two dispatchers CAN double-fire `agent.review()`.
**Fix:** Flip the tick row to a claimed-but-not-terminal status (e.g., `status='in_progress'`) inside the same transaction as the `SELECT FOR UPDATE SKIP LOCKED`. Then dispatch outside the transaction, and only flip to `success`/`error` afterward. Widen the `agent_events_status_check` to allow the intermediate status.

### WR-04: `canary_runner.started_at` uses naive `datetime.utcnow()` (deprecated + TZ-ambiguous)

**File:** `fee_crawler/testing/canary_runner.py:62`
**Issue:** `started = datetime.utcnow()` returns a naive datetime. Python 3.12 deprecates `datetime.utcnow()` in favor of `datetime.now(timezone.utc)`. The `canary_runs` table column is `TIMESTAMPTZ`, and asyncpg will interpret a naive datetime in the Postgres session's local timezone — not guaranteed to be UTC. For Supabase (UTC) this happens to be correct, but it's a latent bug for any non-UTC Postgres session, and the deprecation warning will fire.
**Fix:**
```python
from datetime import datetime, timezone
started = datetime.now(timezone.utc)
```

### WR-05: `modal_app.py::run_post_processing` 2-minute window can miss daily pipeline under jitter

**File:** `fee_crawler/modal_app.py:169-173`
**Issue:** The daily pipeline is gated on `now.hour == 6 and now.minute < 2`. Modal's minute cron has observable jitter (plus the 3600s timeout bucket can slip by a second or two on container cold-start). If the tick that lands between 06:00:00 and 06:01:59 is skipped (Modal cold-start, upstream transient error, etc.), the daily pipeline is silently missed for 24h — no retry. This failure mode is invisible because `dispatch_only` is a successful return.
**Fix:** Use a last-run marker stored in Postgres (e.g., a singleton row in a `workers_last_run` table keyed by `job_name='daily_pipeline'`), and trigger when `now >= next_due_at`. Or widen the window to 06:00-06:05 and rely on an idempotent guard column on each pipeline step. At minimum, log a WARNING when the window opens so missed runs are observable.

### WR-06: `lineage_graph()` returns `{"error": ...}` shape, but TS consumer treats it as `LineageGraph`

**File:** `supabase/migrations/20260506_lineage_graph_function.sql:17-19` and `src/lib/crawler-db/agent-console.ts:143-150`
**Issue:** When `fees_published.fee_published_id` does not exist, the function returns `jsonb_build_object('error', 'fee_published_id not found')`. The TS helper `getLineageGraph` does `rows[0]?.g ?? null` and returns that object typed as `LineageGraph` — the consumer component `TreeView` checks `!graph.tier_3` and renders "No lineage found" — so the user UX is fine. But the error shape itself is never surfaced; a genuine data-integrity failure is indistinguishable from a typo in the fee ID. Additionally, after the `SELECT INTO v_verified ... WHERE fee_verified_id = v_published.lineage_ref` line (20260506:21), the code does NOT check `FOUND` and proceeds to dereference `v_verified.fee_raw_id` — if the Tier-2 row is missing (data integrity breach), the function silently returns a tree with an empty `row` for tier_2 instead of flagging the gap.
**Fix:** Add `IF NOT FOUND` guards after the Tier-2 and Tier-1 SELECTs and return a structured `{"error": "tier_2_missing", "published_id": ..., "lineage_ref": ...}` payload. Surface the error branch in `getLineageGraph` by checking `rows[0]?.g?.error` and either throwing or returning a discriminated-union type.

## Info

### IN-01: `default_improve_commit` loses data when `after=None` but `lesson` has no `after` key

**File:** `fee_crawler/agent_base/loop.py:135-137`
**Issue:** The expression `lesson.get("after") if isinstance(lesson, dict) and "after" in lesson else lesson` intentionally treats "no after key" as "full lesson is the after-state." That's reasonable, but when `lesson["after"]` is explicitly `None` (valid case — a commit that clears a prior lesson), the condition `"after" in lesson` is True and `after=None` is recorded, losing the "full lesson" fallback. Not a bug today (callers don't pass `after=None`), but brittle.
**Fix:** Document the intended semantics in the docstring, or switch to an explicit sentinel:
```python
_MISSING = object()
after_value = lesson.get("after", _MISSING) if isinstance(lesson, dict) else _MISSING
payload_after = after_value if after_value is not _MISSING else lesson
```

### IN-02: `default_understand` replaces `created_at` on update, breaking creation-time semantics

**File:** `fee_crawler/agent_base/loop.py:103-108`
**Issue:** The `ON CONFLICT DO UPDATE` sets `created_at = NOW()`, which overwrites the lesson's original creation timestamp on every update. Downstream queries using `ORDER BY created_at DESC` will see a moving-target timestamp. The docstring says "History is still recoverable via agent_events rows" — fine — but the column name `created_at` should mean "when created." Consider adding `updated_at TIMESTAMPTZ` to `agent_lessons` and setting THAT on conflict instead.
**Fix:** Add `updated_at` column to the `agent_lessons` migration (a follow-up migration) and change the upsert:
```sql
ON CONFLICT (agent_name, lesson_name) DO UPDATE
    SET description = EXCLUDED.description,
        evidence_refs = EXCLUDED.evidence_refs,
        updated_at = NOW()
```

### IN-03: `bootstrap.get_lifecycle_state` swallows `RuntimeError` but not `asyncpg.PostgresError`

**File:** `fee_crawler/agent_base/base.py:108-111` (and `bootstrap.py:40-52`)
**Issue:** The wrapper catches `RuntimeError` from `get_pool()` (when `DATABASE_URL` is unset) so pure-Python unit tests can run without a DB. Good. But if the DB is reachable and `agent_registry` query fails for any other reason (connection drop, schema mismatch, timeout), the error propagates and kills the turn. That's the intended behavior per the docstring, but the distinction is subtle — a startup-time misconfiguration (wrong schema path) will now look like a runtime regression.
**Fix:** No code change required; document the "which errors gate the turn" contract more explicitly in the docstring so future maintainers don't broaden the catch. Current wording is fine.

### IN-04: `adversarial_gate.queue_improve_rejected` uses `gen_random_uuid()` for correlation_id if context empty

**File:** `fee_crawler/agent_base/adversarial_gate.py:212`
**Issue:** `COALESCE($4::UUID, gen_random_uuid())` fabricates a fresh correlation_id when the caller has no active context. This means a failed IMPROVE that's not inside a `with_agent_context()` block becomes a singleton thread in `v_agent_reasoning_trace`, unlinkable to the rest of the agent's reasoning. For the v1 daily-digest use case this is acceptable (the digest shows the row regardless), but it's a silent correctness gap for cross-cutting traces.
**Fix:** Either make the context required (raise if `ctx.get("correlation_id")` is None), or log a WARNING when falling back to a fresh UUID so operators can trace the gap.

### IN-05: `promote_to_tier3` does not check for duplicate darwin/knox accepts

**File:** `supabase/migrations/20260510_promote_to_tier3_tighten.sql:30-41`
**Issue:** The handshake check `EXISTS (... WHERE sender_agent='darwin' AND intent='accept')` returns TRUE if ANY darwin-accept row references the fee_verified_id — including duplicates or stale accepts from prior runs. Nothing prevents a single accept message from gating an unlimited number of `promote_to_tier3` calls for the same fee_verified_id (though the unique constraint on `fees_published.lineage_ref` presumably prevents double-publish; I did not read that migration). For a defense-in-depth posture, the handshake should reference a specific correlation_id, or the accept row should be marked `used` once consumed.
**Fix:** Add `state='resolved'` filter to the EXISTS check so escalated or superseded accept rows do not satisfy the handshake. Long-term, track consumed accepts via `update_agent_message_intent` transitions and filter on `resolved_by_event_id IS NULL` where appropriate.

### IN-06: `fake_anthropic.FakeAnthropicClient._do` returns even when `_is_async=True`

**File:** `fee_crawler/testing/fake_anthropic.py:93-97`
**Issue:** `async def create(self, **kw)` returns `self._do(**kw)` directly — the sync `_do` returns a `FakeResponse`, and awaiting a non-coroutine returns the value unchanged. Works today, but if `_do` grows an `await` call (e.g., to simulate streaming), the async path will silently become sync and tests will fall out of parity with real anthropic-SDK call semantics.
**Fix:** Make `_do` a plain helper and keep `create` coroutine-shaped with `return await asyncio.coroutine(lambda: self._do(**kw))()` equivalent, OR split into `_do_sync` / `_do_async` so the intent is explicit.

### IN-07: `/admin/agents/replay` validates correlation UUID format but does not validate shape for lineage fee IDs

**File:** `src/app/admin/agents/lineage/page.tsx:18-22` vs `replay/page.tsx:13-14`
**Issue:** Replay tab uses a strict UUID regex before hitting the DB (defense-in-depth). Lineage tab validates fee ID is a positive integer. Both are fine — but the lineage validator accepts `Number.isInteger(feeId)` after `Number(feeParam)`, which will parse `"1e10"` to `10000000000` and pass (scientific notation). Not a security issue (postgres client parameterizes the bigint), but the user experience is weird.
**Fix:** Tighten the check:
```typescript
const validFeeId = /^\d{1,12}$/.test(feeParam) ? Number(feeParam) : null;
```

### IN-08: `default_dissect` truncates events list to 10 entries but records `events_count` from original length

**File:** `fee_crawler/agent_base/loop.py:51-55`
**Issue:** The preview slices `events[:10]` but `events_count: len(events or [])` records the full count. That's correct behavior but the docstring says "larger payloads are capped by the JSONB 64KB convention used elsewhere (gateway truncation is only applied on tool-calls; the default helpers rely on caller discipline)." The 10-entry cap is caller discipline, but 10 items of dict-shaped events can still exceed 64KB. If a subclass passes 10 large dicts, the payload is not bounded by the gateway's 64KB cap (this helper calls `conn.execute` directly, bypassing `with_agent_tool`).
**Fix:** Either route the INSERT through `with_agent_tool(entity='_dissect', action='create')` to pick up the 64KB truncation path, or apply `_truncate_payload` inline:
```python
from fee_crawler.agent_tools.gateway import _truncate_payload
payload = _truncate_payload({"events_count": len(events or []), "events": events[:10]})
```

---

_Reviewed: 2026-04-16T18:30:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
