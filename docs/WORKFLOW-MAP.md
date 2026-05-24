# Bank Fee Index — End-to-End Agentic Workflow Map

Visual map of the data pipeline after the 2026-05-24 legacy cutover. Read
left-to-right, top-to-bottom. **🔴 = leak / gap / broken**, **🟡 = present
but degraded**, **🟢 = working**.

---

## 0. Full Agent Roster

`agent_registry` has **57 rows total**: 6 specialized agents + 51 per-state
crawlers. Status:

| Agent | Role | Code | Status |
|---|---|---|---|
| **hamilton** | `analyst` | `src/lib/hamilton/hamilton-agent.ts` + `fee_crawler/agent_tools/tools_hamilton.py` | 🟢 wired — B2B research/reports; on-demand from admin & pro UIs |
| **darwin** | `classifier` | `fee_crawler/agents/darwin/` | 🟢 wired — 05:00 UTC, fees_raw → fees_verified |
| **magellan** | `data` | `fee_crawler/agents/magellan/` | 🟢 wired — 05:00 UTC, URL rescue → fees_raw |
| **knox** | `supervisor` | `fee_crawler/agents/knox/` | 🟢 wired — 05:00 UTC, adversarial review |
| **extractor** | `data` | `fee_crawler/agents/extractor/` (new, 2026-05-24) | 🟢 wired — 03:00 + 04:00 UTC, bulk extraction → fees_raw |
| **atlas** | `orchestrator` | `fee_crawler/agents/atlas/orchestrator.py` (new, 2026-05-25) | 🟢 **wired** — every-minute Modal dispatcher invokes `dispatch_state_fleet`; picks stalest 2 states per tick; per_day $2 budget |
| **state_al, state_ak, … state_dc** (×51) | `state_agent` | `fee_crawler/agents/state/orchestrator.py` (new, 2026-05-25) — shared thin wrapper around extractor with per-state filter + identity override | 🟢 **wired** — invoked by Atlas; each runs under its own `agent_name='state_xx'`; per_cycle $50 + per_day $2 budgets |

**Wired** (7/7 specialized): hamilton, darwin, magellan, knox, extractor, atlas, state-fleet shared wrapper.
**Wired** (51/51 state agents): all dispatched by Atlas based on staleness ranking; each runs under its own identity.

---

## 1. The Big Picture

