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
   │  • agent_messaging (LISTEN/NOTIFY bus)              🔴 UNUSED    │
   │  • adversarial_gate (LOOP-07 improve guard)         🔴 UNFIRED   │
   │  • agent_lessons (LOOP-05 memory)                   🔴 EMPTY     │
   │  • MCP read server (external query API)             🟡 LIMITED   │
   │  • atlas (orchestrator)                             🟢 WIRED     │
   │  • state_al…state_dc (51 state agents)              🟢 WIRED     │
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

🔴 LEAKS in Stage 1:
  • Discovery LLM/Playwright costs are completely untracked
  • No audit trail — can't tell which agent_event_id discovered a URL
  • No retry-on-failure: if discovery fails, the URL stays NULL until
    the next 2am cron (24h wait)
  • Concurrency=20 hardcoded; no per-domain rate limit beyond
    DomainRateLimiter (which the worker may or may not use)
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
│ COST     🟡 ESTIMATE only:    │    │ COST     ✓ FIXED: real usage     │
│          4¢/extraction         │   │          from message.usage      │
│          (extract_llm.py       │   │          → account_budget        │
│           doesn't propagate    │   │                                  │
│           message.usage)       │   │ AGENT    ✓ "magellan"            │
│ AGENT    ✓ "extractor"         │   │ BUDGET   $10/day                 │
│ BUDGET   $20/day               │   │                                  │
└───────────────────────────────┘    └──────────────────────────────────┘

🔴 LEAKS in Stage 2:
  • extract_llm.py discards message.usage from every call — extractor
    is using a CONSERVATIVE ESTIMATE (4¢/target) instead of real spend.
    Bounded but not accurate. TODO: refactor extract_llm.py to return
    (fees, usage) tuple.
  • Magellan rung 1-3 (proxy_rotation, playwright_stealth, pdf_ocr) are
    download-only; cost = 0. Only rung 4 (llm_extract) hits Anthropic.
    No proxy/playwright cost is tracked.
  • If extract_batch fails mid-target, the target is unlocked by
    SKIP LOCKED but no retry queue exists — next cron tries it again
    based on the "no recent fees_raw" filter.
  • Extractor agent has no circuit breaker. Magellan has one
    (3 consecutive failures → halt batch), but extractor does not.
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

🔴 GAPS in Stage 3:
  • 103K fees_raw rows pending, only 1,347 verified — 1.3% drained
    (root cause: Modal shut down 2026-04 due to untracked spend)
  • Low-confidence rows STAY IN fees_raw forever (no retry, no
    promotion to "needs human review" queue, no escalation event)
  • If promote_fee_to_tier2 fails for a single fee, that row's
    failure is logged + counted in result.failures but NOT re-queued
  • No dead-letter table for poison fees (e.g., fee_name that always
    crashes the LLM tool definition)
  • Cache "hit" path skips Darwin entirely — if the cache was poisoned
    by a bad early classification, every matching row inherits the
    error with no re-verification
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

🔴 GAPS in Stage 4:
  • No upper-bound check on batch size — `--apply` can promote
    arbitrarily many rows at once. A bad Darwin classification batch
    could cascade-publish corrupted data in one shot.
  • adversarial_event_id is set to a placeholder UUID — the actual
    adversarial-gate step (peer agent challenge) is NOT wired up.
  • Rollback exists (rollback_publish.py) but soft-deletes by setting
    rolled_back_at; readers must filter on that column or they'll
    serve stale data. Need to verify all 30+ TS readers handle it.
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

