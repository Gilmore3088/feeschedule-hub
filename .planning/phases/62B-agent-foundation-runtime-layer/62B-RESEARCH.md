# Phase 62b: Agent Foundation — Runtime Layer - Research

**Researched:** 2026-04-17
**Domain:** Python agent runtime framework · Postgres LISTEN/NOTIFY · Observability / lineage traversal · Adversarial testing harness
**Confidence:** HIGH (codebase + Supabase/asyncpg/Modal docs verified this session)

## Summary

Phase 62a left exactly the right primitives in place: every tool call auto-writes `agent_events` + `agent_auth_log` in one transaction via `fee_crawler/agent_tools/gateway.py`, context propagation is already a contextvar in `fee_crawler/agent_tools/context.py`, budget halts are already wired, and `agent_messages` / `agent_registry` / `agent_budgets` / three-tier fee tables are live in staging. 62b is therefore a pure assembly job: a `fee_crawler/agent_base/` package that wires those primitives into a subclass contract, five new migrations (shadow_outputs, canary_runs, `agent_events.status` enum widening, `agent_registry.lifecycle_state`, `lineage_graph()` + `v_agent_reasoning_trace`), the LISTEN/NOTIFY runtime, a custom `FakeAnthropicClient`, and a read-only `/admin/agents` console. **Two hard constraints drive the design:** (1) Modal Starter tier allows only 5 crons total and all 5 are taken — per-agent REVIEW cron (D-05) MUST use Supabase pg_cron + internal dispatch, not a new Modal cron slot, OR the Modal plan must be upgraded; (2) the Supavisor transaction pooler on port 6543 (how 62a's pool connects) does **not** support LISTEN/NOTIFY — the messaging runtime needs a second asyncpg connection on port 5432 session mode or a direct host connection.

**Primary recommendation:** Build the runtime in this order — (a) widen the `agent_events.status` enum and land the five new migrations first; (b) ship `AgentBase` as a thin mixin that uses `__init_subclass__` + a stable method-name allowlist; (c) wire LISTEN/NOTIFY via a dedicated session-mode connection using the `asyncpg-listen` pattern (robust reconnect); (d) add the shadow-mode branch to the existing gateway as a 3-line suppress-target-write check; (e) build `FakeAnthropicClient` as a scripted-response recorder; (f) add the `/admin/agents` 4-tab console reusing existing Radix + Sparkline primitives; (g) land `lineage_graph()` as a `jsonb_build_object` + `jsonb_agg` recursive CTE that terminates at `fees_raw.document_r2_key`. Every task that adds a new agent-events row must use one of the two new terminal statuses (`improve_rejected`, `shadow_diff`).

## User Constraints (from CONTEXT.md)

### Locked Decisions

**AgentBase framework (LOOP-01..07)**
- **D-01:** Python-only AgentBase. Hamilton stays a TS tool-caller. No TS AgentBase this phase.
- **D-02:** Subclass + override API. `class KnoxAgent(AgentBase):` overrides `run_turn()`, `review()`, `dissect()`, `understand()`, `improve()`.
- **D-03:** AgentBase auto-enters `with_agent_context()` on every public method. Parent `event_id` / `correlation_id` auto-chain.
- **D-04:** Lives at `fee_crawler/agent_base/`.

**Loop cadence + scheduling (LOOP-03)**
- **D-05:** Modal cron per agent. Each agent class declares `review_schedule = '*/15 * * * *'`.
- **D-06:** Time-based REVIEW trigger. Knox 15m, Darwin 1h, state-agents 4h, Hamilton n/a.

**Adversarial review gate (LOOP-07)**
- **D-07:** Canary-required + peer-challenge-optional. Canary is floor; peer is ceiling.
- **D-08:** Failed IMPROVE writes agent_events row `status='improve_rejected'` + queues to daily digest.

**Inter-agent messaging (COMMS-01..05)**
- **D-09:** `agent_messages` schema — wide typed + JSONB payload (already shipped in 62a migration 20260419).
- **D-10:** Per-recipient LISTEN/NOTIFY channels: `agent_msg_knox`, `agent_msg_darwin`, `agent_msg_atlas`, `agent_msg_state_<abbr>`.
- **D-11:** Escalate after 3 unresolved rounds OR 24h.
- **D-12:** `v_agent_reasoning_trace(correlation_id)` view + `get_reasoning_trace(correlation_id)` tool.

**Observability surface (OBS-01..05)**
- **D-13:** Fused `/admin/agents` console with 4 tabs (Overview, Lineage, Messages, Replay).
- **D-14:** Hierarchical tree view for lineage (Radix).
- **D-15:** 5 health metrics with tiles + sparklines (reuse `src/components/sparkline.tsx`).
- **D-16:** Read-only trace view (no re-execute).
- **D-17:** `lineage_graph(tier3_row_id)` SQL function returns JSON tree.

**Testing harness (BOOT-03)**
- **D-18:** All 4 layers ship in 62b with shadow minimal. Contract + fixture replay + canary full; shadow skeleton only.
- **D-19:** Custom `FakeAnthropicClient` at `fee_crawler/testing/fake_anthropic.py`. No VCR cassettes.
- **D-20:** Canary runner + schema in 62b; corpus itself lands in Phase 63.
- **D-21:** Shadow mode gates writes at the tool gateway. `shadow_run_id` on context → `agent_events` rows write with `is_shadow=true`; business-table writes suppressed to `shadow_outputs`.

**Bootstrap protocol (BOOT-01, BOOT-03)**
- **D-22:** `agent_registry.lifecycle_state` enum column (`q1_validation|q2_high_confidence|q3_autonomy|paused`) + `agent-graduate` CLI.
- **D-23:** Named SQL predicate per agent.
- **D-24:** Q2 = confidence<0.85 + random 5% sample.
- **D-25:** Runbook at `.planning/runbooks/agent-bootstrap.md` (new folder).

### Claude's Discretion

- Exact cron strings per agent (defaults are Claude's call during planning).
- `lineage_graph()` exact return shape (JSON tree with nested `{tier_level, row, event, children[]}` default).
- Graduation predicates per agent (illustrative Knox example only; Darwin/Atlas drafted in 63/64/65).
- Health-metric computation window (15-min rollup bucket implied by 7-day sparkline).
- `canary_runs` table shape (minimum columns specified in CONTEXT.md).
- Fake LLM response DSL (Python objects / YAML / fluent builder — Claude's call).
- Exception-digest format (markdown / JSONL / Postgres-backed inbox).

### Deferred Ideas (OUT OF SCOPE)

- TS AgentBase for Hamilton (deferred).
- Full shadow-mode orchestration (drift batches, automated reports) — Phase 65 (Atlas).
- Centralized REVIEW scheduler — Phase 65 override of D-05.
- Cross-agent handshake replay (interactive) — future UI enhancement.
- Policy-per-agent Q2 exception review — framework extensible later.
- VCR-style cassette recording — rejected in favor of D-19.
- `pg_partman` for agent_messages.
- MCP write surface.
- Franklin (5th adversarial agent) — v11.0+.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LOOP-01 | Reusable 5-step loop framework | `fee_crawler/agent_base/base.py` — `AgentBase` with `__init_subclass__` auto-wrap (§Mechanics 1) |
| LOOP-02 | LOG is automatic via framework tools | Already satisfied by 62a gateway; AgentBase only enters `with_agent_context()` (§Mechanics 1) |
| LOOP-03 | REVIEW is scheduled | Supabase pg_cron + internal dispatch (not new Modal cron slot) (§Mechanics 3, §Risks) |
| LOOP-04 | DISSECT analyzes expected vs. actual deltas | Overrideable `dissect()` hook writes agent_events action='dissect' |
| LOOP-05 | UNDERSTAND produces named lesson in knowledge table | Existing `fee_crawler/knowledge/*.md` pattern; new `agent_lessons` table scoped here |
| LOOP-06 | IMPROVE updates agent's own rules/knowledge/confidence | Writes agent_events action='improve' with before/after JSONB payload |
| LOOP-07 | Adversarial review gate | Canary runner + peer-message gate; failed IMPROVE → `improve_rejected` status (§Mechanics 7) |
| COMMS-01 | agent_messages queue + LISTEN/NOTIFY | `asyncpg-listen` library pattern on session-mode connection (§Mechanics 2) |
| COMMS-02 | Darwin-challenges-Knox handshake | 3-message sequence logged in agent_messages; all tools already in `tools_agent_infra.py` |
| COMMS-03 | Knox-challenges-Darwin handshake | Same mechanics; planner tests both directions |
| COMMS-04 | Escalation → daily digest | Cron-scheduled `exception_digest` job reads `status='improve_rejected'` + `state='escalated'` (§Mechanics 10) |
| COMMS-05 | Reasoning trace lookup | `v_agent_reasoning_trace` view + `get_reasoning_trace(correlation_id)` read tool (§Mechanics 4) |
| OBS-01 | Tier 3 → Tier 1 lineage graph queryable | `lineage_graph(tier3_row_id)` recursive CTE returns JSON tree (§Mechanics 4) |
| OBS-02 | One SQL query traces a published number | Same function; denormalized columns in `fees_published` make it single-CTE |
| OBS-03 | Admin UI traces in 3 clicks | `/admin/agents` Lineage tab + Radix Collapsible tree (§Mechanics 11) |
| OBS-04 | Replay by reasoning_hash | Read-only `/admin/agents/replay` page renders timeline (§Mechanics 11) |
| OBS-05 | 5 health metrics per agent with sparklines | `agent_health_rollup` materialized table + `/admin/agents` Overview tiles (§Mechanics 14) |
| BOOT-01 | Bootstrap Q1/Q2/Q3 protocol | `agent_registry.lifecycle_state` column + AgentBase branch on turn start (§Mechanics 8, 9) |
| BOOT-03 | Contract + fixture replay + canary + shadow tests | `fee_crawler/testing/` package (§Mechanics 12, 13, 6, 5) |

## Project Constraints (from CLAUDE.md)

- **Python 3.12** runtime (fee_crawler). **Node 20 / Next.js 16.1.6 / React 19.2.3** for UI.
- **Postgres-only** — no SQLite anywhere. All new tables go through `supabase/migrations/` with date-prefixed filenames (`YYYYMMDD_description.sql`).
- **GSD workflow enforcement active** — all edits must route through a GSD phase command.
- **pytest** for Python; **vitest** for TS/JS. New tests live in `fee_crawler/tests/` (Python) and `src/lib/**/*.test.ts` (TS).
- **Server Components by default;** `"use client"` only where interactivity is required (Cmd+K, charts, tree expand/collapse).
- **`postgres` client 3.4.8** on the Next.js side; **asyncpg** on Python side via `fee_crawler/agent_tools/pool.py`.
- **Admin design system** is locked: `geist` font, `.admin-card` class, `tabular-nums`, section headers `text-sm font-bold text-gray-800` + `bg-gray-50/80`, card labels `text-[10px] font-semibold text-gray-400 uppercase tracking-wider`, card values `text-lg font-bold tabular-nums`. `/admin/agents` MUST match.
- **Secrets via env vars only**: `ANTHROPIC_API_KEY`, `DATABASE_URL`, etc. Tests never read prod secrets (see `conftest.py` — refuses `supabase.co` / `pooler.` DSNs).
- **No `console.log` in production code;** fee_crawler uses Python `logging` module.
- **Commit style:** conventional commits (`feat`, `fix`, `docs`, `test`, `refactor`, `chore`) with type + scope.

## Standard Stack

### Core (already in project — reuse, no new installs)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| asyncpg | already installed | Async Postgres client for agent runtime | 62a's canonical Python DB layer; supports LISTEN/NOTIFY via `add_listener()` [VERIFIED: docs.magicstack.io] |
| psycopg2 | already installed | Sync Postgres client | modal_app.py + db.py sync paths |
| anthropic | 0.79+ (per `fee_crawler/requirements.txt`) | Anthropic API client | Already used across 9 call sites in fee_crawler; `response.content[].type='tool_use'` [VERIFIED: codebase grep] |
| pydantic | 2.0+ | Data validation | `fee_crawler/agent_tools/schemas/` pattern; canary-corpus fixtures + agent_messages payload intents |
| pytest + pytest-asyncio | installed | Async test framework | `conftest.py` already provides per-test Postgres schema fixture [VERIFIED: conftest.py] |
| modal | installed | Serverless scheduling | `modal_app.py` cron slots (currently 5/5 occupied — see Risks) |
| Next.js | 16.1.6 | `/admin/agents` route | App Router, Server Components; matches 12-page admin surface |
| Radix UI | 1.4.3 | Tabs + Collapsible (tree view) | Already used by command-palette; no new install [CITED: CLAUDE.md] |
| Recharts | 3.7.0 | Sparkline component already in `src/components/sparkline.tsx` (pure SVG) | No chart add-on needed for tiles |

### Supporting (consider adding)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| asyncpg-listen | 0.0.7 | Wrapper around asyncpg LISTEN/NOTIFY with automatic reconnection | If raw `add_listener()` reconnect logic proves fragile (§Mechanics 2) [CITED: anna-money/asyncpg-listen] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| pg_cron-dispatched review | Extra Modal cron slot | Starter plan capped at 5; all taken — would require Team plan ($250/mo) OR consolidate existing crons |
| asyncpg-listen wrapper | Raw `add_listener()` + custom reconnect | Raw version is ~30 LOC more + edge cases; wrapper is audited [VERIFIED: WebSearch] |
| recursive CTE for lineage | plpgsql walker function | CTE is declarative + faster; plpgsql requires looping — recursive CTE wins for 4-hop walk |
| Custom fake Anthropic | VCR cassettes or respx | D-19 locked custom; rationale = deterministic + zero external dep |

**Installation (additions only):**
```bash
# fee_crawler/requirements.txt
+ asyncpg-listen>=0.0.7  # optional — only if raw add_listener reconnect is painful
```

**Version verification:**
- `asyncpg-listen 0.0.7` — published on PyPI; active since ~2022 [CITED: github.com/anna-money/asyncpg-listen]
- `anthropic` is already at `0.79.0` (released 2026-02-07); tool_use API shape unchanged since 0.27 [CITED: github.com/anthropics/anthropic-sdk-python]

## Architecture Patterns

### Recommended Project Structure

```
fee_crawler/
├── agent_base/                        # NEW — D-04
│   ├── __init__.py
│   ├── base.py                        # AgentBase class with __init_subclass__ auto-wrap
│   ├── loop.py                        # 5 method stubs: run_turn / review / dissect / understand / improve
│   ├── adversarial_gate.py            # LOOP-07 canary + peer-message wiring
│   ├── bootstrap.py                   # D-22 Q1/Q2/Q3 branch logic (reads agent_registry.lifecycle_state)
│   └── graduate.py                    # agent-graduate CLI entry point
│
├── agent_tools/                       # EXISTING — additive edits only
│   ├── gateway.py                     # EDIT: add shadow-mode suppress check (§Mechanics 5)
│   └── context.py                     # EDIT: add shadow_run_id + is_shadow fields
│
├── agent_messaging/                   # NEW — COMMS runtime
│   ├── __init__.py
│   ├── listener.py                    # LISTEN/NOTIFY consumer on session-mode connection
│   ├── publisher.py                   # NOTIFY helper (called from agent_messages insert)
│   └── escalation.py                  # COMMS-04 3-round + 24h check, writes state='escalated'
│
├── testing/                           # NEW — D-18, BOOT-03
│   ├── __init__.py
│   ├── fake_anthropic.py              # D-19 scripted fake client
│   ├── canary_runner.py               # D-20 corpus-diff runner + report
│   ├── canary_schema.py               # D-20 pydantic schema for corpus fixtures
│   ├── contract_test_base.py          # pytest fixture + helpers for tool-call assertions
│   └── shadow_helpers.py              # shadow_run_id setter + diff report
│
├── commands/
│   └── agent_graduate.py              # CLI: python -m fee_crawler agent-graduate <name> --to q2
│
└── tests/                             # EXISTING — new tests land here
    ├── test_agent_base_auto_wrap.py   # LOOP-01..06 contract tests
    ├── test_adversarial_gate.py       # LOOP-07
    ├── test_agent_messaging.py        # COMMS-01..05
    ├── test_lineage_graph.py          # OBS-01..02
    ├── test_agent_bootstrap.py        # BOOT-01
    └── test_fake_anthropic.py         # D-19 meta-test

supabase/migrations/
├── 20260501_agent_events_status_widen.sql            # Add improve_rejected, shadow_diff to CHECK
├── 20260502_agent_registry_lifecycle_state.sql       # D-22 enum column + default
├── 20260503_agent_lessons.sql                        # LOOP-05 knowledge table
├── 20260504_shadow_outputs.sql                       # D-21 shadow_outputs table + is_shadow flag
├── 20260505_canary_runs.sql                          # D-20 table
├── 20260506_lineage_graph_function.sql               # D-17 recursive CTE function
├── 20260507_v_agent_reasoning_trace.sql              # D-12 view
├── 20260508_agent_messages_notify_trigger.sql        # D-10 AFTER INSERT → pg_notify
└── 20260509_agent_health_rollup.sql                  # OBS-05 15-min rollup table + refresh fn

src/app/admin/agents/                   # NEW — D-13
├── layout.tsx                          # 4-tab shell
├── page.tsx                            # Overview (health tiles) — default
├── overview/
│   └── tiles.tsx                       # 5-metric tiles × N agents × sparkline
├── lineage/
│   ├── page.tsx                        # search + tree
│   └── tree-view.tsx                   # Radix Collapsible
├── messages/
│   ├── page.tsx                        # handshake inbox
│   └── thread-view.tsx                 # correlation_id timeline
└── replay/
    ├── page.tsx                        # paste reasoning_hash
    └── timeline.tsx                    # read-only input→tool_use→output

.planning/runbooks/                     # NEW folder — D-25
└── agent-bootstrap.md                  # Q1/Q2/Q3 semantics + graduation SLA
```

### Pattern 1: AgentBase subclass contract

**What:** Every agent gets LOG/REVIEW/DISSECT/UNDERSTAND/IMPROVE hooks + auto-context entry for free. Subclasses override the 5 hooks.

**When to use:** Every Python agent (Knox, Darwin, Atlas, 51 state agents).

**Example:**
```python
# Source: fee_crawler/agent_base/base.py (NEW)
class AgentBase:
    agent_name: str = ""
    review_schedule: str = "0 * * * *"  # cron string; D-05
    canary_corpus_path: str | None = None  # required for IMPROVE gate

    def __init_subclass__(cls, **kw):
        super().__init_subclass__(**kw)
        # Auto-wrap every public method with _with_context.
        for name in ("run_turn", "review", "dissect", "understand", "improve"):
            if name in cls.__dict__:
                original = cls.__dict__[name]
                setattr(cls, name, cls._with_context(original, name))

    @staticmethod
    def _with_context(fn, method_name: str):
        import functools
        @functools.wraps(fn)
        async def wrapper(self, *args, **kwargs):
            from fee_crawler.agent_tools.context import with_agent_context
            # Inherits correlation_id from existing context if nested; else new.
            ctx = {
                "agent_name": self.agent_name,
                "correlation_id": None,  # with_agent_context generates UUID if None
                "parent_event_id": None,  # outer event from caller, if any
            }
            with with_agent_context(**ctx):
                return await fn(self, *args, **kwargs)
        return wrapper
```

### Pattern 2: agent_events append via gateway — no new write path

Every action an agent takes (`run_turn`, `review`, `dissect`, `understand`, `improve`) routes through an existing write-CRUD tool OR through a thin `agent_events` insert wrapper. LOOP-02 is satisfied because the gateway already writes agent_events on every tool call.

### Anti-Patterns to Avoid

- **Forgetting to call `with_agent_context` manually.** The auto-wrap in `__init_subclass__` is what makes D-03 work; if a developer adds a new public method that isn't in the allowlist, context won't set. Solution: document the allowlist in AgentBase docstring + a contract test (§Mechanics 1).
- **Using the transaction-mode pool (port 6543) for LISTEN/NOTIFY.** Supavisor transaction mode multiplexes connections across clients — LISTEN registrations don't survive. Must use session-mode (5432) or direct host connection.
- **Re-implementing the budget check in AgentBase.** Already in gateway. AgentBase only wraps context; tools handle budget.
- **Recording LLM fixtures as JSON cassettes.** D-19 rejects VCR style. Scripted Python objects return the `content=[ToolUseBlock(...)]` shape.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| LISTEN/NOTIFY reconnect loop | Custom try/except + sleep + reconnect | `asyncpg-listen` library OR well-defined asyncpg pattern (§Mechanics 2) | Library handles connection loss, server restart, and backoff; ~100 LOC saved |
| Cron scheduling of REVIEW | New Modal cron slot | Supabase **pg_cron** + `cron.schedule('review-knox', '*/15 * * * *', 'SELECT ...')` calling an internal dispatch (§Mechanics 3) | Modal Starter = 5/5 taken; pg_cron is already used for partition maintenance in 62a [VERIFIED: 20260417_agent_events_partitioned.sql] |
| Tree-view UI | New collapsible component | Existing Radix Collapsible primitives | Already used by command-palette; consistent with admin design system |
| Sparkline rendering | Chart.js / D3 import | `src/components/sparkline.tsx` (SVG, 80 lines) | Already in project; zero new dep |
| Partitioned event query | Manual partition-key filter in every query | Existing index `agent_events(agent_name, created_at DESC)` + partition pruning [VERIFIED: migration 20260417] | Planner pruning handles it automatically |
| Recursive lineage walk | plpgsql loop | Recursive CTE with `jsonb_build_object` + `jsonb_agg` (§Mechanics 4) | Declarative; one SQL statement; Postgres 15+ optimizes |
| Fake Anthropic HTTP mock | respx / VCR cassettes | D-19 `FakeAnthropicClient` — scripted Python responses | Deterministic; zero external dep; aligns with existing pytest style |
| Graduation predicate executor | Bash script with `psql` | Python entry point via `python -m fee_crawler agent-graduate` calling `asyncpg` (§Mechanics 9) | Consistent with 62a CLI surface; type-checked |

**Key insight:** 62a already built the hard parts. 62b adds coordination primitives — don't rebuild anything in `agent_tools/*`.

## Runtime State Inventory

Rename/refactor phase? **No — greenfield additive phase.** Section omitted.

## Common Pitfalls

### Pitfall 1: Modal Starter plan 5-cron cap silently blocking D-05

**What goes wrong:** D-05 says "a Modal function per agent runs on that schedule and calls `agent.review()`." But Modal Starter ($0) allows **5 deployed crons**, and `modal_app.py` already uses all 5 slots (`run_discovery`, `run_pdf_extraction`, `run_browser_extraction`, `run_post_processing`, `ingest_data`). Knox + Darwin + 51 state agents = 53 new crons needed. Adding one `@modal.function(schedule=modal.Cron(...))` per agent will fail at deploy time with "cron limit exceeded" [VERIFIED: modal.com/pricing states "5 deployed crons" on Starter, "Unlimited" on Team $250/mo].

**Why it happens:** D-05 assumes unlimited Modal slots. CONTEXT.md §canonical_refs references `modal_app.py` "where cron schedules register" but doesn't note the cap. ROADMAP.md Phase 62a SC documents "5-slot limit documented as resolved" — but that resolution (consolidating jobs) isn't a pattern that extends to 53 per-agent crons.

**How to avoid:** **Pivot D-05 to pg_cron + internal dispatch.** pg_cron is already installed in Supabase production (used by 62a's partition maintenance). Pattern:
```sql
-- Per-agent REVIEW schedule lives in agent_registry.review_schedule (new column)
SELECT cron.schedule('agent-review-knox', '*/15 * * * *',
  $$ INSERT INTO agent_events (agent_name, action, tool_name, entity, status)
     VALUES ('knox', 'review_tick', '_cron', '_review', 'pending') $$);
```
A single Modal function (`review_dispatcher`) runs every 5 minutes (fits inside one of the existing 5 slots — can be consolidated into `run_post_processing`) and queries `agent_events WHERE action='review_tick' AND status='pending' AND created_at > now() - interval '10 minutes'` to dispatch each agent's `review()`. Stays within Modal Starter tier. Atlas (Phase 65) can later replace this with a centralized wave scheduler without breaking the contract.

**Alternative if this pivot is unacceptable:** Plan for Modal Team plan upgrade ($250/mo) during execution of 62b.

**Warning signs:** Any task that proposes `@modal.function(schedule=...)` per agent fails deploy.

### Pitfall 2: LISTEN/NOTIFY on transaction pooler silently drops notifications

**What goes wrong:** 62a's `get_pool()` uses `statement_cache_size=0` + transaction-mode pooler (`port 6543`). Supavisor transaction mode **multiplexes connections across clients between each transaction** — LISTEN registrations are scoped to a backend session, so they don't persist [VERIFIED: Supabase docs — session mode = 5432, transaction mode = 6543; LISTEN requires session semantics].

**Why it happens:** Engineers grab `get_pool()` and call `conn.add_listener(...)` assuming it works. It won't — notifications silently fail to arrive.

**How to avoid:** Open a **dedicated second asyncpg connection** for the listener using the session-mode DSN (port 5432). Do NOT use the transaction-mode pool. Pattern shown in §Mechanics 2.

**Warning signs:** Messages appear in `agent_messages` but no agent receives the NOTIFY; unit tests pass locally but staging deployments stall.

### Pitfall 3: `parent_event_id` FK is logical, not DB-enforced — causality chains can break silently

**What goes wrong:** 62a migration comment: *"parent_event_id -> event_id is a cross-partition logical FK (enforced by gateway, not DB)."* Because agent_events is monthly-partitioned, a real FK across partitions isn't supported in Postgres.

**Why it happens:** If AgentBase sets `parent_event_id` from a context value that's already been archived (18-month retention → detached partition), the chain breaks silently.

**How to avoid:** `lineage_graph()` must tolerate missing parents gracefully (terminate the walk at NULL or missing row, not error). Write a contract test that archives a partition + walks a now-broken chain; the function should return a partial tree with `{broken: true, reason: 'parent archived'}` at the terminal node.

### Pitfall 4: NOTIFY payload > 8000 bytes drops the notification

**What goes wrong:** Postgres NOTIFY payload is capped at **8000 bytes** — not configurable [VERIFIED: postgresql.org/docs/current/sql-notify.html; GitHub issue graphprotocol/graph-node #768]. An agent_messages row with a large `payload` JSONB field could trip this if the sender NOTIFYs with the raw payload.

**How to avoid:** **NOTIFY only the `message_id` UUID** (36 bytes), never the payload. Listener does `SELECT * FROM agent_messages WHERE message_id = $1` after receiving NOTIFY. Pattern:
```sql
-- supabase/migrations/20260508_agent_messages_notify_trigger.sql
CREATE OR REPLACE FUNCTION agent_messages_notify() RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify(
    'agent_msg_' || NEW.recipient_agent,
    NEW.message_id::text           -- 36 bytes, well under 8000
  );
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE TRIGGER agent_messages_notify_trigger
  AFTER INSERT ON agent_messages
  FOR EACH ROW EXECUTE FUNCTION agent_messages_notify();
```

### Pitfall 5: Shadow-mode leaks into business tables

**What goes wrong:** D-21 says "business-table writes are suppressed and instead write to `shadow_outputs`." The gateway (`with_agent_tool`) yields the connection to the caller; the **caller** does the target write (`INSERT INTO fees_raw ...`). If the caller doesn't check `shadow_run_id`, the write lands in the real table.

**How to avoid:** The shadow-mode branch MUST live in the **gateway** (not per-tool), gating the `yield` statement. Implementation in §Mechanics 5.

### Pitfall 6: Graduation predicate SQL injection via agent_name

**What goes wrong:** D-23 puts per-agent predicates in code. If `agent-graduate` CLI takes `--name` and interpolates into the predicate string, user-provided agent names could inject SQL.

**How to avoid:** Predicates are **fixed strings per class** (not built from user input). `agent-graduate` looks up the predicate by known agent_name, runs it with `await conn.fetchval(predicate)` — no interpolation.

### Pitfall 7: Canary baseline drift

**What goes wrong:** LOOP-07 says "zero regression on coverage / confidence / extraction count." Comparing a new run against what baseline? If baseline = last run, drift is a treadmill (each run slightly lower than previous, all passing individually).

**How to avoid:** Baseline is stored **per canary corpus version** — the first canary run against corpus v1 creates a frozen golden snapshot (written to `canary_runs` with `is_baseline=true`). All subsequent runs compare to that frozen baseline. New corpus version (v2) = new baseline. Coverage/confidence/count_delta must be ≥0 against the frozen baseline.

## Code Examples

### lineage_graph() function — recursive CTE

```sql
-- Source: supabase/migrations/20260506_lineage_graph_function.sql (NEW)
-- Given a fees_published row, return the full Tier 3 → Tier 2 → Tier 1 → crawl → R2 chain
-- as a nested JSON tree, walking agent_events via parent_event_id where available.

CREATE OR REPLACE FUNCTION lineage_graph(p_fee_published_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql STABLE AS $$
DECLARE
    v_published     fees_published%ROWTYPE;
    v_verified      fees_verified%ROWTYPE;
    v_raw           fees_raw%ROWTYPE;
    v_event_chain   JSONB;
BEGIN
    SELECT * INTO v_published FROM fees_published WHERE fee_published_id = p_fee_published_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'fee_published_id not found');
    END IF;

    SELECT * INTO v_verified FROM fees_verified WHERE fee_verified_id = v_published.lineage_ref;
    SELECT * INTO v_raw FROM fees_raw WHERE fee_raw_id = v_verified.fee_raw_id;

    -- Walk agent_events chain from Knox extract event upward, up to 10 hops.
    WITH RECURSIVE chain AS (
        SELECT event_id, parent_event_id, agent_name, action, tool_name, created_at, 0 AS depth
          FROM agent_events
         WHERE event_id = v_raw.agent_event_id

        UNION ALL

        SELECT e.event_id, e.parent_event_id, e.agent_name, e.action, e.tool_name, e.created_at, c.depth + 1
          FROM agent_events e
          JOIN chain c ON e.event_id = c.parent_event_id
         WHERE c.depth < 10
    )
    SELECT jsonb_agg(
        jsonb_build_object(
            'event_id', event_id,
            'agent_name', agent_name,
            'action', action,
            'tool_name', tool_name,
            'created_at', created_at,
            'depth', depth
        ) ORDER BY depth
    ) INTO v_event_chain FROM chain;

    RETURN jsonb_build_object(
        'tier_3', jsonb_build_object(
            'level', 3,
            'row', to_jsonb(v_published),
            'children', jsonb_build_array(
                jsonb_build_object(
                    'tier_2', jsonb_build_object(
                        'level', 2,
                        'row', to_jsonb(v_verified),
                        'children', jsonb_build_array(
                            jsonb_build_object(
                                'tier_1', jsonb_build_object(
                                    'level', 1,
                                    'row', to_jsonb(v_raw),
                                    'r2_key', v_raw.document_r2_key,
                                    'source_url', v_raw.source_url,
                                    'event_chain', COALESCE(v_event_chain, '[]'::jsonb)
                                )
                            )
                        )
                    )
                )
            )
        )
    );
END; $$;

COMMENT ON FUNCTION lineage_graph(BIGINT) IS
'Phase 62b OBS-01/02: returns full Tier 3 → Tier 2 → Tier 1 lineage + agent_events chain as JSON tree. Walks parent_event_id up to 10 hops (archived parents terminate silently).';
```

### AgentBase auto-wrap + IMPROVE gate

```python
# Source: fee_crawler/agent_base/base.py (NEW)
from __future__ import annotations
import functools
from typing import Optional
from fee_crawler.agent_tools.context import with_agent_context

AUTO_WRAP_METHODS = ("run_turn", "review", "dissect", "understand", "improve")


class AgentBase:
    """Base class. Subclasses override run_turn/review/dissect/understand/improve.

    `__init_subclass__` auto-wraps every method in AUTO_WRAP_METHODS so developers
    never touch contextvars directly (D-03). Every public method call sets up
    with_agent_context() with the subclass's agent_name + a correlation_id that
    either inherits from an outer context or is freshly generated.
    """

    agent_name: str = ""
    review_schedule: str = "0 * * * *"       # D-05 cron string
    canary_corpus_path: Optional[str] = None  # Required for IMPROVE gate (LOOP-07)

    def __init_subclass__(cls, **kw):
        super().__init_subclass__(**kw)
        if not cls.agent_name:
            raise TypeError(f"{cls.__name__} must set agent_name")
        for method in AUTO_WRAP_METHODS:
            if method in cls.__dict__:
                setattr(cls, method, cls._wrap_with_context(cls.__dict__[method]))

    @staticmethod
    def _wrap_with_context(fn):
        @functools.wraps(fn)
        async def wrapped(self, *args, **kwargs):
            # Re-entrant: if context already set (nested call), inherit correlation_id.
            with with_agent_context(agent_name=self.agent_name):
                return await fn(self, *args, **kwargs)
        return wrapped

    # --- Override points ---
    async def run_turn(self, *args, **kw): raise NotImplementedError
    async def review(self):                raise NotImplementedError
    async def dissect(self, events):       raise NotImplementedError
    async def understand(self, patterns):  raise NotImplementedError
    async def improve(self, lesson):
        from fee_crawler.agent_base.adversarial_gate import canary_regression
        # D-07: canary-required floor
        if self.canary_corpus_path is None:
            await self._queue_improve_rejected(lesson, reason="no_canary_corpus")
            return
        verdict = await canary_regression(self.agent_name, self.canary_corpus_path, lesson)
        if not verdict.passed:
            await self._queue_improve_rejected(lesson, reason="canary_regression", verdict=verdict)
            return
        # D-07 ceiling: peer challenge if lesson touches adjacent domain
        # ... (handshake logic; details in §Mechanics 7)
        await self._commit_improve(lesson)

    async def _queue_improve_rejected(self, lesson, *, reason: str, verdict=None):
        """D-08: failed IMPROVE writes agent_events status='improve_rejected'."""
        from fee_crawler.agent_tools.pool import get_pool
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """INSERT INTO agent_events
                     (agent_name, action, tool_name, entity, status, input_payload)
                   VALUES ($1, 'improve', '_agent_base', '_improve', 'improve_rejected', $2::JSONB)""",
                self.agent_name,
                json.dumps({"lesson": lesson, "reason": reason, "verdict": verdict and verdict._asdict()}),
            )
```

### FakeAnthropicClient

```python
# Source: fee_crawler/testing/fake_anthropic.py (NEW)
"""Deterministic fake for anthropic.Anthropic() in tests.

Usage:
    client = FakeAnthropicClient(scripted=[
        FakeResponse(stop_reason='tool_use', content=[
            ToolUseBlock(type='tool_use', name='extract_fees', input={...}),
        ]),
        FakeResponse(stop_reason='end_turn', content=[
            TextBlock(type='text', text='Done.'),
        ]),
    ])
    agent.client = client  # injected
    await agent.run_turn(...)
    # Inspect:
    assert client.recorded_calls[0].messages[-1]['content'] == "..."
    assert [c.tool_name for c in client.tool_calls] == ['extract_fees']
"""
from dataclasses import dataclass, field
from typing import Any


@dataclass
class ToolUseBlock:
    type: str = "tool_use"
    name: str = ""
    input: dict = field(default_factory=dict)
    id: str = "toolu_fake"


@dataclass
class TextBlock:
    type: str = "text"
    text: str = ""


@dataclass
class FakeResponse:
    stop_reason: str = "end_turn"   # 'end_turn' | 'tool_use' | 'max_tokens'
    content: list = field(default_factory=list)
    usage: dict = field(default_factory=lambda: {"input_tokens": 0, "output_tokens": 0})


@dataclass
class RecordedCall:
    model: str
    messages: list[dict]
    tools: list[dict] | None = None
    system: str | None = None


class FakeAnthropicClient:
    def __init__(self, scripted: list[FakeResponse]):
        self._scripted = list(scripted)  # drained FIFO
        self.recorded_calls: list[RecordedCall] = []

    class _Messages:
        def __init__(self, outer):
            self._outer = outer
        async def create(self, **kw):
            call = RecordedCall(model=kw.get('model', ''), messages=kw.get('messages', []),
                                tools=kw.get('tools'), system=kw.get('system'))
            self._outer.recorded_calls.append(call)
            if not self._outer._scripted:
                raise RuntimeError("FakeAnthropicClient ran out of scripted responses")
            return self._outer._scripted.pop(0)

    @property
    def messages(self):
        return FakeAnthropicClient._Messages(self)

    @property
    def tool_calls(self):
        return [b for call in self.recorded_calls for msg in call.messages
                for b in (msg.get('content') or []) if isinstance(b, dict) and b.get('type') == 'tool_use']
```

### Shadow-mode gateway branch

```python
# Source: fee_crawler/agent_tools/gateway.py (EDIT — add ~10 lines, existing flow preserved)
# ... existing imports + _truncate_payload + _snapshot_row ...

@asynccontextmanager
async def with_agent_tool(..., is_business_table: bool = True):  # NEW kwarg
    ctx = get_agent_context()
    shadow_run_id = ctx.get("shadow_run_id")  # NEW

    # ... existing validation + pending event insert ...

    async with pool.acquire() as conn:
        async with conn.transaction():
            # ... existing agent_events INSERT ...
            # ... existing before_value snapshot ...

            # NEW: shadow-mode branch — route business-table writes to shadow_outputs
            if shadow_run_id and is_business_table:
                # Caller still yields (conn, event_id) to do a "write" but we intercept:
                # a context-local dict catches the intended payload; after yield, we
                # insert into shadow_outputs instead of committing to the target table.
                yield conn, str(event_id)
                # Caller will have written to the target table — but we ROLLBACK just that
                # portion via a savepoint. Simpler: caller passes a shadow-aware write helper.
                # CLEANEST: new parameter `shadow_target_payload` — see Mechanics 5 for alternatives.

            else:
                yield conn, str(event_id)

            # ... existing after_value snapshot + agent_auth_log insert ...
            # NEW: if shadow_run_id, also UPDATE agent_events SET is_shadow=true, status='shadow_diff'.
```
(Exact shape discussed in §Mechanics 5 — uses a single `_should_suppress_business_write()` helper rather than a branching yield.)

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Custom LISTEN/NOTIFY reconnect loops | `asyncpg-listen` library with ListenPolicy | ~2022 release of wrapper | ~100 LOC saved; battle-tested reconnect |
| `pg_notify` payload with whole row as JSON | NOTIFY message_id only; listener SELECTs | Always — 8000-byte cap is ancient | Avoids payload truncation |
| `__metaclass__` for auto-decorating methods | `__init_subclass__` (PEP 487) | Python 3.6+ | Simpler; no magic metaclass |
| Modal cron per agent | pg_cron + internal dispatcher | Forced by Starter tier 5-cron cap | Stays free-tier |
| VCR cassettes for LLM tests | Scripted fake client | Anthropic SDK v0.27 made response shapes clean | Deterministic, faster tests |

**Deprecated/outdated:**
- **Supavisor session mode on port 6543** — deprecated by Supabase as of early 2025; use 5432 for session mode [VERIFIED: github.com/orgs/supabase/discussions/32755]
- **Metaclass-based method wrapping** — PEP 487 obsoleted it for most cases

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | pg_cron + internal dispatch can replace Modal cron per agent without losing D-05 semantics | §Mechanics 3, Pitfall 1 | If pg_cron latency is unacceptable (> 60s jitter), REVIEW SC1 bar ("within 15 min") still passes by ~14× margin, but observability suffers |
| A2 | Session-mode connection on port 5432 works from Modal containers | §Mechanics 2 | If Modal networking blocks port 5432 (unlikely — it works today for migrations), listener would fail |
| A3 | Recursive CTE on agent_events across monthly partitions stays sub-second at 10M rows | §Mechanics 4 | If cross-partition scan dominates, fall back to a materialized path column or limit depth to 5 hops |
| A4 | 8000-byte NOTIFY cap is immutable in Supabase Postgres | Pitfall 4 | Can be raised by recompiling Postgres — not available on managed Supabase |
| A5 | Modal container Python process can hold a long-running asyncpg connection for 24h+ without termination | §Mechanics 2 | Modal functions have `timeout` parameter; listener needs a re-entry pattern (covered in §Risks) |
| A6 | `FakeAnthropicClient` duck-types existing `anthropic.Anthropic()` call sites without SDK-version breakage | §Mechanics 6 | If anthropic SDK changes response shape, fake needs updating; pinned version in requirements.txt would help |

## Open Questions

1. **Does pg_cron have sufficient precision for 15-minute Knox REVIEW?**
   - What we know: pg_cron supports second-level schedules (per Supabase docs) and 15m is trivially supported.
   - What's unclear: whether dispatcher latency (pg_cron fires → Modal picks up the `review_tick` agent_events row → actually runs `review()`) stays under SC1's 15-min bar.
   - Recommendation: measure during 62b Plan 05 (messaging runtime) smoke test; budget ≤ 60s dispatcher pickup latency against a 15-min cron = 96% of window.

2. **Should `agent_health_rollup` be a materialized view (refreshed on cron) or a plain table (updated incrementally by a trigger)?**
   - What we know: D-15 wants 7-day sparklines; 15-min buckets × 7 days × 55 agents × 5 metrics = ~330K rows (manageable either way).
   - What's unclear: tradeoff between refresh-staleness and write-overhead.
   - Recommendation: plain table refreshed by a pg_cron job every 15 minutes. Simpler than materialized view refresh semantics; no `REFRESH MATERIALIZED VIEW CONCURRENTLY` dance.

3. **Does the daily exception digest (COMMS-04) need an admin UI or is it just an email/markdown file?**
   - What we know: D-25 mentions "48-hour SLA for review." Existing admin surface has `/admin/leads`, `/admin/review`. No inbox pattern yet.
   - What's unclear: whether James wants digest delivered as markdown/JSONL/email or a new admin page.
   - Recommendation: Phase 62b ships JSONL written to `agent_events status='improve_rejected' + agent_messages state='escalated'` as the queryable source of truth. `/admin/agents` Messages tab already renders escalated threads. Daily email or external delivery is Claude's discretion → defer to Phase 65 (Atlas).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Python 3.12 | All agent code | ✓ | 3.12 | — |
| asyncpg | messaging runtime + AgentBase | ✓ | already installed | — |
| asyncpg-listen | LISTEN/NOTIFY reconnect wrapper | ✗ | — | Raw `add_listener()` + custom reconnect (covered in §Mechanics 2) |
| Postgres 15+ with pg_cron extension | REVIEW scheduling | ✓ | Supabase production has pg_cron 1.6.4 [VERIFIED: WebSearch + 62a migration] | pg_cron absent = schedule from Modal (but cron cap applies) |
| Postgres session-mode pooler (port 5432) | LISTEN/NOTIFY connection | ✓ | Supabase's default 5432 endpoint | Direct host connection (less ideal — bypasses pooler) |
| Next.js 16.1.6 + Radix UI | /admin/agents console | ✓ | already installed | — |
| Modal | Review dispatcher (1 existing slot repurposed) | ✓ | Starter plan | — |
| anthropic Python SDK | FakeAnthropicClient duck-types it | ✓ | 0.79.0 already in requirements.txt [VERIFIED: requirements.txt grep] | — |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** `asyncpg-listen` — optional wrapper; raw asyncpg works too.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest 8.3 + pytest-asyncio (Python); vitest (TS — /admin/agents client components) |
| Config file | `pyproject.toml` + `fee_crawler/tests/conftest.py`; `vitest.config.ts` |
| Quick run command | `pytest fee_crawler/tests/test_agent_base*.py fee_crawler/tests/test_adversarial_gate.py fee_crawler/tests/test_agent_messaging.py -x` |
| Full suite command | `pytest fee_crawler/tests/ -x --ignore=fee_crawler/tests/e2e && npx vitest run src/app/admin/agents/` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LOOP-01 | AgentBase subclass receives LOG/REVIEW/DISSECT/UNDERSTAND/IMPROVE hooks | unit (contract) | `pytest fee_crawler/tests/test_agent_base_auto_wrap.py::test_subclass_gets_hooks -x` | ❌ Wave 0 |
| LOOP-02 | Tool call auto-writes agent_events (already from 62a) | integration | `pytest fee_crawler/tests/test_agent_gateway.py -x` | ✅ (62a) |
| LOOP-03 | Unreviewed events discovered within 15 min of landing | integration (pg_cron clock-fast-forward) | `pytest fee_crawler/tests/test_agent_base_auto_wrap.py::test_review_latency -x` | ❌ Wave 0 |
| LOOP-04 | DISSECT writes agent_events action='dissect' with delta payload | unit | `pytest fee_crawler/tests/test_agent_base_auto_wrap.py::test_dissect_writes_event -x` | ❌ Wave 0 |
| LOOP-05 | UNDERSTAND writes to agent_lessons | unit | `pytest fee_crawler/tests/test_agent_base_auto_wrap.py::test_understand_writes_lesson -x` | ❌ Wave 0 |
| LOOP-06 | IMPROVE captures before/after in agent_events | unit | `pytest fee_crawler/tests/test_agent_base_auto_wrap.py::test_improve_before_after -x` | ❌ Wave 0 |
| LOOP-07 | Canary regression gate — failed IMPROVE writes improve_rejected | integration | `pytest fee_crawler/tests/test_adversarial_gate.py -x` | ❌ Wave 0 |
| COMMS-01 | agent_messages insert + NOTIFY fires + listener picks up | integration (real Postgres) | `pytest fee_crawler/tests/test_agent_messaging.py::test_listen_notify_roundtrip -x` | ❌ Wave 0 |
| COMMS-02 | Darwin challenges Knox — 3-message sequence resolves | integration | `pytest fee_crawler/tests/test_agent_messaging.py::test_darwin_knox_handshake -x` | ❌ Wave 0 |
| COMMS-03 | Knox challenges Darwin — reverse direction | integration | `pytest fee_crawler/tests/test_agent_messaging.py::test_knox_darwin_handshake -x` | ❌ Wave 0 |
| COMMS-04 | Escalation after 3 rounds OR 24h | integration (time-travel with SQL `SET LOCAL`) | `pytest fee_crawler/tests/test_agent_messaging.py::test_escalation_three_rounds -x` | ❌ Wave 0 |
| COMMS-05 | `get_reasoning_trace(correlation_id)` returns timeline | integration | `pytest fee_crawler/tests/test_agent_messaging.py::test_reasoning_trace_tool -x` | ❌ Wave 0 |
| OBS-01 | Tier 3 → Tier 1 lineage chain queryable | integration | `pytest fee_crawler/tests/test_lineage_graph.py::test_lineage_chain_queryable -x` | ❌ Wave 0 |
| OBS-02 | One SQL query returns full trace | integration | `pytest fee_crawler/tests/test_lineage_graph.py::test_single_query_full_trace -x` | ❌ Wave 0 |
| OBS-03 | Admin UI traces in 3 clicks | manual-only | UAT / Playwright if added | manual |
| OBS-04 | Replay by reasoning_hash | unit + integration | `pytest fee_crawler/tests/test_agent_messaging.py::test_replay_by_hash -x` + `vitest src/app/admin/agents/replay/` | ❌ Wave 0 |
| OBS-05 | 5 health metrics with sparkline data | integration | `pytest fee_crawler/tests/test_agent_health_rollup.py -x` | ❌ Wave 0 |
| BOOT-01 | Q1/Q2/Q3 graduation executable + named predicate | integration | `pytest fee_crawler/tests/test_agent_bootstrap.py::test_graduate_q1_to_q2 -x` | ❌ Wave 0 |
| BOOT-03 | Contract + fixture + canary + shadow tests ship | smoke (meta) | `pytest fee_crawler/tests/test_fake_anthropic.py fee_crawler/tests/test_canary_runner.py fee_crawler/tests/test_shadow_helpers.py -x` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pytest fee_crawler/tests/test_agent_base_auto_wrap.py test_adversarial_gate.py test_agent_messaging.py test_lineage_graph.py test_agent_bootstrap.py -x`
- **Per wave merge:** `pytest fee_crawler/tests/ -x --ignore=fee_crawler/tests/e2e && npx vitest run` + `bash scripts/ci-guards.sh sqlite-kill` (preserve 62a invariants)
- **Phase gate:** full suite green + the 4 human verification items from 62A still pass (staging smoke click-through)

### Wave 0 Gaps
- [ ] `fee_crawler/tests/test_agent_base_auto_wrap.py` — covers LOOP-01, 03, 04, 05, 06
- [ ] `fee_crawler/tests/test_adversarial_gate.py` — covers LOOP-07
- [ ] `fee_crawler/tests/test_agent_messaging.py` — covers COMMS-01..05 and OBS-04
- [ ] `fee_crawler/tests/test_lineage_graph.py` — covers OBS-01, 02
- [ ] `fee_crawler/tests/test_agent_health_rollup.py` — covers OBS-05
- [ ] `fee_crawler/tests/test_agent_bootstrap.py` — covers BOOT-01
- [ ] `fee_crawler/tests/test_fake_anthropic.py` — meta-test for D-19 fake
- [ ] `fee_crawler/tests/test_canary_runner.py` — meta-test for D-20 runner
- [ ] `fee_crawler/tests/test_shadow_helpers.py` — meta-test for D-21 helpers
- [ ] `src/app/admin/agents/overview/__tests__/tiles.test.tsx` — sparkline render + metric tile
- [ ] `src/app/admin/agents/lineage/__tests__/tree-view.test.tsx` — Radix Collapsible tree
- [ ] No new framework install needed; asyncpg-listen is OPTIONAL (researcher's call — raw asyncpg works)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | partial | Agent identity via `x-agent-name` header (62a D-06); SEC-04 hardens in Phase 68 |
| V3 Session Management | no | Agents are service-role; no user sessions |
| V4 Access Control | yes | `promote_to_tier3` RAISE EXCEPTION enforcement tightened this phase (replace RAISE NOTICE with real handshake check) |
| V5 Input Validation | yes | Pydantic schemas for agent_messages payload + canary corpus fixtures; asyncpg parameterized queries everywhere |
| V6 Cryptography | no | No new crypto; reasoning_hash (sha256) is existing pattern; no password handling |
| V7 Error Handling & Logging | yes | agent_events captures all errors; `improve_rejected` + `shadow_diff` statuses surface anomalies to digest |
| V12 File Handling | no | No new file uploads; R2 is read-side only this phase |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SQL injection in graduation predicate CLI | Tampering | Predicates are fixed strings per known agent_name — no user-input interpolation (Pitfall 6) |
| NOTIFY payload truncation → missed messages | Repudiation | NOTIFY only sends message_id UUID (36 bytes); listener SELECTs full row (Pitfall 4) |
| Shadow-mode leak into business table | Tampering | Gateway-level suppression, not per-tool; contract test required (Pitfall 5) |
| Failed IMPROVE silently applied | Repudiation | `improve_rejected` status + digest queue (D-08); no silent drops |
| Cross-agent message spoofing | Spoofing | `sender_agent` derived from `agent_name` header in gateway; not user-settable on the tool |
| Replay-based auth bypass | Spoofing | No replay execution — D-16 is read-only view; "replay" = render timeline, not re-run |

## Sources

### Primary (HIGH confidence)
- `.planning/phases/62B-agent-foundation-runtime-layer/62B-CONTEXT.md` — 25 locked decisions
- `.planning/phases/62A-agent-foundation-data-layer/62A-CONTEXT.md` — prior phase decisions
- `.planning/phases/62A-agent-foundation-data-layer/62A-VERIFICATION.md` — 11/11 REQ-IDs satisfied; staging live
- `.planning/REQUIREMENTS.md` §LOOP-01..07, COMMS-01..05, OBS-01..05, BOOT-01, BOOT-03
- `fee_crawler/agent_tools/gateway.py` — with_agent_tool context manager (62a)
- `fee_crawler/agent_tools/context.py` — with_agent_context contextvar (62a)
- `fee_crawler/agent_tools/budget.py` — budget_halt mechanics (62a)
- `fee_crawler/modal_app.py` — 5 cron slots used
- `supabase/migrations/20260417_agent_events_partitioned.sql` — `status` CHECK enum
- `supabase/migrations/20260419_agent_messages.sql` — already has `state` + `round_number` + indexes
- `supabase/migrations/20260420_fees_tier_tables.sql` — lineage columns denormalized
- `supabase/migrations/20260421_tier_promotion_functions.sql` — `promote_to_tier3` stub needing tightening
- `supabase/migrations/20260422_agent_registry_and_budgets.sql` — no `lifecycle_state` column yet
- `fee_crawler/tests/conftest.py` — per-test Postgres schema fixture
- `src/components/sparkline.tsx` — 80-LOC SVG sparkline, reusable
- `src/app/admin/admin-nav.tsx` — AdminNav structure to extend

### Secondary (MEDIUM confidence)
- Modal pricing — 5 crons Starter / unlimited Team [WebFetch: modal.com/pricing]
- asyncpg LISTEN/NOTIFY behavior on connection loss [WebFetch: magicstack.github.io/asyncpg]
- Supavisor session mode port 5432 vs. transaction mode 6543 [WebSearch: Supabase docs]
- pg_cron on Supabase [WebSearch: supabase.com/docs/guides/database/extensions/pg_cron]
- Postgres NOTIFY 8000-byte limit [WebSearch: postgresql.org/docs/current/sql-notify.html + multiple GitHub issues]
- `__init_subclass__` PEP 487 [WebSearch: peps.python.org/pep-0487]
- `asyncpg-listen` wrapper library [WebFetch: github.com/anna-money/asyncpg-listen]

### Tertiary (LOW confidence)
- Modal container long-running connection stability over 24h+ [ASSUMED — A5]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in project, versions verified from requirements.txt + CLAUDE.md
- Architecture: HIGH — 62a primitives well-documented; 62b is pure assembly with clear patterns
- Pitfalls: HIGH — Modal 5-cron cap verified, Supavisor LISTEN incompatibility verified, NOTIFY 8000-byte verified

**Research date:** 2026-04-17
**Valid until:** 2026-05-17 (30 days — project is stable; asyncpg/Modal/Supabase APIs rarely shift within that window)

---

## Mechanics

### 1. Python AgentBase auto-context pattern

**Decision:** Use `__init_subclass__` with a **stable method-name allowlist** (`AUTO_WRAP_METHODS = ("run_turn", "review", "dissect", "understand", "improve")`). NOT a metaclass (PEP 487 deprecates metaclasses for this purpose [CITED: peps.python.org/pep-0487]).

**Why not a metaclass:** Clutters inheritance chain, surprises type-checkers, harder to debug. `__init_subclass__` is 10 lines and explicit about what it touches.

**Why not a class decorator:** Requires the subclass author to remember to decorate — defeats D-03's "developers never touch contextvars directly."

**Why an allowlist, not "wrap everything":** Agents will add private helpers (`_snapshot_last_run_events()`, etc.). Wrapping private methods corrupts contextvar state across nested calls. Public 5-method contract is small and stable; new methods must be added explicitly.

**Context inheritance:** The existing `with_agent_context()` always resets on exit (contextvar token) — nested calls layer correctly; parent event_id auto-chains because the gateway already reads `ctx.get("parent_event_id")`.

**Correlation_id auto-chain logic:**
- If an outer `with_agent_context` is already active (parent agent called this one), inherit correlation_id.
- Else, generate fresh UUID.
- Pattern: `with_agent_context(agent_name=self.agent_name, correlation_id=ctx.get('correlation_id'))`.

**Contract test:**
```python
# fee_crawler/tests/test_agent_base_auto_wrap.py
@pytest.mark.asyncio
async def test_subclass_methods_are_context_wrapped():
    class K(AgentBase):
        agent_name = "knox"
        seen_ctx: dict = {}
        async def run_turn(self):
            from fee_crawler.agent_tools.context import get_agent_context
            K.seen_ctx.update(get_agent_context())
    k = K()
    await k.run_turn()
    assert K.seen_ctx["agent_name"] == "knox"
    assert K.seen_ctx["correlation_id"] is not None
```

### 2. Postgres LISTEN/NOTIFY in asyncpg from Modal

**Pattern (with raw asyncpg — prefer):**
```python
# Source: fee_crawler/agent_messaging/listener.py (NEW)
import asyncio, os
import asyncpg

async def run_listener(agent_name: str, handler):
    """Long-running LISTEN on agent_msg_<agent_name> channel.

    Uses session-mode DSN (port 5432). Raw add_listener with reconnect loop.
    """
    dsn = os.environ["DATABASE_URL_SESSION"]  # NEW env — points at port 5432, not pooler
    channel = f"agent_msg_{agent_name}"

    while True:
        try:
            conn = await asyncpg.connect(dsn, statement_cache_size=0)
            try:
                await conn.add_listener(channel, _wrap(handler))
                # Keep the connection alive. asyncpg delivers via the callback;
                # we just need to prevent the coroutine from exiting.
                while not conn.is_closed():
                    await asyncio.sleep(30)
                    try:
                        # Cheap roundtrip keeps TCP alive + detects dead server.
                        await conn.fetchval("SELECT 1", timeout=5)
                    except Exception:
                        break
            finally:
                try:
                    await conn.close(timeout=5)
                except Exception:
                    pass
        except Exception as e:
            # log + backoff
            await asyncio.sleep(5)

def _wrap(handler):
    async def cb(conn, pid, channel, payload):
        # payload is message_id (36 bytes). Fetch full row in a pool connection
        # so the listener connection isn't blocked.
        try:
            await handler(message_id=payload)
        except Exception:
            import traceback; traceback.print_exc()
    return cb
```

**Alternative with `asyncpg-listen`:**
```python
# If the raw reconnect loop proves fragile, swap in asyncpg-listen
import asyncpg_listen
listener = asyncpg_listen.NotificationListener(asyncpg_listen.connect_func(dsn))
await listener.run(
    {"agent_msg_knox": handler},
    policy=asyncpg_listen.ListenPolicy.ALL,
    notification_timeout=60,
)
```

**Critical constraints:**
- MUST use session-mode DSN (port 5432), not transaction-mode (6543). Add new env var `DATABASE_URL_SESSION` alongside existing `DATABASE_URL`. [VERIFIED: Supabase docs]
- Add a new `_init_connection` callback for this connection (re-register JSONB codec) since it doesn't go through `pool.py`.
- Modal function timeout — the listener should run inside a long-lived Modal function, but Modal caps function execution time. The existing `run_post_processing` slot is nightly; consider adding a dedicated `agent_message_listener` Modal function with a large timeout (e.g., `timeout=3600` + self-restart loop). **Important:** this would need another Modal cron slot (to restart on exit) → another argument for consolidating crons first.

**Reconnect on Postgres server restart:** Well-documented gotcha [VERIFIED: github.com/MagicStack/asyncpg#421]. The loop above handles it — on dead connection, fall out of inner loop, reconnect.

### 3. Modal cron registration per agent — pivot to pg_cron

**Original D-05:** Per-agent `@modal.function(schedule=modal.Cron(agent.review_schedule))` with a Modal function per agent.

**Blocker:** Modal Starter plan = **5 deployed crons**, all 5 are occupied [VERIFIED: modal.com/pricing + modal_app.py lines 92, 104, 124, 143, 177]. Adding 53 more (Knox + Darwin + 51 state agents) requires Team plan ($250/mo).

**Pivoted pattern (recommended):** Use **pg_cron** to tick agent review events, consolidated into the existing `run_post_processing` Modal slot (or a new dedicated `agent_review_dispatcher` that replaces one existing slot).

```sql
-- supabase/migrations/20260510_agent_review_schedules.sql (NEW)
-- pg_cron-scheduled review ticks per agent.
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT agent_name, review_schedule FROM agent_registry
             WHERE review_schedule IS NOT NULL
    LOOP
        PERFORM cron.schedule(
            'agent-review-' || r.agent_name,
            r.review_schedule,
            format($cron$
                INSERT INTO agent_events (agent_name, action, tool_name, entity, status, input_payload)
                VALUES (%L, 'review_tick', '_cron', '_review', 'pending', '{}'::jsonb)
            $cron$, r.agent_name)
        );
    END LOOP;
END $$;
```

Modal-side `review_dispatcher` (one function, fires every minute) polls:
```python
# fee_crawler/modal_app.py — NEW slot (replaces one existing slot if needed)
@app.function(schedule=modal.Cron("* * * * *"), timeout=300, secrets=secrets)
async def review_dispatcher():
    # Poll agent_events for review_tick rows in the last 2 minutes.
    # For each, import the agent class and call review() once.
    ...
```

**Advantages:** Zero new Modal crons; per-agent cadence enforced in SQL (visible in `pg_cron.job` table); Atlas (Phase 65) can later rewrite `review_dispatcher` into a wave scheduler without touching any agent class.

**Add to agent_registry:** new column `review_schedule TEXT` (cron string, default `'0 * * * *'`).

### 4. lineage_graph() SQL function design

**Decision:** **Recursive CTE inside a plpgsql function** (not a pure recursive CTE view). Function wraps the CTE in JSONB building logic + handles the "missing parent" terminal case gracefully. See full SQL under "Code Examples".

**Performance on partitioned agent_events:**
- The recursive part walks `parent_event_id` — indexed via `agent_events_parent_idx` [VERIFIED: migration 20260417 line 71].
- For a typical chain (Tier 3 → Tier 2 → Tier 1 → Knox extract event → Atlas orchestration event → state-agent crawl event), depth ≤ 10 is overkill; 5 hops cover real chains.
- Each hop is a single-partition-prunable lookup because `event_id` is globally indexed within each partition. Recursive CTE can cross partitions (if parent is in prior month) — Postgres will plan-scan only the partitions containing each join probe.
- 18-month retention means archived partitions are renamed to `*_archived` and detached [VERIFIED: migration 20260417 line 104]. Walks that would cross into archived territory simply terminate (no row found).

**v_agent_reasoning_trace view:**
```sql
-- supabase/migrations/20260507_v_agent_reasoning_trace.sql (NEW)
CREATE OR REPLACE VIEW v_agent_reasoning_trace AS
SELECT
    'event' AS kind,
    e.correlation_id,
    e.created_at,
    e.agent_name,
    e.action AS intent_or_action,
    e.tool_name,
    e.entity,
    e.input_payload AS payload,
    e.event_id::TEXT AS row_id
FROM agent_events e
UNION ALL
SELECT
    'message' AS kind,
    m.correlation_id,
    m.created_at,
    m.sender_agent AS agent_name,
    m.intent AS intent_or_action,
    NULL::TEXT AS tool_name,
    m.recipient_agent AS entity,
    m.payload,
    m.message_id::TEXT AS row_id
FROM agent_messages m
ORDER BY created_at;

COMMENT ON VIEW v_agent_reasoning_trace IS
'Phase 62b COMMS-05: flat ordered timeline per correlation_id. Read-only tool get_reasoning_trace(correlation_id) queries this.';
```

### 5. Shadow-mode write gating

**Cleanest implementation:** Extend `fee_crawler/agent_tools/context.py` to carry `shadow_run_id`, then add ONE helper `_should_suppress_business_write()` in `gateway.py`. The **caller** (write-CRUD tool) checks this helper before the target write.

```python
# fee_crawler/agent_tools/context.py (EDIT)
@contextlib.contextmanager
def with_agent_context(*, agent_name, correlation_id=None, parent_event_id=None,
                       cost_cents=0, shadow_run_id=None):  # NEW
    token = _context.set({
        "agent_name": agent_name,
        "correlation_id": correlation_id or str(uuid.uuid4()),
        "parent_event_id": parent_event_id,
        "cost_cents": cost_cents,
        "shadow_run_id": shadow_run_id,  # NEW
    })
    ...

# fee_crawler/agent_tools/gateway.py (EDIT — add helper + change status on shadow)
def is_shadow_active() -> bool:
    return bool(get_agent_context().get("shadow_run_id"))

# At the end of with_agent_tool, when is_shadow_active() is true:
if is_shadow_active():
    # Redirect: instead of the target table write having happened, the tool
    # should have detected is_shadow_active() and written to shadow_outputs.
    # Mark the event as shadow_diff.
    await conn.execute(
        "UPDATE agent_events SET status='shadow_diff', output_payload = $2::JSONB "
        "WHERE event_id = $1",
        event_id, _dumps_or_none({"shadow_run_id": ctx["shadow_run_id"], ...})
    )
```

**Tool-side pattern (one-liner check):**
```python
# Example: create_fee_raw in tools_fees.py would look like
async def create_fee_raw(..., agent_name, reasoning_prompt, reasoning_output):
    async with with_agent_tool(...) as (conn, event_id):
        if is_shadow_active():
            await conn.execute(
                "INSERT INTO shadow_outputs (shadow_run_id, agent_name, entity, payload_diff) "
                "VALUES ($1::UUID, $2, 'fees_raw', $3::JSONB)",
                get_agent_context()["shadow_run_id"], agent_name,
                json.dumps(inp.model_dump())
            )
        else:
            await conn.execute("INSERT INTO fees_raw (...) VALUES (...)", ...)
```

**shadow_outputs schema:**
```sql
-- supabase/migrations/20260504_shadow_outputs.sql (NEW)
CREATE TABLE IF NOT EXISTS shadow_outputs (
    shadow_output_id  BIGSERIAL PRIMARY KEY,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    shadow_run_id     UUID NOT NULL,
    agent_name        TEXT NOT NULL REFERENCES agent_registry(agent_name),
    entity            TEXT NOT NULL,
    payload_diff      JSONB NOT NULL,
    agent_event_id    UUID
);
CREATE INDEX IF NOT EXISTS shadow_outputs_run_idx
    ON shadow_outputs (shadow_run_id, created_at DESC);
```

Also widen `agent_events.status` CHECK to include `shadow_diff`:
```sql
-- supabase/migrations/20260501_agent_events_status_widen.sql (NEW)
ALTER TABLE agent_events DROP CONSTRAINT IF EXISTS agent_events_status_check;
ALTER TABLE agent_events ADD CONSTRAINT agent_events_status_check
    CHECK (status IN ('pending','success','error','budget_halt','improve_rejected','shadow_diff'));
-- Also add is_shadow boolean for quick filtering.
ALTER TABLE agent_events ADD COLUMN IF NOT EXISTS is_shadow BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS agent_events_shadow_idx ON agent_events (is_shadow) WHERE is_shadow;
```

Contract test: a tool call inside `with_agent_context(..., shadow_run_id=UUID)` MUST leave `fees_raw` row count unchanged AND populate `shadow_outputs`.

### 6. FakeAnthropicClient design

See full code under "Code Examples." Key properties:

- Duck-types `anthropic.Anthropic()`'s `.messages.create(...)` signature (the only method any existing fee_crawler call site uses [VERIFIED: grep of 9 call sites]).
- Returns `FakeResponse` with `.stop_reason`, `.content=[ToolUseBlock|TextBlock]`, `.usage`.
- Records every call for assertion; exposes `.recorded_calls` and `.tool_calls`.
- Runs out of scripted responses → RuntimeError (fail fast, loud).
- DSL: **Python dataclasses** (not YAML — tests are in Python; indirection hurts readability; no dynamic loading needed).

**Injection pattern:** Most fee_crawler call sites do `client = anthropic.Anthropic(api_key=...)` locally. For AgentBase, define `self.client: anthropic.Anthropic | FakeAnthropicClient` as an attribute set in `__init__`; tests instantiate the agent with `client=FakeAnthropicClient(...)` kwarg.

### 7. Canary runner tolerance model

**Baseline storage:** `canary_runs` table; the first run per `corpus_version` + `agent_name` is marked `is_baseline=true`. Subsequent runs compare against that frozen baseline.

```sql
-- supabase/migrations/20260505_canary_runs.sql (NEW)
CREATE TABLE IF NOT EXISTS canary_runs (
    run_id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_name              TEXT NOT NULL REFERENCES agent_registry(agent_name),
    corpus_version          TEXT NOT NULL,
    started_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at             TIMESTAMPTZ,
    status                  TEXT NOT NULL CHECK (status IN ('running','passed','failed','error')),
    is_baseline             BOOLEAN NOT NULL DEFAULT FALSE,
    coverage                NUMERIC(5,4),
    confidence_mean         NUMERIC(5,4),
    extraction_count        INTEGER,
    coverage_delta          NUMERIC(5,4),
    confidence_delta        NUMERIC(5,4),
    extraction_count_delta  INTEGER,
    verdict                 TEXT,
    report_payload          JSONB,
    baseline_run_id         UUID REFERENCES canary_runs(run_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS canary_runs_baseline_idx
    ON canary_runs (agent_name, corpus_version) WHERE is_baseline;
```

**Pass bar:** `coverage_delta >= 0 AND confidence_delta >= 0 AND extraction_count_delta >= 0` against baseline. Zero regression. D-07 says "deterministic, CI-like bar."

**Per-metric tolerance (Claude's discretion):** Default to strict 0; Phase 63's corpus landing can tune if too flaky.

**Fixture schema (Pydantic):**
```python
# fee_crawler/testing/canary_schema.py (NEW)
from pydantic import BaseModel
class CanaryExpectation(BaseModel):
    institution_id: int
    expected_fees: list[dict]  # canonical_fee_key + amount
    min_coverage: float = 1.0
    min_confidence: float = 0.85

class CanaryCorpus(BaseModel):
    version: str
    description: str
    expectations: list[CanaryExpectation]
```

### 8. agent_registry.lifecycle_state migration

Confirmed: 62a's migration 20260422 does **not** include `lifecycle_state`. New migration needed:

```sql
-- supabase/migrations/20260502_agent_registry_lifecycle_state.sql (NEW)
ALTER TABLE agent_registry
    ADD COLUMN IF NOT EXISTS lifecycle_state TEXT NOT NULL DEFAULT 'q1_validation'
        CHECK (lifecycle_state IN ('q1_validation','q2_high_confidence','q3_autonomy','paused'));

ALTER TABLE agent_registry
    ADD COLUMN IF NOT EXISTS review_schedule TEXT;  -- D-05 cron per agent

COMMENT ON COLUMN agent_registry.lifecycle_state IS
'Phase 62b BOOT-01: AgentBase reads on turn start. Q1 = hold every output for human approval; Q2 = auto-commit confidence>=0.85 + random 5% sample to digest; Q3 = autonomy + quarterly random sampling; paused = AgentBase aborts turn immediately.';

-- Seed reasonable defaults per agent (all start Q1).
UPDATE agent_registry SET lifecycle_state = 'q1_validation' WHERE lifecycle_state IS NULL;
-- Seed review_schedule per role.
UPDATE agent_registry SET review_schedule = '*/15 * * * *' WHERE agent_name = 'knox';
UPDATE agent_registry SET review_schedule = '0 * * * *'    WHERE agent_name = 'darwin';
UPDATE agent_registry SET review_schedule = '0 */4 * * *'  WHERE role = 'state_agent';
-- atlas + hamilton: no review_schedule (Hamilton isn't an AgentBase; Atlas schedules others).
```

### 9. Graduation predicate execution

```python
# fee_crawler/commands/agent_graduate.py (NEW)
"""CLI: python -m fee_crawler agent-graduate <name> --to q2"""
import asyncio, argparse
from fee_crawler.agent_tools.pool import get_pool

# Per-agent predicates live in code (fixed strings; no user interpolation — Pitfall 6).
PREDICATES = {
    ('knox', 'q1_validation', 'q2_high_confidence'): """
        SELECT (100 * SUM(CASE WHEN outlier_flags ? 'human_accepted' THEN 1 ELSE 0 END)
                / NULLIF(COUNT(*), 0)) > 95
          FROM fees_raw
         WHERE source = 'knox' AND created_at > NOW() - INTERVAL '30 days'
    """,
    # Darwin/Atlas predicates drafted in 63/64/65 (Claude's discretion per CONTEXT.md).
}

async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('agent_name')
    ap.add_argument('--to', required=True, choices=['q1_validation','q2_high_confidence','q3_autonomy','paused'])
    args = ap.parse_args()

    pool = await get_pool()
    async with pool.acquire() as conn:
        current = await conn.fetchval(
            "SELECT lifecycle_state FROM agent_registry WHERE agent_name = $1",
            args.agent_name,
        )
        if current is None:
            raise SystemExit(f"Unknown agent: {args.agent_name}")

        key = (args.agent_name, current, args.to)
        predicate = PREDICATES.get(key)
        if predicate is None:
            raise SystemExit(f"No graduation predicate for {key}")

        passed = await conn.fetchval(predicate)
        if not passed:
            raise SystemExit(f"Graduation predicate FAILED for {key}. Staying on {current}.")

        await conn.execute(
            "UPDATE agent_registry SET lifecycle_state = $2 WHERE agent_name = $1",
            args.agent_name, args.to,
        )
        print(f"Graduated {args.agent_name}: {current} -> {args.to}")

if __name__ == '__main__':
    asyncio.run(main())
```

Register in `fee_crawler/__main__.py` so `python -m fee_crawler agent-graduate ...` works.

### 10. Exception-digest daily job

**Runs where:** same `run_post_processing` slot OR a new pg_cron daily schedule at 06:00 ET. Consolidating into existing Modal function is preferred (no new slot).

**Reads:**
- `agent_events WHERE status = 'improve_rejected' AND created_at > now() - interval '24 hours'`
- `agent_messages WHERE state = 'escalated' AND resolved_at IS NULL`
- Q2 sample: `agent_events WHERE agent_name IN (q2-lifecycle agents) AND action='success' AND (confidence < 0.85 OR random() < 0.05) AND created_at > now() - interval '24 hours'`

**Output:** Write a row to a new `agent_digest_entries` table (proposed but not mandatory) OR serialize to a markdown file uploaded to R2. Phase 62b recommendation: land a simple SQL query + let `/admin/agents` Messages tab filter `state='escalated'`; James browses it. Formal email delivery is Phase 65 (Atlas).

### 11. `/admin/agents` console integration

**Nav integration:** Add a new group in `src/app/admin/admin-nav.tsx` NAV_GROUPS after "Data":
```tsx
{
  label: "Agents",
  items: [{ href: "/admin/agents", label: "Agents", icon: <...> }],
}
```

**Layout pattern:** Radix Tabs primitive (already in project via command-palette). Sticky top tab bar, then tab-specific subroute:
```tsx
// src/app/admin/agents/layout.tsx
<Tabs defaultValue="overview">
  <TabsList>
    <TabsTrigger value="overview">Overview</TabsTrigger>
    <TabsTrigger value="lineage">Lineage</TabsTrigger>
    <TabsTrigger value="messages">Messages</TabsTrigger>
    <TabsTrigger value="replay">Replay</TabsTrigger>
  </TabsList>
  <TabsContent value="overview"><Overview /></TabsContent>
  ...
</Tabs>
```

**Sparkline reuse:** `import { Sparkline } from '@/components/sparkline'` + `<Sparkline data={rollupPoints} width={64} height={24} />`.

**Health tile grid (Overview):** 5 metrics × ~4 top-level agents (Knox, Darwin, Atlas, Hamilton) + a collapsible 51-state-agent table. `.admin-card` styling. 

**Lineage tree (OBS-03):** Uses Radix Collapsible + JSON tree from `lineage_graph()` SQL function. Tier 3 root is default-expanded; user clicks to expand each level (3 clicks max — Tier 3 → Tier 2 → Tier 1 → done).

### 12. Testing harness location

- New `fee_crawler/testing/` package: **test helpers and utilities** (FakeAnthropicClient, canary_runner, shadow_helpers, contract_test_base).
- Existing `fee_crawler/tests/`: **the tests themselves.**
- `conftest.py` already provides `db_schema` fixture with per-test Postgres schema + migrations applied. Extend with new fixtures:
  - `fake_anthropic`: fresh FakeAnthropicClient per test.
  - `seeded_agent_registry`: shortcut for tests that need agents beyond the 55 default seeds.
  - `shadow_run_ctx`: `with_agent_context(shadow_run_id=uuid4())` + seeds a shadow_run row.

### 13. Contract test LLM tool-call sequence assertion

**Pattern:**
```python
@pytest.mark.asyncio
async def test_knox_review_emits_expected_tool_sequence(fake_anthropic, db_schema):
    schema, pool = db_schema
    fake_anthropic._scripted = [
        FakeResponse(stop_reason='tool_use', content=[
            ToolUseBlock(name='list_recent_events', input={'hours': 24}),
        ]),
        FakeResponse(stop_reason='tool_use', content=[
            ToolUseBlock(name='flag_anomaly', input={'event_id': '...', 'reason': '...'}),
        ]),
        FakeResponse(stop_reason='end_turn', content=[TextBlock(text='Review complete.')]),
    ]
    from fee_crawler.agents.knox import KnoxAgent  # will exist post-Phase 63
    k = KnoxAgent(client=fake_anthropic, pool=pool)
    await k.review()
    names = [c['name'] for c in fake_anthropic.tool_calls]
    assert names == ['list_recent_events', 'flag_anomaly']
```

**Pytest parametrize for multiple scripted response paths:**
```python
@pytest.mark.parametrize("scripted,expected_sequence", [
    (SCRIPT_NO_ANOMALIES, ['list_recent_events']),
    (SCRIPT_ONE_ANOMALY, ['list_recent_events', 'flag_anomaly']),
    (SCRIPT_ESCALATE,    ['list_recent_events', 'flag_anomaly', 'insert_agent_message']),
])
async def test_knox_review_scripted_paths(scripted, expected_sequence, fake_anthropic, db_schema):
    ...
```

### 14. Health-metric rollup cadence

**Decision:** **15-minute rollup bucket**, stored in `agent_health_rollup` plain table, refreshed via pg_cron every 15 minutes. Per-agent sparkline = last 672 rows (7 days × 24 hours × 4 buckets/hour). 

**Schema:**
```sql
-- supabase/migrations/20260509_agent_health_rollup.sql (NEW)
CREATE TABLE IF NOT EXISTS agent_health_rollup (
    bucket_start            TIMESTAMPTZ NOT NULL,
    agent_name              TEXT NOT NULL REFERENCES agent_registry(agent_name),
    loop_completion_rate    NUMERIC(5,4),
    review_latency_seconds  INTEGER,
    pattern_promotion_rate  NUMERIC(5,4),
    confidence_drift        NUMERIC(6,4),  -- signed delta
    cost_to_value_ratio     NUMERIC(10,4),
    events_total            INTEGER,
    PRIMARY KEY (agent_name, bucket_start)
);

CREATE OR REPLACE FUNCTION refresh_agent_health_rollup(p_since TIMESTAMPTZ DEFAULT NULL) RETURNS INTEGER
LANGUAGE plpgsql AS $$
DECLARE
    v_since TIMESTAMPTZ := COALESCE(p_since, NOW() - INTERVAL '1 hour');
    v_rows  INTEGER := 0;
BEGIN
    INSERT INTO agent_health_rollup
        (bucket_start, agent_name, loop_completion_rate, review_latency_seconds,
         pattern_promotion_rate, confidence_drift, cost_to_value_ratio, events_total)
    SELECT
        date_trunc('hour', created_at) + INTERVAL '15 min' * floor(EXTRACT(minute FROM created_at) / 15) AS bucket,
        agent_name,
        -- Placeholder derivations; Phase 63 tunes per-agent semantics.
        AVG(CASE WHEN action='improve' AND status='success' THEN 1.0 ELSE 0.0 END),
        AVG(CASE WHEN action='review' THEN EXTRACT(EPOCH FROM (created_at - created_at))::INT ELSE NULL END),
        AVG(CASE WHEN action='pattern_promote' THEN 1.0 ELSE 0.0 END),
        AVG(confidence) - LAG(AVG(confidence)) OVER (PARTITION BY agent_name ORDER BY date_trunc('hour', created_at)),
        SUM(cost_cents)::NUMERIC / NULLIF(COUNT(*) FILTER (WHERE action='success'), 0),
        COUNT(*)
    FROM agent_events
    WHERE created_at > v_since
    GROUP BY 1, 2
    ON CONFLICT (agent_name, bucket_start) DO UPDATE SET
        loop_completion_rate = EXCLUDED.loop_completion_rate,
        review_latency_seconds = EXCLUDED.review_latency_seconds,
        pattern_promotion_rate = EXCLUDED.pattern_promotion_rate,
        confidence_drift = EXCLUDED.confidence_drift,
        cost_to_value_ratio = EXCLUDED.cost_to_value_ratio,
        events_total = EXCLUDED.events_total;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RETURN v_rows;
END; $$;

-- Schedule every 15 minutes via pg_cron.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
        PERFORM cron.schedule('refresh-agent-health', '*/15 * * * *',
            'SELECT refresh_agent_health_rollup()');
    END IF;
END $$;
```

### 15. Bootstrap runbook format

**Location:** `.planning/runbooks/agent-bootstrap.md` — new folder.

**Template sections:**
1. **Overview** — what Q1/Q2/Q3 mean for day-to-day operations.
2. **Lifecycle state semantics** — what AgentBase does in each state (paste the COMMENT ON COLUMN text).
3. **Graduation predicates per agent** — link to `fee_crawler/commands/agent_graduate.py::PREDICATES`.
4. **Rollback procedure** — `python -m fee_crawler agent-graduate <name> --to paused` (always allowed — no predicate).
5. **Exception-review SLA** — James reviews digest within 48h.
6. **Failure modes** — predicate regression → automatic pause; how to detect and recover.
7. **SLAs for each loop step** — review latency target, IMPROVE review cycle target.
8. **On-call flowchart** — what to check when `/admin/agents` Overview shows red tiles.

No prior `.planning/runbooks/` folder exists (verified by `ls`). New pattern; future runbooks land here (e.g., `secrets-rotation.md` from SEC-05).

## Risks

### R1: Modal 5-cron cap blocks D-05 verbatim
**Severity:** HIGH
**Mitigation:** Pivot D-05 to pg_cron + internal dispatcher (§Mechanics 3). Introduce `review_schedule` column on `agent_registry`. Consolidate or replace one existing Modal cron slot for the dispatcher if no slot is free. Verified available workaround; CONTEXT.md D-05 rationale ("stays inside Modal idiom") is softly preserved — one Modal function still exists, it just dispatches N agent reviews.

### R2: LISTEN/NOTIFY on transaction pooler silently fails
**Severity:** HIGH
**Mitigation:** New env var `DATABASE_URL_SESSION` (port 5432) for the messaging runtime. Document in CLAUDE.md. `fee_crawler/agent_messaging/listener.py` MUST NOT reuse `get_pool()`. Contract test: start a listener on 5432, publish on 5432, assert delivery < 5s; then repeat on 6543 (transaction pool) and assert NO delivery (negative test).

### R3: lineage_graph() recursive CTE performance across partitions
**Severity:** MEDIUM
**Mitigation:** Current scale is 102K fees_raw rows + empty agent_events (Phase 63+ populates). Baseline query performance is sub-millisecond today. Depth capped at 10 hops. If perf degrades at 10M rows, add a materialized `event_chain_materialized` column on fees_published (denormalize the walk result). Not needed this phase.

### R4: Shadow-mode bug leaks into business tables
**Severity:** HIGH (invariant violation)
**Mitigation:** Gateway-level gate (§Mechanics 5). Contract test: run a shadow call; assert `SELECT COUNT(*) FROM fees_raw` is unchanged AND `SELECT COUNT(*) FROM shadow_outputs` incremented. CI gate blocks merges that would violate. Cross-link from the 62a freeze-trigger pattern: "extracted_fees is frozen" is the same defensive posture.

### R5: Graduation predicate returns NULL instead of boolean
**Severity:** LOW
**Mitigation:** Predicates use `> 0`, `> 95`, etc. — always return boolean. Test every predicate in `test_agent_bootstrap.py` against an empty-data fixture; ensure NULL is handled (e.g., `COALESCE(..., false)`). Graduation CLI treats non-true as failure.

### R6: Modal container timeout terminates LISTEN/NOTIFY listener mid-run
**Severity:** MEDIUM
**Mitigation:** Modal function timeouts are per-invocation; a listener needs `timeout=86400` (24h max) and a self-restart cron (every 24h). Alternative: run the listener as a subprocess inside the `run_post_processing` 6am slot. Decision: keep listener in a dedicated Modal function with long timeout; if that proves fragile, move it to the Next.js serverless side (less ideal — cold starts kill listener state).

### R7: FakeAnthropicClient diverges from real SDK response shape
**Severity:** LOW
**Mitigation:** Pin `anthropic>=0.79.0,<0.90.0` in `fee_crawler/requirements.txt`. Meta-test in `test_fake_anthropic.py` imports real `anthropic.types.MessageParam` and asserts FakeResponse duck-types correctly.

### R8: pg_cron job density with 51+ state-agent schedules
**Severity:** LOW
**Mitigation:** pg_cron handles thousands of scheduled jobs without issue [CITED: supabase.com/blog/postgres-as-a-cron-server]. 55 agent review schedules + 1 health rollup + 1 partition maintenance + 1 exception digest = ~58 pg_cron jobs. Well within capacity.

### R9: The 8000-byte NOTIFY limit trips over message_id if someone tries to NOTIFY the full payload
**Severity:** MEDIUM (easy to write, hard to detect)
**Mitigation:** Enforce via the trigger pattern (§Pitfall 4) — trigger function always sends `NEW.message_id::text`, never `NEW.payload`. Code review on any change to that trigger.

## Sequencing

Recommended plan ordering inside Phase 62b (the planner should map these to plan numbers 62B-01 through 62B-N):

1. **Plan 1: Migrations (infra only).** Land all 9 new migrations (status-widen, lifecycle_state, agent_lessons, shadow_outputs, canary_runs, lineage_graph, v_agent_reasoning_trace, notify trigger, agent_health_rollup, agent_review_schedules). Wave 0 test: `pytest fee_crawler/tests/test_tier_schemas.py` extended to assert new columns + functions present.
2. **Plan 2: AgentBase framework.** `fee_crawler/agent_base/` with `__init_subclass__` auto-wrap + 5 override hooks. Tests: test_agent_base_auto_wrap.
3. **Plan 3: Shadow-mode gateway branch.** Edit `gateway.py` + `context.py`. Contract test: shadow writes don't land in business table.
4. **Plan 4: Testing harness (FakeAnthropicClient + contract_test_base + canary_runner + canary_schema + shadow_helpers).** No agent code yet — just the helpers. Meta-tests pass.
5. **Plan 5: Messaging runtime (LISTEN/NOTIFY listener + publisher + escalation).** New `fee_crawler/agent_messaging/` package. Real Postgres integration test required.
6. **Plan 6: Adversarial gate + IMPROVE flow.** `fee_crawler/agent_base/adversarial_gate.py` + digest-queue write on failure.
7. **Plan 7: Bootstrap CLI + runbook.** `commands/agent_graduate.py` + `.planning/runbooks/agent-bootstrap.md`.
8. **Plan 8: pg_cron review dispatcher.** Modal function + pg_cron schedule seeds. Validates D-05 pivot.
9. **Plan 9: `/admin/agents` console.** 4-tab UI reusing existing admin primitives.
10. **Plan 10: Health rollup refresh function + verification.** Ensures OBS-05 tiles have data (empty until Phase 63 populates agent_events, but the surface exists).
11. **Plan 11: Verification phase.** Full suite green; staging smoke test; human-review steps documented.

Plans 2–5 can parallelize after Plan 1; Plans 6–10 can parallelize after Plans 2–4. Plan 11 is gate.

## References

### File paths cited
- `.planning/phases/62B-agent-foundation-runtime-layer/62B-CONTEXT.md` (25 decisions)
- `.planning/phases/62A-agent-foundation-data-layer/62A-CONTEXT.md`
- `.planning/phases/62A-agent-foundation-data-layer/62A-VERIFICATION.md`
- `.planning/REQUIREMENTS.md`
- `.planning/ROADMAP.md`
- `.planning/STATE.md`
- `.planning/audits/2026-04-16-pipeline-audit/SYNTHESIS.md`
- `fee_crawler/agent_tools/gateway.py` (existing gateway with_agent_tool context manager)
- `fee_crawler/agent_tools/context.py` (existing contextvar manager)
- `fee_crawler/agent_tools/budget.py` (existing budget_halt mechanics)
- `fee_crawler/agent_tools/pool.py` (existing asyncpg pool — transaction mode)
- `fee_crawler/agent_tools/registry.py` (existing @agent_tool decorator)
- `fee_crawler/agent_tools/tools_agent_infra.py` (insert_agent_message + update_agent_message_intent already registered)
- `fee_crawler/modal_app.py` (5 cron slots all occupied)
- `fee_crawler/tests/conftest.py` (per-test Postgres schema fixture)
- `supabase/migrations/20260417_agent_events_partitioned.sql` (status CHECK; pg_cron availability verified here)
- `supabase/migrations/20260419_agent_messages.sql` (schema already has state + round_number)
- `supabase/migrations/20260420_fees_tier_tables.sql` (lineage columns denormalized)
- `supabase/migrations/20260421_tier_promotion_functions.sql` (promote_to_tier3 stub needing tightening)
- `supabase/migrations/20260422_agent_registry_and_budgets.sql` (agent_registry — no lifecycle_state yet)
- `src/components/sparkline.tsx` (reusable)
- `src/app/admin/admin-nav.tsx` (AdminNav structure)
- `CLAUDE.md`

### Library docs
- [asyncpg API Reference](https://magicstack.github.io/asyncpg/current/api/index.html) — add_listener, connection lifecycle
- [asyncpg-listen on PyPI](https://pypi.org/project/asyncpg-listen/) — reconnection wrapper
- [anna-money/asyncpg-listen GitHub](https://github.com/anna-money/asyncpg-listen) — ListenPolicy + NotificationListener API
- [Modal docs — Scheduling cron jobs](https://modal.com/docs/guide/cron) — modal.Cron + modal.Period
- [Modal pricing](https://modal.com/pricing) — Starter 5 crons / Team unlimited
- [Supabase pg_cron extension](https://supabase.com/docs/guides/database/extensions/pg_cron) — cron.schedule syntax, seconds support
- [Supabase Supavisor connection modes](https://supabase.com/docs/guides/troubleshooting/supavisor-and-connection-terminology-explained-9pr_ZO) — session vs. transaction mode, port 5432 vs. 6543
- [PostgreSQL 18 NOTIFY docs](https://www.postgresql.org/docs/current/sql-notify.html) — 8000-byte payload limit
- [Anthropic Python SDK GitHub](https://github.com/anthropics/anthropic-sdk-python) — Message.content tool_use block structure
- [PEP 487 — Simpler customisation of class creation](https://peps.python.org/pep-0487/) — `__init_subclass__`

### Prior-art examples
- [PostgreSQL recursive CTE JSON navigation](http://tatiyants.com/how-to-navigate-json-trees-in-postgres-using-recursive-cte/)
- [PostgreSQL partitioning + recursive CTE](https://fluca1978.github.io/2019/06/12/PartitioningCTE.html)
- [Cybertec — Speeding up recursive queries](https://www.cybertec-postgresql.com/en/postgresql-speeding-up-recursive-queries-and-hierarchic-data/)
- [Stacksync — PostgreSQL LISTEN/NOTIFY 8000-byte limit](https://www.stacksync.com/blog/beyond-listen-notify-postgres-request-reply-real-time-sync)
- [Supabase — Postgres as a Cron Server](https://supabase.com/blog/postgres-as-a-cron-server)
