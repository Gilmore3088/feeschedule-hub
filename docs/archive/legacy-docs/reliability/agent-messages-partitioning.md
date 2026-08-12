# `agent_messages` Partitioning — Prep Doc

**Status:** Deferred. Targeted budget when triggered: 3 days.
**Roadmap item:** Reliability backlog #8.
**Today's row count:** ~648.
**Last reviewed:** 2026-04-18.

This document is the prep work that makes the eventual partitioning migration
trivial. It is *not* an implementation plan to run today. The recommendation,
tripwires, and migration sketch are written so that future-you can execute
them in a single short worktree.

---

## 1. Current schema and indexes

Source of truth: `supabase/migrations/20260419_agent_messages.sql` plus the
NOTIFY trigger in `supabase/migrations/20260508_agent_messages_notify_trigger.sql`.

### Table definition

```sql
CREATE TABLE agent_messages (
    message_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sender_agent          TEXT NOT NULL,
    recipient_agent       TEXT NOT NULL,
    intent                TEXT NOT NULL CHECK (intent IN (
                            'challenge','prove','accept','reject','escalate',
                            'coverage_request','clarify')),
    state                 TEXT NOT NULL DEFAULT 'open' CHECK (state IN (
                            'open','answered','resolved','escalated','expired')),
    correlation_id        UUID NOT NULL,
    parent_message_id     UUID REFERENCES agent_messages(message_id),
    parent_event_id       UUID,
    payload               JSONB NOT NULL DEFAULT '{}'::jsonb,
    round_number          INTEGER NOT NULL DEFAULT 1,
    expires_at            TIMESTAMPTZ,
    resolved_at           TIMESTAMPTZ,
    resolved_by_event_id  UUID
);
```

### Indexes (all 3 are local b-tree)

| Index | Columns | Notes |
| --- | --- | --- |
| PK | `message_id` | Default UUID v4 — random distribution, no time correlation. |
| `agent_messages_recipient_state_idx` | `(recipient_agent, state, created_at DESC)` | Hot path. Drives the listener's per-recipient enumeration and Atlas's escalation scan. |
| `agent_messages_correlation_idx` | `(correlation_id)` | Drives `_await_peer_accept` poll, `v_agent_reasoning_trace`, and the Tier-3 publish gate. |
| `agent_messages_expires_idx` | `(expires_at) WHERE expires_at IS NOT NULL AND state = 'open'` | Partial index for the timeout half of the escalation predicate. |

### Constraints / triggers / FKs

- `parent_message_id REFERENCES agent_messages(message_id)` — self-FK, no
  cascade. (This **will** be a partitioning headache; see §4.)
- `agent_messages_notify_trigger` — `AFTER INSERT FOR EACH ROW`, calls
  `pg_notify('agent_msg_<recipient_agent>', message_id::text)`.
- Two `CHECK` constraints on `intent` and `state`.
- No FK to `agent_events` even though `parent_event_id` and
  `resolved_by_event_id` carry event UUIDs (this is intentional — `agent_events`
  is partitioned and cross-partition FKs are not supported).

### What is **not** there but probably should be

- **No index on `(payload->>'fee_verified_id')`** — the Tier-3 publish gate
  (`promote_to_tier3` in `20260510_promote_to_tier3_tighten.sql`) does
  `payload->>'fee_verified_id' = $1::text` with no supporting index. At 648
  rows it's a free seq-scan; at 1M rows it's the slowest query in the system.
  *Action: add a partial expression index now (§3 surprise list).*
- **No FK from `parent_event_id` / `resolved_by_event_id` to `agent_events`** —
  by design, but worth flagging for the partition migration so we don't try
  to "fix" it.

---

## 2. Access patterns

Every read/write site that touches the table:

### Writes (3 paths, all funnel through one tool)