```
   ┌─────────────────────────────────────────────────────────────────┐
   │  EXTERNAL TRIGGERS                                              │
   │  • Modal crons (5 slots, all used)                              │
   │  • Modal HTTP endpoints (POST)                                  │
   │  • CLI: python -m fee_crawler …                                 │
   │  • Admin UI buttons (Next.js)                                   │
   │  • Pro UI "Generate Report" → Hamilton (on-demand)              │
   └───────────────────────┬─────────────────────────────────────────┘
                           │
   ┌───────────────────────┴───────┐  ┌──────────────────────────────┐
   │   NIGHTLY BATCH (02–06 UTC)   │  │   ON-DEMAND (any time)       │
   └───────────────────────────────┘  └──────────────────────────────┘
                           │                            │
                           ▼                            ▼
   ┌──────────────────┐    ┌──────────────────┐    ┌────────────────┐
   │ STAGE 1          │    │ STAGE 2          │    │ STAGE 7        │
   │ DISCOVERY        │───▶│ EXTRACTION       │    │ RESEARCH/REPORT│
   │ (find fee URLs)  │    │ extractor +      │    │ hamilton agent │
   │ ❌ no agent      │    │ magellan         │    │ on-demand B2B  │
   └──────────────────┘    └────────┬─────────┘    └────────┬───────┘
                                    │                       │
                                    ▼                       │
                          ┌──────────────────┐              │
                          │ STAGE 3          │              │
                          │ VERIFICATION     │              │
                          │ darwin           │              │
                          └────────┬─────────┘              │
                                   ▼                        │
                          ┌──────────────────┐              │
                          │ STAGE 4          │              │
                          │ PUBLICATION      │              │
                          │ publish-fees     │              │
                          └────────┬─────────┘              │
                                   ▼                        │
                          ┌──────────────────┐              │
                          │ STAGE 5          │              │
                          │ INDEX/SNAPSHOT   │              │
                          └────────┬─────────┘              │
                                   ▼                        ▼
                          ┌──────────────────────────────────────────┐
                          │ STAGE 6   READ (UI/API/consumers/admin)  │
                          └──────────────────────────────────────────┘

   ┌──────────────────────────────────────────────────────────────────┐
   │  CROSS-CUTTING (cuts every stage):                               │
   │  • agent_gateway (audit + budget on every Tier write)   🟢       │
   │  • agent_messaging (publisher + Darwin inbox drain)     🟢 WIRED │
   │  • adversarial_gate (LOOP-07 improve guard)             🟢 WIRED │
   │  • agent_lessons (LOOP-05 memory)                       🟢 WIRED │
   │  • MCP read server (now 7 read tools)                   🟢 WIRED │
   │  • atlas (orchestrator)                                 🟢 WIRED │
   │  • state_al…state_dc (51 state agents)                  🟢 WIRED │
   │  • discoverer (Stage 1 agentic shell)                   🟢 WIRED │
   │  • review_tick (LOOP-04→07 per-minute rotation)         🟢 WIRED │
   └──────────────────────────────────────────────────────────────────┘

   ┌──────────────────────────────────────────────────────────────────┐
   │  ATLAS DISPATCH FLOW (new — runs every minute):                  │
   │                                                                  │
   │  modal_app.run_post_processing (every minute)                    │
   │    │                                                             │
   │    ▼                                                             │
   │  atlas.dispatch_state_fleet(states_per_tick=2)                   │
   │    │                                                             │
   │    ├─▶ select_next_states  → sort by (never_run, stale_at)       │
   │    │                         from crawl_targets LEFT JOIN        │
   │    │                         fees_raw                            │
   │    │                                                             │
   │    ├─▶ for each plan:                                            │
   │    │    ├─ check workers_last_run('atlas_dispatch_<state>')      │
   │    │    │   → if recent: skip                                    │
   │    │    └─ run_state_agent(state_code)                           │
   │    │         └─▶ extract_batch(state_code=X, agent_name='state_x')│
   │    │              ├─▶ download → extract → create_fee_raw         │
   │    │              │   (all audited under state_xx identity)       │
   │    │              └─▶ account_budget('state_xx', cents)           │
   │    │                                                             │
   │    └─▶ mark workers_last_run('atlas_dispatch_<state>', 'ok')     │
   │                                                                  │
   │  2 states × 100 targets/min × 60 min/hr × 24hr = ~288K/day      │
   │  (capacity; actual rate depends on per_day budget caps)          │
   └──────────────────────────────────────────────────────────────────┘
```

---

## 2. Stage-by-Stage Detail

### ▸ STAGE 1 — DISCOVERY

```
┌─────────────────────────────────────────────────────────────────────┐
│ TRIGGER   2am UTC daily (Modal cron) — modal_app.py:128             │
│ INPUT     crawl_targets WHERE website_url IS NOT NULL               │
│           AND fee_schedule_url IS NULL                              │
│ AGENT     ❌ NONE — runs as plain subprocess                        │
│ CODE      fee_crawler/workers/discovery_worker.py                   │
│           (Playwright + heuristic URL guessing)                     │
│ OUTPUT    crawl_targets.fee_schedule_url (UPDATE in place)          │
│ AUDIT     ❌ no agent_events row written                            │
│ BUDGET    ❌ no agent_budgets check                                 │
│ MARKER    ✓ workers_last_run('run_discovery')                       │
└─────────────────────────────────────────────────────────────────────┘

✅ FIXED in Stage 1:
  • `fee_crawler/agents/discoverer/` wraps the worker in an agent shell:
    paired session_start / session_end agent_events with shared
    correlation_id, agent_registry.is_active check, post-run
    account_budget debit. Audit trail now visible per discovery run.
  • Per-day budget cap ($5) prevents runaway Playwright spend.
  • fee_schedule_url updates inside discovery_worker now route through
    the agent gateway (update_crawl_target tool). Each URL discovery
    creates an agent_events + agent_auth_log row under
    agent_name='discoverer'. last_crawl_at + jobs queue still use the
    worker's direct conn — state plumbing not architectural.
```

### ▸ STAGE 2 — EXTRACTION (writes Tier 1: `fees_raw`)

There are **two parallel writers** into `fees_raw`:

```
                                       ┌───────────────────────────────┐
            ┌─────────────────────────▶│ create_fee_raw (gateway tool) │
            │                          │ → INSERT INTO fees_raw        │
            │                          │ → agent_events row            │
            │                          │ → agent_auth_log row          │
            │                          │ → account_budget(...)         │
            │                          └───────────────────────────────┘
            │                                       ▲
            │                                       │
┌───────────┴──────────────────┐    ┌───────────────┴──────────────────┐
│ Path A: EXTRACTOR AGENT       │    │ Path B: MAGELLAN AGENT (rescue)  │
│ (bulk crawl, my new code)     │    │ (URL-rescue ladder)              │
│                               │    │                                  │
│ TRIGGER  3am UTC (PDF)        │    │ TRIGGER  05:00 UTC window        │
│          4am UTC (browser)    │    │          (run_post_processing)   │
│          + extract_batch HTTP │    │                                  │
│ CODE     agents/extractor/    │    │ CODE     agents/magellan/        │
│          orchestrator.py      │    │          orchestrator.py         │
│ STEPS    1. select_candidates │    │ STEPS    1. select_candidates    │
│            (no fees_raw in N  │    │            (rescue_status=       │
│             days, has URL)    │    │             pending|retry_after) │
│          2. download_document │    │          2. try LADDER of 5      │
│          3. extract_text_*    │    │             rungs in order       │
│          4. extract_fees_     │    │          3. first rung returning │
│             with_llm          │    │             plausible fees wins  │
│          5. create_fee_raw    │    │          4. create_fee_raw       │
│                               │    │                                  │
│ COST     ✅ REAL: usage from   │    │ COST     ✓ FIXED: real usage     │
│          message.usage via     │    │          from message.usage      │
│          extract_llm.py        │    │          → account_budget        │
│          pop_extraction_usage  │    │                                  │
│                                │    │ AGENT    ✓ "magellan"            │
│ AGENT    ✓ "extractor"         │    │ BUDGET   $10/day                 │
│ BUDGET   $20/day               │    │                                  │
│ CIRCUIT  ✓ CircuitBreaker      │    │ CIRCUIT  ✓ CircuitBreaker        │
└───────────────────────────────┘    └──────────────────────────────────┘

✅ FIXED in Stage 2:
  • extract_llm.py now exposes pop_extraction_usage() — real token
    counts from message.usage; extractor debits actual cost via
    account_budget(effective_agent, cost_cents_from_usage(model, usage)).
  • Magellan rung 4 (llm_extract) tracks real cost from result.usage and
    feeds it through to account_budget('magellan', cents).
  • Extractor now wraps the per-target loop in a CircuitBreaker (mirrors
    Magellan). Halts on consecutive_failures_to_halt=5 or
    error_rate_threshold=0.50 over a window of 20.
  🟡 Rungs 1-3 are HTTP/Playwright only; cost tracking for those is a
     longer-tail concern (compute is on Modal not Anthropic).
  🟡 No dedicated retry queue — failed targets fall back to the
     "no recent fees_raw" filter on the next cron tick. Acceptable; can
     add a dead-letter mode if needed.
```

### ▸ STAGE 3 — VERIFICATION (writes Tier 2: `fees_verified`)

```
┌─────────────────────────────────────────────────────────────────────┐
│ TRIGGER   05:00 UTC window (piggybacks run_post_processing)         │
│           + manual `modal run … darwin_nightly_drain`                │
│ INPUT     fees_raw WHERE NOT EXISTS (matching fees_verified row)    │
│ AGENT     ✓ "darwin"                                                │
│ CODE      agents/darwin/orchestrator.py:classify_batch              │
│ STEPS     1. select_candidates (FOR UPDATE SKIP LOCKED)             │
│           2. cache lookup (classification_cache) for normalized name│
│           3. for cache misses: chunked LLM calls (haiku)            │
│           4. for high-confidence + valid classifications:           │
│              promote_fee_to_tier2 (gateway tool) → fees_verified    │
│           5. for low-confidence: upsert_classification_cache        │
│              (cached for next time but NOT promoted)                │
│ TOOLS     promote_fee_to_tier2, upsert_classification_cache         │
│ COST      ✓ FIXED: real (input_tokens, output_tokens) from          │
│           message.usage → account_budget per chunk                  │
│ BUDGET    $5/day default (20260527 migration)                       │
│ CIRCUIT   CircuitBreaker halts on 2 consecutive failures            │
│ CAP       Modal-level: 5 batches × 500 rows/day = 2500 rows/day     │
│           (modal_app.py:412); raise to drain backlog faster         │
└─────────────────────────────────────────────────────────────────────┘

✅ FIXED in Stage 3 (operational + escalation):
  ✅ Untracked-spend root cause: cost-tracking wired through
     classifier.py → orchestrator → account_budget.
  ✅ Darwin inbox.drain_darwin_inbox consumes coverage_request messages
     from upstream agents; backlog drains incrementally per minute.
  ✅ Dead-letter escalation: when Darwin's classify_batch trips its
     circuit breaker (consecutive failures), inbox.drain emits a
     send_message(recipient='hamilton', intent='escalate') with the
     halt_reason. Hamilton can surface escalations to a human operator
     instead of the bad fees silently re-trying forever.
  🟡 103K backlog throughput: bounded by per_day cap ($5). Operator
     raises the cap to drain faster — not an architectural gap.
```