🔴 GAPS in Stage 5:
  • If publish-index fails, the cache silently goes stale (consumers
    see yesterday's data) — no alerting
  • fee_snapshots stores point-in-time data but there's no trend
    aggregation job to compute deltas (m/m, q/q changes)
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

🔴 LEAKS in Stage 6:
  • 28 TS files were bulk-renamed from extracted_fees → fees_verified
    in the cutover. Column-name compatibility is provided by the
    GENERATED ALWAYS AS STORED columns in 20260525_fees_verified_
    compat_columns.sql (id, crawl_target_id, validation_flags,
    fee_category). These ARE shimmed, but:
    - Subtle behavior diff: extracted_fees.review_status had values
      ('pending'|'staged'|'flagged'|'approved'|'rejected')
      fees_verified.review_status has values
      ('verified'|'challenged'|'approved'|'rejected')
      Queries filtering on 'staged' or 'flagged' will return 0 rows.
  • No reader filters on fees_published.rolled_back_at — if a batch
    is rolled back, those rows continue to surface in reports.
  • No reader filters on agent_budgets/agent_events state — admin
    has no visibility into agent health from the UI.
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
│ COST      🔴 SEPARATE LEDGER: src/lib/research/history.ts writes    │
│           to research_usage table with its own input_tokens /       │
│           output_tokens / estimated_cost_cents fields. NOT visible  │
│           to agent_budgets (Hamilton's spend won't trip the         │
│           gateway's BudgetExceeded).                                │
│                                                                     │
│ OUTPUT    research_messages (chat history)                          │
│           research_conversations (session metadata)                 │
│           research_usage (cost ledger — parallel to agent_budgets)  │
│           published_reports (artifact_key → R2)                     │
└─────────────────────────────────────────────────────────────────────┘

🔴 LEAKS in Stage 7:
  • Hamilton's spend lives in research_usage NOT agent_budgets. You
    can't run "show me total Anthropic cost today" with a single
    query — you have to UNION two tables with different schemas.
  • The MCP read tools (4 of them) limit what Hamilton can introspect
    about its own state. Hamilton can't see Darwin's budget, can't
    see what fees just landed, can't ask "what's the most expensive
    institution to extract from this week?"
  • PDF generation runs in a Modal sidecar; if Modal is down (which
    it has been since the 2026-04 cost runaway), reports silently
    return error states to the user.
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
│  🔴 INTER-AGENT MESSAGING (agent_messaging/)                        │
│  ───────────────────────────────────────────                        │
│  Designed:                                                          │
│    LISTEN/NOTIFY on per-agent channel `agent_msg_<name>`            │
│    Postgres trigger fires NOTIFY on agent_messages INSERT           │
│    Each agent runs a listener in its own loop                       │
│                                                                     │
│  Reality:                                                           │
│    ❌ NO production agent calls run_listener()                      │
│    ❌ NO production agent calls send_message()                      │
│    Tests pass, but the bus is silent in prod                        │
│                                                                     │
│  Consequence:                                                       │
│    Magellan can't notify Darwin "I just wrote 200 fees_raw rows"    │
│    Darwin polls fees_raw on a 5-minute schedule instead of being    │
│    woken up. Latency = up to 5 minutes per row.                     │
│    Knox can't escalate edge cases to Hamilton — there's no path.    │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  🔴 IMPROVE LOOP (LOOP-04 / 05 / 06 / 07)                           │
│  ────────────────────────────────────────                           │
│  Designed:                                                          │
│    Agent runs turn → dissect events → understand patterns           │
│    → improve (commit lesson) → adversarial_gate.run_gate            │
│    → if canary passes, lesson commits to agent_lessons              │
│                                                                     │
│  Reality:                                                           │
│    ❌ NO concrete agent (extractor/magellan/darwin/knox) overrides  │
│       dissect/understand/improve                                    │
│    ❌ NO production code calls .dissect(), .understand(),           │
│       .improve() on any agent                                       │
│    ❌ NO agent sets canary_corpus_path → adversarial_gate's         │
│       no_canary_corpus reject path would trip 100% of the time      │
│    ❌ agent_lessons table is EMPTY in prod                          │
│                                                                     │
│  Consequence:                                                       │
│    The system can't learn from its mistakes. Bad classifications    │
│    happen, no event extracts a pattern, no lesson lands. Each       │
│    Darwin run is independent — no memory of last week's errors.     │
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
| 1 | 🔴 HIGH | Discovery stage (Stage 1) | No agent identity, no audit, no budget; Playwright runs invisible to the framework |
| 2 | 🔴 HIGH | `extract_llm.py` | Returns fees but discards `message.usage`; extractor uses 4¢/extraction ESTIMATE |
| 3 | 🔴 HIGH | LOOP-04/05/06/07 | Defined but never invoked. System can't learn. `agent_lessons` empty. |
| 4 | 🔴 HIGH | `agent_messaging/` | Bus is built but no agent listens; Magellan→Darwin handoff is poll-based, 5min latency |
| 5 | 🔴 HIGH | `canary_corpus_path` | Never set on any agent → adversarial gate would reject 100% of IMPROVEs |
| ~~6~~ | ✅ FIXED | Atlas (Stage 0) | ~~Phantom agent~~ — `fee_crawler/agents/atlas/orchestrator.py` (new 2026-05-25). Every-minute Modal dispatcher invokes `dispatch_state_fleet` to pick the 2 stalest states; per-state runs gated by `workers_last_run('atlas_dispatch_xx')` markers. |
| ~~7~~ | ✅ FIXED | State agents ×51 (Stage 0) | ~~Placeholder rows~~ — `fee_crawler/agents/state/orchestrator.py` (new 2026-05-25). Shared thin wrapper around extractor; each state runs under its own `agent_name='state_xx'` with state_code-filtered candidate selection. |
| **8** | **🔴 HIGH** | **Hamilton cost ledger (Stage 7)** | **Hamilton spend tracked in `research_usage` table, NOT `agent_budgets`. Two parallel cost systems with no UNION; can't enforce one cap or see one number for "today's total LLM spend."** |
| 9 | 🟡 MED  | Darwin throughput | 103K backlog × 2500/day cap = ~40 days. Cap is operator-controllable. |
| 10 | 🟡 MED  | Stage 4 publish | No batch-size cap; bad Darwin batch could publish corrupted data at scale |
| 11 | 🟡 MED  | Stage 5 read path | No reader filters on `fees_published.rolled_back_at` — rolled-back rows still surface |
| 12 | 🟡 MED  | Cache poisoning | Darwin's classification_cache: a bad early classification poisons every matching row |
| 13 | 🟡 MED  | review_status mismatch | Old extracted_fees values (`staged`/`flagged`) replaced by `verified`/`challenged` — TS filters on old values return 0 |
| 14 | 🟡 MED  | No dead-letter | Failed tool calls log + continue; no retry queue, no poison-pill detection |
| 15 | 🟡 MED  | Hamilton/PDF reports | If Modal is down (currently is), report PDFs silently fail. No fallback. |
| 16 | 🟢 LOW  | Stage 2 extractor | No circuit breaker (Magellan has one; extractor doesn't) |
| 17 | 🟢 LOW  | MCP surface | Only 4 read tools; Hamilton can't introspect agent state, only published data |

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