| Site | Op | File | Frequency | Hot path? |
| --- | --- | --- | --- | --- |
| `insert_agent_message` tool | `INSERT` (sets `state='open'`) | `fee_crawler/agent_tools/tools_agent_infra.py:48` | Per agent handshake send | **Yes** — fires the NOTIFY trigger. |
| `update_agent_message_intent` tool | `UPDATE … WHERE message_id = $1` | `fee_crawler/agent_tools/tools_agent_infra.py:88` | One per state transition (open→answered/resolved/escalated/expired) | Background. |
| `scan_for_escalations()` | Bulk `UPDATE … RETURNING` on `state='open' AND (round_number >= 3 OR expires_at < NOW())` | `fee_crawler/agent_messaging/escalation.py:40` | pg_cron, daily slot | Background; rolling. |

`fee_crawler/agent_messaging/publisher.py::send_message` is the only
production caller of `insert_agent_message` (gateway-audited wrapper).

### Reads (5 distinct query shapes)

| Site | Query | File | Frequency | Hot path? |
| --- | --- | --- | --- | --- |
| Listener row lookup | `SELECT * FROM agent_messages WHERE message_id = $1::UUID` | `fee_crawler/agent_messaging/listener.py:129` | One per NOTIFY (every INSERT) | **Yes — PK lookup, must stay sub-ms.** |
| Adversarial gate poll | `SELECT intent FROM agent_messages WHERE correlation_id=$1 AND sender_agent=$2 AND recipient_agent=$3 AND intent IN ('accept','reject') ORDER BY created_at DESC LIMIT 1` | `fee_crawler/agent_base/adversarial_gate.py:169` | 1 Hz polling during a peer challenge (≤60s) | **Yes — fires every IMPROVE.** |
| Tier-3 publish gate | `SELECT EXISTS(SELECT 1 FROM agent_messages WHERE sender_agent=… AND intent='accept' AND payload->>'fee_verified_id'=$1)` (×2) | `supabase/migrations/20260510_promote_to_tier3_tighten.sql` | One per `promote_to_tier3` call | **Yes — gates every Tier-3 publish.** |
| `v_agent_reasoning_trace` | `UNION ALL` of `agent_events` + `agent_messages` filtered by `correlation_id` | `supabase/migrations/20260507_v_agent_reasoning_trace.sql` | Admin UI replay (`/admin/agents/replay/[id]`) | Request-driven, cold. |
| `listRecentThreads(sinceHours, limit)` | `GROUP BY correlation_id` over `created_at > NOW() - interval` | `src/lib/crawler-db/agent-console.ts:182` | Admin UI threads tab | Request-driven, cold. |
| Escalated digest list | `SELECT … WHERE state='escalated' AND created_at > NOW() - interval` | `fee_crawler/agent_messaging/escalation.py:60` | Daily digest render | Background. |

**Key takeaway:** Three of the five hot reads filter by `correlation_id`,
**not** by time. The Tier-3 gate filters by `payload->>'fee_verified_id'`
and currently has **no supporting index**. The listener PK lookup is
time-agnostic. Only the admin UI threads tab and the digest filter by
`created_at`.

This shapes the partitioning recommendation: a time-range partition
**hurts** the hot reads (every `correlation_id` lookup must scan all
partitions) unless we add a global-ish lookup helper.

---

## 3. Growth model

Calibration inputs:
- Today: ~648 rows in production.
- Darwin-drain backlog: 102,965 fees in `fees_raw` (per memory note).
- Darwin-drain cadence: weekly (per task brief).
- Per-fee message count: each Tier-2→Tier-3 promotion needs **at minimum**
  2 `accept` messages (Darwin + Knox). Adversarial gate adds 1
  `challenge` + 1 `accept|reject` per IMPROVE that opts in (today: rare).
  Coverage requests, clarifies, escalations add tail volume.

**Conservative estimate:** ~2.5 messages per fee processed (2 accepts +
0.5 amortized challenge/clarify/coverage_request).

| Window | Fees processed | Messages | Cumulative |
| --- | --- | --- | --- |
| Per Darwin-drain run (1 week) | 100,000 | 250,000 | — |
| Per month | ~430,000 | ~1.075M | — |
| Per quarter | — | ~3.2M | — |
| Per year | ~5.2M | ~13M | ~13M |