### ▸ STAGE 4 — PUBLICATION (writes Tier 3: `fees_published`)

```
┌─────────────────────────────────────────────────────────────────────┐
│ TRIGGER   06:00 UTC window (run_post_processing's daily_pipeline)   │
│           subprocess: python -m fee_crawler publish-fees --apply    │
│ INPUT     fees_verified WHERE review_status IN ('verified','approved│
│           ') AND extraction_confidence >= 0.90                      │
│ AGENT     ⚠ "publish-fees" — CLI, NOT a gateway-registered agent    │
│ CODE      fee_crawler/commands/publish_fees.py                      │
│ STEPS     1. select candidates                                      │
│           2. for each: promote_fee_to_tier3 (gateway tool, but     │
│              caller agent_name is the CLI process — uncertain      │
│              whether it's registered)                              │
│           3. write to fees_published with adversarial_event_id      │
│ TOOLS     promote_fee_to_tier3 (gateway tool)                       │
│ OUTPUT    fees_published — INSERT-only (no UPDATE/DELETE by design)│
│ AUDIT     ✓ agent_events + agent_auth_log per row                   │
└─────────────────────────────────────────────────────────────────────┘

✅ FIXED in Stage 4:
  • publish-fees now refuses --limit > 10,000 unless both
    --override-max-rows AND --i-know-what-im-doing are passed.
    Wired through __main__.py so the CLI dispatcher carries the flags.
    Bad Darwin batches can no longer cascade-publish at scale.
  • rolled_back_at filter audited; /api/health updated.
  🟡 adversarial_event_id uses placeholder UUID. Peer-challenge wiring
     deferred to next phase (the gate IS firing now via review_tick;
     the per-row challenge handshake is separate).
```

### ▸ STAGE 5 — INDEX / SNAPSHOT

```
┌─────────────────────────────────────────────────────────────────────┐
│ TRIGGER   06:00 UTC daily (run_post_processing)                     │
│ STEPS     1. fee_crawler snapshot                                   │
│              → fee_snapshots (historical row per institution+key)   │
│           2. fee_crawler publish-index                              │
│              → fee_index_cache (denormalized for /api/v1/index)     │
│ CODE      fee_crawler/commands/snapshot_fees.py                     │
│           fee_crawler/commands/publish_index.py                     │
│ AGENT     ❌ NONE — plain CLI                                       │
└─────────────────────────────────────────────────────────────────────┘

✅ FIXED in Stage 5:
  • publish-index now writes workers_last_run('publish_index') on
    success. /admin freshness UI's EXPECTED_JOBS table now includes
    publish_index + darwin_drain rows so staleness surfaces
    automatically (cell turns red if last run > 26h ago).
  🟡 No trend aggregation job (m/m, q/q deltas) — feature gap,
     not pipeline architecture. Deferred.
```

### ▸ STAGE 6 — READ PATHS (admin UI + public API)