**Threshold crossings:**
- **1M rows:** ~4 weeks after Darwin-drain goes weekly.
- **10M rows:** ~9-10 months in.
- **At today's send rate (~648 over phase 62b lifetime):** never. The
  partitioning conversation is gated on whether Darwin-drain runs at the
  rate the owner thinks it will.

If Darwin-drain stays manual and lands a single monthly batch of 100K
fees, you have **~10 months** before crossing 1M. If it runs weekly, you
have **~4 weeks** after the first scheduled run. Either way, the trigger
is the schedule decision, not the row count itself.

---

## 4. Partitioning strategy options

| Option | Migration cost | Query impact | Ops burden | Rollback | Verdict |
| --- | --- | --- | --- | --- | --- |
| (a) RANGE on `created_at` (monthly) | **Medium** — copies fit the existing `agent_events` template (§template). Self-FK and PK reshape required. | **Mixed.** Range-pruning works for `listRecentThreads` and the digest. **Hurts** `correlation_id` and `payload->>'fee_verified_id'` lookups (every partition scanned). Mitigate with a partial index on `correlation_id` per partition. | Reuses pg_cron `maintain_*_partitions()` pattern already running for `agent_events`. | Easy: detach partitions, copy back into a single table. | **Recommended.** Mirrors `agent_events` so 18-month retention + cold-table archive works identically. |
| (b) LIST on `sender_agent` (darwin/knox/atlas/hamilton/other) | **High.** New senders (51 state agents per memory note, future Hamilton/Knox sub-agents) require schema changes. LIST cardinality grows. | Helps the Tier-3 publish gate (`sender_agent='darwin'/'knox'`) but **hurts** the listener (which filters on `recipient_agent`). | Schema migration every time a new agent is registered. | Hard: every new sender needs a partition; rollback drains the wrong way. | **Reject.** Sender-list churn is exactly the wrong axis for an agent system that grows through `agent_registry`. |
| (c) HASH on `correlation_id` | Low one-time migration. | Helps `_await_peer_accept` and the trace view; neutral for everything else. **Hurts** time-range queries (full fan-out). | No retention story — HASH partitions don't drop. You'd need a side time-range index plus archival cron. | Medium. | **Reject.** No retention path. Loses the operational symmetry with `agent_events`. |
| (d) pg_partman monthly | Low ongoing — partman handles partition creation + retention. | Same as (a). | New extension dependency. Supabase supports pg_partman but it's another moving part. | Easy with `partman.undo_partition`. | **Defer.** Worth considering if maintenance becomes painful, but `agent_events` already proves the hand-rolled cron pattern works. |
| (e) No partitioning + retention cron + cold-archive table | **Lowest.** Add a `agent_messages_archive` table + nightly job that moves rows older than N days. | Zero query impact for hot path; archived state can stay searchable via UNION view. | Single cron job; same payload as the `maintain_*_partitions` already running. | Trivial. | **Plan B.** If volume stays under 1M for the next 12 months, this beats partitioning on operator effort. |

### Primary recommendation: **(a) RANGE on `created_at`, monthly, with a 90-day live window**

Rationale:
1. **Symmetry.** The codebase already has two production-tested copies of
   the monthly RANGE pattern (`agent_events`, `agent_auth_log`). Both have
   working `maintain_*_partitions()` functions, pg_cron schedules, and
   a `*_default` partition for late arrivals. The third copy is muscle
   memory.
2. **Retention is the dominant cost driver, not query speed.** LISTEN/NOTIFY
   consumers don't care about old rows. The gate queries that *do* care
   (`promote_to_tier3`) only ever look at recent `accept` messages. A
   90-day live window keeps the hot partition under ~3M rows even at
   peak Darwin-drain.
3. **Migration is mechanical.** Copy the `agent_events` migration almost
   verbatim. The two real complications are the **self-FK on
   `parent_message_id`** (must be dropped — cross-partition FKs aren't
   supported; gateway already enforces) and the **PK reshape** to
   `(message_id, created_at)`.

The known cost: `correlation_id` and `payload->>'fee_verified_id'` lookups
will fan out across all live partitions. With a 90-day window and proper
local indexes that's at most 4 partition scans per query — still
sub-millisecond. We pay this cost for the operational simplicity of
matching the rest of the agent log family.

---

## 5. Retention policy

### What does each consumer need?

| Consumer | Retention need | Justification |
| --- | --- | --- |
| LISTEN/NOTIFY listeners | **Seconds.** | They process the row immediately; old rows never re-read. |
| `_await_peer_accept` | **Minutes** (≤ `peer_wait_seconds`, default 60s). | Polls a single correlation; once verdict is known, never re-read. |
| `promote_to_tier3` gate | **Hours to days.** | The accept must precede the publish call. In practice the publish runs in the same agent loop iteration. |
| Adversarial gate verdict reproduction | **30 days.** | Owner re-runs failed IMPROVE diagnostics. |
| Admin replay UI | **90 days** | `listRecentThreads(72)` defaults to 72h; users sometimes scroll back further. |
| Daily digest | **24h** (`list_escalated_threads`). | Window is parameterized; never asked for >7d. |
| Audit / compliance | **Indefinite** (cold storage only). | Same posture as `agent_events`: 18-month live, then archive partition rename. |

### Recommended policy

- **Live partition window:** 90 days. Nothing in the hot path needs more
  than 30. The 60-day buffer protects long-running adversarial canary
  exhaustion plus replay UI scroll.
- **Cold archive:** monthly partitions older than 90 days renamed to
  `agent_messages_YYYY_MM_archived` (matches `agent_events` convention).
  A follow-up Modal job can ship them to R2 + `DROP TABLE` (the same
  archive pipeline you'd build for `agent_events` once it crosses 18
  months).
- **The publish gate is the one thing to verify.** Today the Tier-3
  gate does **not** filter by time on the accept-message lookup. If
  you ever shorten retention below the actual gap between
  `agent_messages.intent='accept'` and the `promote_to_tier3` call,
  you'll silently fail every late publish. Mitigation: add an explicit
  `created_at >= NOW() - INTERVAL '7 days'` clause to the gate query
  **before** shortening retention.

---

## 6. Tripwires — when to pull the trigger

Pull the 3-day implementation trigger when **any one** of these fires:

| Tripwire | Threshold | How to monitor | What it tells you |
| --- | --- | --- | --- |
| Row count | `> 1,000,000` | `SELECT count(*) FROM agent_messages` (cron, daily) | Volume justifies the operational complexity. |
| Table size on disk | `> 2 GB` (heap) or `> 4 GB` (heap + indexes) | `pg_total_relation_size('agent_messages')` (cron, daily) | Vacuum / index bloat dominates planning time. |
| p95 INSERT latency | `> 50 ms` over a rolling 1h window | `pg_stat_statements` filtered to `query LIKE 'INSERT INTO agent_messages%'` | NOTIFY trigger overhead is no longer free; partition writes amortize. |
| p95 listener PK lookup latency | `> 5 ms` for `SELECT * FROM agent_messages WHERE message_id = $1` | `pg_stat_statements` | PK fanout is starting to bite even on a single big table. |
| p95 `_await_peer_accept` poll | `> 50 ms` for the correlation_id + sender + recipient query | `pg_stat_statements` | The 1Hz poll is now a real system load. |
| Index bloat | `> 30%` on any of the 3 indexes | `pg_stat_user_indexes` + `pgstattuple` | VACUUM is falling behind. |
| Escalation scan duration | `> 30 s` | Self-instrument `scan_for_escalations()` and log duration to `agent_events` | The bulk UPDATE is no longer a free background job. |
| Darwin-drain cadence change | Switches from monthly to weekly+ | Schedule decision | Forward-looking trigger: cross 1M within 4 weeks of the change. |

**Monitoring scaffold to put in place now (before the trigger fires):**
1. Add a daily pg_cron job that inserts a row into a small
   `reliability_metrics` table with `count(*)`,
   `pg_total_relation_size`, and the top 5 `pg_stat_statements` rows
   for `agent_messages`. The job is ~20 LOC and gives you the trend
   line so you don't get surprised.
2. Make sure `pg_stat_statements` is enabled on the production
   Supabase instance (it usually is).