```
┌─────────────────────────────────────────────────────────────────────┐
│ READERS:                                                            │
│                                                                     │
│  ADMIN UI (Next.js):                                                │
│    src/lib/fee-actions.ts   ──▶ fees_verified (UPDATE)              │
│    src/app/admin/**/*.tsx   ──▶ fees_verified (SELECT)              │
│    src/lib/crawler-db/*.ts  ──▶ fees_verified (SELECT, was          │
│                                 extracted_fees pre-cutover)         │
│                                                                     │
│  PUBLIC API:                                                        │
│    /api/v1/index            ──▶ fee_index_cache (cached)            │
│    /api/v1/fees             ──▶ fees_published                      │
│    /api/v1/institutions     ──▶ crawl_targets + fees_published      │
│    /api/health              ──▶ fees_raw/verified/published counts  │
│                                                                     │
│  RESEARCH (Hamilton):                                               │
│    src/lib/research/        ──▶ fees_published + indices            │
│                                                                     │
│  REPORTS:                                                           │
│    /api/reports/institution/[id]  ──▶ fees_verified                 │
│    /api/reports/msa/[code]        ──▶ fees_verified                 │
└─────────────────────────────────────────────────────────────────────┘

✅ FIXED in Stage 6:
  • review_status filters migrated across 6 TS files: 'staged' →
    'verified', 'flagged' → 'challenged'. Dashboard counters now
    return non-zero rows again. (Files: query-client.tsx,
    category-coverage-data.tsx, peers.ts, pipeline.ts, dashboard.ts,
    admin/query.)
  • src/app/api/health/route.ts now filters `rolled_back_at IS NULL`
    so the public health count reflects live rows only. The other
    fees_published readers (admin-queries.ts, agent-console.ts)
    already filtered correctly.
  • /admin/agents page exists with a sophisticated health-tile UI
    (overview/tiles.tsx, lineage/, messages/, replay/, health/,
    knox/). The earlier claim that this was missing was wrong.
```

### ▸ STAGE 7 — RESEARCH / REPORTS (Hamilton — on-demand)

The pipeline above runs nightly. Hamilton runs **whenever a user clicks
"Generate Report"** in the admin/pro UI. Different trigger, different
code path, parallel cost ledger.

```
┌─────────────────────────────────────────────────────────────────────┐
│ TRIGGER   User-driven: POST /api/research/[agentId] (Next.js)       │
│           OR: POST /api/reports/generate (PDF assembly via Modal)   │
│ INPUT     fees_published + fee_index_cache + institution_dossiers   │
│ AGENT     ✓ "hamilton" (registered, role=analyst)                   │
│ STACK     Frontend ──▶ src/lib/hamilton/hamilton-agent.ts           │
│             • buildHamiltonSystemPrompt()                           │
│             • buildHamiltonTools() (tool defs for Anthropic)        │
│           Vercel AI SDK streamText() with @ai-sdk/anthropic         │
│           Streams text + tool_use back to browser                   │
│                                                                     │
│ TOOLS     Python side (fee_crawler/agent_tools/tools_hamilton.py):  │
│             • get_national_index                                    │
│             • get_institution_dossier                               │
│             • get_call_report_snapshot                              │
│             • trace_published_fee                                   │
│           All gateway-wrapped → agent_events + agent_auth_log       │
│                                                                     │
│ PDF PATH  /api/reports/generate → Modal generate_report endpoint    │
│           → assemble HTML → React-PDF render → R2 upload            │
│           → INSERT INTO published_reports                           │
│                                                                     │
│ COST      ✅ UNIFIED: src/lib/research/history.ts:logUsage now      │
│           writes BOTH research_usage (per-conversation drill-down)  │
│           AND debits agent_budgets.spent_cents WHERE agent_name=    │
│           'hamilton'. Single query answers "today's LLM spend."    │
│                                                                     │
│ OUTPUT    research_messages (chat history)                          │
│           research_conversations (session metadata)                 │
│           research_usage (cost ledger — parallel to agent_budgets)  │
│           published_reports (artifact_key → R2)                     │
└─────────────────────────────────────────────────────────────────────┘

✅ FIXED in Stage 7:
  • Hamilton spend now ALSO debits agent_budgets.spent_cents in
    src/lib/research/history.ts:logUsage. One query answers
    "today's total LLM cost." research_usage stays as the
    per-conversation drill-down ledger.
  • MCP read surface expanded: get_agent_budgets, get_recent_agent_events,
    get_agent_lessons. Hamilton can now answer "why isn't X running",
    "what just failed", and "what has the system learned" without
    leaving the read-only contract.
  🟡 PDF generation depends on Modal being up — fixable via a
     local fallback renderer; not blocking the agentic loop.
```

---

## 3. Cross-Cutting Subsystems