3. Add an alert (Plausible / Sentry / cron-mailto) when any tripwire
   crosses 80% of its threshold.

---

## 7. Implementation sketch (recommended approach)

When the tripwire fires, the work is mechanical. Here's the rough
shape so future-you doesn't have to redesign it.

### 7.1 Migration SQL skeleton

```sql
-- Migration: agent_messages_partitioned.sql
BEGIN;

-- Step 1: rename the existing table out of the way.
ALTER TABLE agent_messages RENAME TO agent_messages_legacy;
ALTER INDEX agent_messages_recipient_state_idx
    RENAME TO agent_messages_legacy_recipient_state_idx;
ALTER INDEX agent_messages_correlation_idx
    RENAME TO agent_messages_legacy_correlation_idx;
ALTER INDEX agent_messages_expires_idx
    RENAME TO agent_messages_legacy_expires_idx;

-- Drop the self-FK; the gateway already enforces parent integrity in app code.
ALTER TABLE agent_messages_legacy
    DROP CONSTRAINT agent_messages_parent_message_id_fkey;

-- Step 2: create the partitioned parent.
CREATE TABLE agent_messages (
    message_id            UUID NOT NULL DEFAULT gen_random_uuid(),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sender_agent          TEXT NOT NULL,
    recipient_agent       TEXT NOT NULL,
    intent                TEXT NOT NULL CHECK (intent IN (
                            'challenge','prove','accept','reject','escalate',
                            'coverage_request','clarify')),
    state                 TEXT NOT NULL DEFAULT 'open' CHECK (state IN (
                            'open','answered','resolved','escalated','expired')),
    correlation_id        UUID NOT NULL,
    parent_message_id     UUID,                      -- FK dropped (cross-partition)
    parent_event_id       UUID,
    payload               JSONB NOT NULL DEFAULT '{}'::jsonb,
    round_number          INTEGER NOT NULL DEFAULT 1,
    expires_at            TIMESTAMPTZ,
    resolved_at           TIMESTAMPTZ,
    resolved_by_event_id  UUID,
    PRIMARY KEY (message_id, created_at)             -- partition key in PK
) PARTITION BY RANGE (created_at);

CREATE TABLE agent_messages_default PARTITION OF agent_messages DEFAULT;

-- Bootstrap current + next month partition (DO block, see agent_events template).
-- ... copy verbatim from supabase/migrations/20260417_agent_events_partitioned.sql ...

-- Step 3: re-create indexes (auto-propagate to children).
CREATE INDEX agent_messages_recipient_state_idx
    ON agent_messages (recipient_agent, state, created_at DESC);
CREATE INDEX agent_messages_correlation_idx
    ON agent_messages (correlation_id);
CREATE INDEX agent_messages_expires_idx
    ON agent_messages (expires_at)
    WHERE expires_at IS NOT NULL AND state = 'open';

-- NEW: index for the Tier-3 publish gate (this should ship today, see surprises).
CREATE INDEX agent_messages_payload_fee_verified_idx
    ON agent_messages ((payload->>'fee_verified_id'))
    WHERE intent = 'accept';

-- Step 4: re-create NOTIFY trigger.
CREATE TRIGGER agent_messages_notify_trigger
    AFTER INSERT ON agent_messages
    FOR EACH ROW EXECUTE FUNCTION agent_messages_notify();

-- Step 5: copy data. INSERT … SELECT routes each row into the right partition.
INSERT INTO agent_messages SELECT * FROM agent_messages_legacy;

-- Step 6: keep legacy table for 24h as a safety net.
COMMENT ON TABLE agent_messages_legacy IS
    'Pre-partition snapshot. Drop after 24h if production is healthy.';

-- Step 7: install maintenance function (clone from agent_events template).
CREATE OR REPLACE FUNCTION maintain_agent_messages_partitions() RETURNS VOID
LANGUAGE plpgsql AS $$
-- ... clone maintain_agent_events_partitions, change archive cutoff to 90 days ...
$$;

-- pg_cron schedule (clone the agent_events DO block).

COMMIT;
```

### 7.2 Code changes required

**None.** Every call site already uses `WHERE message_id = $1` or
`WHERE correlation_id = $1` — both work transparently across partitions
because the partition key (`created_at`) is in the PK. The NOTIFY
trigger reattaches at step 4 and behaves identically.

The one exception is the **legacy self-FK on `parent_message_id`** —
nothing in the code relies on the DB-side enforcement (the gateway is
the only writer), but a code-comment update in
`fee_crawler/agent_messaging/publisher.py` explaining the contract
shift would be tidy.

### 7.3 Rollout plan (zero-downtime)

1. Apply the migration in a maintenance window (writes blocked for the
   ~2 minutes the data copy takes at 1M rows; <30s at today's volume).
   Postgres `INSERT … SELECT` is single-threaded but cheap at this scale.
2. Verify with `scripts/verify-62b-migrations.mjs` (extend it to assert
   the partitioned parent + at least one child partition exists).
3. Run the full pytest suite — `test_agent_messaging.py` exercises every
   write path and the listener round-trip.
4. Watch `pg_stat_user_tables.n_live_tup` for `agent_messages_*` for
   24h. If healthy, `DROP TABLE agent_messages_legacy`.

### 7.4 Rollback plan

The legacy table is preserved for 24h as `agent_messages_legacy`. Roll
back by:
1. Renaming partitioned `agent_messages` → `agent_messages_failed`.
2. Renaming `agent_messages_legacy` → `agent_messages`.
3. Re-attaching the NOTIFY trigger to the legacy table.
4. Dropping the failed partitioned set after triage.

Total rollback time: <5 minutes; **no data loss** because the legacy
table was only renamed, not dropped, and writes during the migration
window were blocked by the maintenance window.

---

## Appendix A: things to do *now* even though partitioning is deferred

1. **Add the missing partial index on `payload->>'fee_verified_id'`.**
   The Tier-3 publish gate runs an EXISTS lookup with no supporting
   index. At 1M rows this becomes the bottleneck. Cost: 1 migration,
   ~5 LOC. See §3 surprise list.
2. **Add a daily reliability metric capture.** A pg_cron job that snapshots
   `count(*)`, `pg_total_relation_size('agent_messages')`, and the top
   `pg_stat_statements` entries into a new
   `reliability_metrics` table. Gives you the trend line that decides
   when the tripwire fires. Cost: ~30 LOC migration.
3. **Document the gateway-enforced parent-message contract.** When the
   self-FK is dropped at partition time, the only thing keeping
   `parent_message_id` honest will be the gateway. A code comment in
   `publisher.py` and a docstring update on the `agent_messages` table
   prevent a future "where did this orphan come from" debugging
   session.
4. **Sanity-check the Tier-3 gate's accept-message search has a
   correlation/intent filter that's tight enough to not regress under
   a future retention policy.** Currently it filters only on
   `sender_agent` + `intent='accept'` + `payload->>'fee_verified_id'`.
   If two unrelated agent runs ever target the same
   `fee_verified_id`, the gate accepts on the first match — this is a
   correctness concern independent of partitioning.

## Appendix B: file pointers

- Schema: `supabase/migrations/20260419_agent_messages.sql`
- NOTIFY trigger: `supabase/migrations/20260508_agent_messages_notify_trigger.sql`
- Tier-3 publish gate: `supabase/migrations/20260510_promote_to_tier3_tighten.sql`
- Reasoning trace view: `supabase/migrations/20260507_v_agent_reasoning_trace.sql`
- Publisher: `fee_crawler/agent_messaging/publisher.py`
- Listener: `fee_crawler/agent_messaging/listener.py`
- Escalation scanner: `fee_crawler/agent_messaging/escalation.py`
- Adversarial gate poll: `fee_crawler/agent_base/adversarial_gate.py`
- Agent-infra tools: `fee_crawler/agent_tools/tools_agent_infra.py`
- Admin console queries: `src/lib/crawler-db/agent-console.ts`
- Reference partition templates: `supabase/migrations/20260417_agent_events_partitioned.sql`,
  `supabase/migrations/20260418_agent_auth_log_partitioned.sql`