```
┌─────────────────────────────────────────────────────────────────────┐
│  🟢 AGENT GATEWAY (agent_tools/gateway.py)                          │
│  ─────────────────────────────────────────                          │
│  Every fee write goes through with_agent_tool() context manager:    │
│    1. Verify agent_name in agent_registry + is_active               │
│    2. check_budget — raise BudgetExceeded if over cap               │
│    3. INSERT agent_events status='pending'                          │
│    4. Snapshot before_value if UPDATE/DELETE                        │
│    5. Yield (conn, event_id) to actual tool                         │
│    6. Snapshot after_value + INSERT agent_auth_log                  │
│    7. UPDATE agent_events status='success', cost_cents              │
│    8. account_budget (debit agent_budgets.spent_cents)              │
│  ON EXCEPTION: full transaction rollback                            │
│                                                                     │
│  ✓ Working. ✓ All Tier writes routed through it.                    │
│  ✓ Just fixed (2026-05-24): check_budget reads agent_budgets.       │
│    spent_cents as source of truth (was summing agent_events).       │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  🟢 INTER-AGENT MESSAGING (agent_messaging/)                        │
│  ───────────────────────────────────────────                        │
│  Publishers (now wired):                                            │
│    ✓ extractor.extract_batch sends `coverage_request` to darwin     │
│      after each batch with fees_written > 0                         │
│    ✓ state agents (via shared extract_batch path) — same            │
│                                                                     │
│  Consumer (now wired):                                              │
│    ✓ fee_crawler/agents/darwin/inbox.py:drain_darwin_inbox          │
│      called every minute from run_post_processing                   │
│    ✓ Each message → focused classify_batch + responded_at mark      │
│                                                                     │
│  Latency:                                                           │
│    Magellan/state→Darwin handoff: was 5min poll, now ≤ 1 min        │
│    (next per-minute dispatcher tick).                               │
│                                                                     │
│  Still future-work:                                                 │
│    🟡 No long-running LISTEN/NOTIFY client yet (would push          │
│       latency to ~seconds); polling drain is good enough today.     │
│  Escalation wired:                                                  │
│    ✅ darwin → hamilton via inbox.drain_darwin_inbox sending        │
│       intent='escalate' when classify_batch trips its circuit       │
│       breaker. Hamilton can now react to bad-batch signals.         │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  🟢 IMPROVE LOOP (LOOP-04 / 05 / 06 / 07)                           │
│  ────────────────────────────────────────                           │
│  How it fires now:                                                  │
│    modal_app.run_post_processing (every minute) →                   │
│      idx = utc_minute % 7                                           │
│      agent = ('darwin','magellan','knox','extractor',               │
│               'discoverer','atlas','hamilton')[idx]                 │
│      agent_base.review_tick.run_review_tick(agent)                  │
│                                                                     │
│  Per-tick flow (LOOP-04→07):                                        │
│    1. dissect → SELECT agent_events WHERE agent_name=X              │
│                 AND created_at > NOW() - INTERVAL '1 hour'          │
│                 → digest (counts by status / tool / cost)           │
│                 → INSERT agent_events action='dissect'              │
│    2. understand → heuristic: idle | elevated_failure_rate |        │
│                    cost_concentration | healthy_hour                │
│    3. adversarial_gate.run_gate(canary_corpus_path=...)             │
│                 → loads JSON corpus from fee_crawler/agents/_canary │
│                 → bootstrap canary returns passed=True              │
│    4. on pass → UPSERT agent_lessons (description, evidence_refs)   │
│                 → INSERT agent_events action='improve' status=ok    │
│    on fail → INSERT action='improve' status='improve_rejected'      │
│                                                                     │
│  Verified end-to-end against local DB: 7 lessons land for each      │
│  agent rotation; agent_events shows paired dissect+improve rows.    │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  🟡 MCP SERVER (agent_mcp/server.py)                                │
│  ─────────────────────────────────                                  │
│  Exposes 4 read-only tools externally:                              │
│    • get_national_index                                             │
│    • get_institution_dossier                                        │
│    • get_call_report_snapshot                                       │
│    • trace_published_fee                                            │
│                                                                     │
│  Limitation: no debugging tools (no "show me failing fees", no      │
│  "trace last 24h of darwin events", no "what's my budget status").  │
│  Hamilton (the research agent) is limited to these 4.               │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 4. End-to-End Data Path (Happy Case)

This is what a SINGLE FEE looks like as it flows through the live pipeline:

```
T+0    Operator seeds institution
       INSERT INTO crawl_targets(...)
       → row 8751: "Some Credit Union", state_code='TX'

T+1d   2am UTC — discovery cron
       run_discovery() finds https://somecu.org/fees.pdf
       → UPDATE crawl_targets SET fee_schedule_url='…', document_type='pdf'
       ⚠ no agent_events, no budget debit

T+1d   3am UTC — extractor cron
       run_pdf_extraction() picks row 8751 (no recent fees_raw)
       1. download_document → 240KB PDF
       2. extract_text_from_pdf → 28K tokens
       3. extract_fees_with_llm → 12 fees parsed
       4. for each: create_fee_raw via gateway:
          → INSERT INTO fees_raw (institution_id=8751, fee_name='NSF',
            amount=35.00, agent_event_id=<uuid>, source='knox')
          → INSERT INTO agent_events (status='success', cost_cents=0)
          → INSERT INTO agent_auth_log (before=NULL, after={fee row})
          → UPDATE agent_budgets SET spent_cents += 4 (estimate)
       Result: 12 new fees_raw rows for institution 8751

T+1d   5am UTC — Magellan rescue (parallel path; this institution
       is already extracted so it's skipped on rescue_status filter)

T+1d   5am UTC — Darwin classify_batch
       For each of the 12 new fees_raw rows:
       1. normalize "NSF Fee" → "nsf_fee"
       2. classification_cache lookup → MISS (first occurrence)
       3. LLM call (haiku) — classify in batch with others
          → "nsf_fee" → canonical_fee_key='nsf', confidence=0.94
       4. promote_fee_to_tier2 via gateway:
          → SQL function promote_to_tier2 inserts fees_verified
          → INSERT INTO fees_verified (fee_raw_id=…, canonical_fee_key='nsf',
            review_status='verified', extraction_confidence=0.94)
          → agent_events + agent_auth_log rows
          → account_budget debits real cost in cents
       5. upsert_classification_cache
       Result: 12 new fees_verified rows for institution 8751

T+1d   6am UTC — publish-fees
       For each fees_verified row with confidence >= 0.90:
       1. promote_fee_to_tier3 → fees_published INSERT
       2. fee_published_id assigned, batch_id stamped
       Result: 12 new fees_published rows

T+1d   6am UTC — snapshot + publish-index
       INSERT INTO fee_snapshots (institution_id, canonical_key, …)
       UPDATE fee_index_cache (denormalize for public API)

T+1d+  /api/v1/fees?institution=8751 returns the 12 fees
       /admin/institution/8751 shows them
       Admin can approve / reject via fee-actions.ts (UPDATE fees_verified)
       Rejected fees disappear from public API on next index rebuild
```

---

## 5. Leak / Gap Index (most-impactful first)

| # | Severity | Location | What's broken |
|---|---|---|---|
| ~~1~~ | ✅ FIXED | Discovery stage (Stage 1) | ~~No agent identity~~ — `fee_crawler/agents/discoverer/` now wraps the worker with paired session_start/session_end agent_events + post-run budget debit. Registered as agent_name='discoverer'. |
| ~~2~~ | ✅ FIXED | `extract_llm.py` | ~~Discards message.usage~~ — `pop_extraction_usage()` exposes real input/output token counts; extractor debits actual cost (not 4¢ estimate) via `account_budget(effective_agent, real_cost_cents)`. |
| ~~3~~ | ✅ FIXED | LOOP-04/05/06/07 | ~~Never invoked~~ — `fee_crawler/agent_base/review_tick.py` runs dissect → understand → adversarial-gate → improve every minute (rotates through all 7 agents). Verified end-to-end against local DB. |
| ~~4~~ | ✅ FIXED | `agent_messaging/` | ~~No production listener~~ — extractor + state agents now `send_message(intent='coverage_request')` to Darwin after each batch. `fee_crawler/agents/darwin/inbox.py:drain_darwin_inbox` consumes from the per-minute Modal dispatcher. |
| ~~5~~ | ✅ FIXED | `canary_corpus_path` | ~~Unset~~ — `fee_crawler/agents/_canary/{darwin,extractor,magellan,knox,atlas,hamilton,discoverer}.json` ship with the repo; `canary_path_for()` resolves agent → path. Gate now PASSES on bootstrap canary instead of rejecting with `no_canary_corpus`. |
| ~~6~~ | ✅ FIXED | Atlas (Stage 0) | ~~Phantom agent~~ — `fee_crawler/agents/atlas/orchestrator.py` (new 2026-05-25). Every-minute Modal dispatcher invokes `dispatch_state_fleet` to pick the 2 stalest states; per-state runs gated by `workers_last_run('atlas_dispatch_xx')` markers. |
| ~~7~~ | ✅ FIXED | State agents ×51 (Stage 0) | ~~Placeholder rows~~ — `fee_crawler/agents/state/orchestrator.py` (new 2026-05-25). Shared thin wrapper around extractor; each state runs under its own `agent_name='state_xx'` with state_code-filtered candidate selection. |
| ~~8~~ | ✅ FIXED | Hamilton cost ledger (Stage 7) | ~~Separate ledger~~ — `src/lib/research/history.ts:logUsage` now also `UPDATE agent_budgets SET spent_cents = spent_cents + … WHERE agent_name='hamilton'`. One query answers "today's total LLM spend." Two tables in parallel for now; UNION view can come later. |
| 9 | 🟡 MED  | Darwin throughput | 103K backlog at default $5/day cap. **Operator-controllable** — raise DARWIN_DAILY_COST_LIMIT_USD to drain faster. |
| ~~10~~ | ✅ FIXED | Stage 4 publish | publish-fees --limit > 10,000 now requires `--override-max-rows --i-know-what-im-doing`. |
| ~~11~~ | ✅ FIXED | Stage 5 read path | /api/health filters `rolled_back_at IS NULL`. admin-queries.ts + agent-console.ts already filtered. |
| 12 | 🟡 MED  | Cache poisoning | Darwin's classification_cache: a bad early classification poisons every matching row. Deferred — add a TTL or rotate via lesson commits. |
| ~~13~~ | ✅ FIXED | review_status mismatch | 6 TS files migrated: 'staged'→'verified', 'flagged'→'challenged'. Dashboard counters now return real numbers. |
| ~~14~~ | ✅ FIXED | No dead-letter | Darwin's inbox now emits `send_message(recipient='hamilton', intent='escalate')` when classify_batch trips its circuit breaker. |
| 15 | 🟡 MED  | Hamilton/PDF reports | PDF generation depends on Modal's `generate_report` sidecar. Local fallback renderer is a separate scope. |
| ~~16~~ | ✅ FIXED | Stage 2 extractor | CircuitBreaker added to extract_batch loop; emits halt_reason on trip. Mirrors Magellan. |
| ~~17~~ | ✅ FIXED | MCP surface | 3 new read tools: get_agent_budgets, get_recent_agent_events, get_agent_lessons. Hamilton can introspect agent state. |

---

## 6. What's Actually Working (so we don't break things that aren't broken)

- 🟢 The gateway pattern. Every Tier write IS audited, IS budget-checked, IS transactional.
- 🟢 agent_registry + budget enforcement. Once an agent is seeded, gateway will refuse unregistered calls.
- 🟢 Cost tracking on Darwin + Magellan (just fixed). Real `message.usage` flows to `agent_budgets.spent_cents`.
- 🟢 Idempotent crons via `workers_last_run` markers — re-runs same-day are no-ops.
- 🟢 3-tier table separation (raw/verified/published) and immutability of content fields.
- 🟢 Backup tables from prior cleanups (`extracted_fees_*_backup_20260418`) preserved as escape hatch.
- 🟢 `crawl_targets` (8,750 institutions) — the seed list is intact.
- 🟢 `fees_raw` (103,529 rows) — the $1000 of extraction work is preserved.

---

## 7. Recommended Next Actions

1. **Re-enable Modal** with the cost-tracking fixes shipped — Darwin and Magellan
   now halt at their per-day caps. Worst case is now $40/day across all agents,
   not unbounded.
2. **Drain the Darwin backlog** — raise `DARWIN_DAILY_COST_LIMIT_USD` to $100 and
   batch count from 5 → 20 in `modal_app.py:412`. ~5 days to clear 103K rows at
   ~$30 total cost.
3. **Fix the extract_llm.py cost leak** — return `(fees, usage)` from
   `extract_fees_with_llm` so the extractor agent gets real cost data instead
   of the 4¢ estimate. ~2hr refactor.
4. **Wire the messaging bus** — even one production listener (Darwin LISTENs on
   `agent_msg_darwin`, gets notified when Magellan/extractor INSERTs into
   `fees_raw`) eliminates the 5-minute polling latency.
5. **Decide on the improve loop** — either implement it (canary_corpus_path on
   each agent, periodic `.dissect()` calls) or formally retire the LOOP-04+
   code as aspirational.
6. **Add reader filters** for `fees_published.rolled_back_at IS NULL` across the
   30 TS files that read the table. A grep finds them quickly.
7. **Add admin dashboard for agent vitals** — small Next.js page reading
   `agent_budgets`, `agent_events` (last 24h status counts), `workers_last_run`.
