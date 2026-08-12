# Magellan v1 — Coverage Rescue Design

**Date:** 2026-04-18
**Status:** Design approved, pending written-spec review
**Phase target:** Phase 64.5 (coverage agent, separate from Darwin) — slice #1 of a two-slice coverage roadmap

## Context

The fee index crawls 8,750 institutions. 4,802 have zero non-rejected fees extracted. That empty cohort splits:
- **3,837 have no `fee_schedule_url`** — never found a page to crawl (URL discovery problem).
- **965 have a URL but crawls yielded nothing** — extraction failed (rescue problem).

This spec covers **slice #1: extraction rescue** for the 965 known-URL cohort. URL discovery for the 3,837 no-URL cohort is slice #2, a separate spec against the same agent.

Magellan sits alongside Hamilton / Knox / Darwin / Atlas as a new top-level agent with role `data`. Its job: take a known-but-failed URL, try increasingly expensive extraction strategies until one yields at least one spotlight-tier fee, then route the output to `fees_raw` (where Darwin picks it up).

## Goals

1. Rescue the 965 known-URL empty cohort into `fees_raw` so Darwin can classify them.
2. Establish Magellan's orchestrator + ladder shape so slice #2 (URL discovery) reuses it.
3. Migrate Darwin's common plumbing (`CircuitBreaker`, `BatchRunner`, `CircuitBanner`, SSE-proxy route pattern) to shared locations so Magellan doesn't duplicate.
4. Expose Magellan through `/admin/coverage` — no CLI.
5. Every Magellan action logs to `agent_events` so post-hoc audit can reconstruct "why did target X end up DEAD?"

## Non-goals

- URL discovery for the 3,837 no-URL cohort (slice #2).
- Outlier detection on extracted fees (Darwin's domain).
- Knox state-agent fleet (Phase 63 work, not this).
- Ladder rung N+1 beyond the initial 5 (`playwright`, `ocr`, `ua_rotation`, `llm_extract`, `proxy_rotation`).

## Decisions (from brainstorming)

| Question | Answer |
|---|---|
| Scope | C decomposed — slice #1 = orchestrator + extraction rescue; slice #2 = URL discovery later |
| Toolkit | D — full ladder (Playwright stealth, PDF OCR, UA rotation, LLM re-extraction, paid proxy) |
| Ladder order | B — most-likely-to-work first: Playwright → OCR → UA → LLM → proxy |
| Failure handling | D — state machine over final rung's outcome (dead / needs-human / retry-after) |
| Success criterion | ≥ 1 spotlight/core fee extracted + plausibility gate passes; Darwin does downstream quality |
| Agent name | Magellan (new top-level agent, fits Hamilton/Knox/Darwin/Atlas naming) |
| Run shape | Admin UI (`/admin/coverage`) + manual Modal endpoint. No auto-cron (Modal free-plan saturated). |
| Budget | Per-run soft cap, monitored (same pattern as Darwin) |
| Implementation | Approach 2 — rung-per-module with shared `Rung` protocol |
| Shared plumbing | Migrate Darwin's CircuitBreaker / BatchRunner / CircuitBanner / SSE-proxy to shared locations |

## Architecture

```
┌──────────────────────────────┐      ┌───────────────────────────────┐
│ Next.js admin app            │      │ Python sidecar (Modal web)    │
│  /admin/coverage (RSC + SSE) │◄────►│  POST /magellan/rescue-batch  │
│  server action → sidecar     │ HTTP │  GET  /magellan/status        │
└──────────────┬───────────────┘      │  POST /magellan/reset         │
               │                      └──────────────┬────────────────┘
               │                                     │ imports
               │                                     ▼
               │                    ┌──────────────────────────────────┐
               │                    │ fee_crawler/agents/magellan/     │
               │                    │  orchestrator.py                 │
               │                    │  rungs/  (5 rung modules)        │
               │                    │  plausibility.py                 │
               │                    │  config.py                       │
               │                    └──────────────┬───────────────────┘
               │                                   │
               │                                   │ agent_tools:
               │                                   │  create_fee_raw
               │                                   │  update_crawl_target_rescue_state
               ▼                                   ▼
        ┌─────────────────────────────────────────────────┐
        │ Postgres (Supabase)                             │
        │  crawl_targets (+ rescue_status, last_attempt)  │
        │  fees_raw (new fees land here; Darwin promotes) │
        │  agent_events (every rung logged)               │
        │  agent_registry (magellan row)                  │
        └─────────────────────────────────────────────────┘
```

## Components

### Python package — `fee_crawler/agents/magellan/` (new)

```
__init__.py            — re-exports rescue_batch, BatchResult
config.py              — MagellanConfig (thresholds, ladder order, budget cap)
orchestrator.py        — select_candidates, rescue_batch, decide_next_state
plausibility.py        — is_plausible_fee_schedule(fees, html) — pure fn
rungs/
  __init__.py          — LADDER: list[Rung] in declared order
  _base.py             — Rung Protocol + RungResult dataclass
  playwright_stealth.py— rung 1
  pdf_ocr.py           — rung 2
  ua_rotation.py       — rung 3
  llm_extract.py       — rung 4
  proxy_rotation.py    — rung 5
```

### Shared plumbing migration — `fee_crawler/agents/_common/` (new)

Move from `fee_crawler/agents/darwin/circuit.py` to `fee_crawler/agents/_common/circuit.py`. Darwin updates its imports; Magellan imports from same path. Exact code unchanged.

### Shared UI — `src/components/agent-console/` (new)

Move from `src/app/admin/darwin/components/`:
- `batch-runner.tsx` → `src/components/agent-console/batch-runner.tsx` (generic over agent name)
- `circuit-banner.tsx` → `src/components/agent-console/circuit-banner.tsx`
- SSE proxy route pattern documented, not moved (each agent gets its own route under `src/app/api/admin/<agent>/stream/`)

### Sidecar — `fee_crawler/magellan_api.py` (new)

Three endpoints mirroring Darwin exactly:
- `POST /magellan/rescue-batch { size: int }` → SSE stream
- `GET /magellan/status` → pending / rescued / dead / needs_human / retry_after counts
- `POST /magellan/reset { actor }` → clear halt

Deployed as a second Modal ASGI app (adds one function to `modal_app.py`, no cron).

### Admin UI — `src/app/admin/coverage/` (new)

```
page.tsx                    — RSC shell, fetchMagellanStatus()
actions.ts                  — server action proxy
types.ts                    — MagellanStatus, RescueEvent, RungOutcome
components/
  magellan-console.tsx      — client orchestrator (EventSource, chain-N)
  rescue-stream.tsx         — live table: target | rung | fees | outcome
  status-panel.tsx          — 5 count tiles
  plus imports from @/components/agent-console/
api/admin/coverage/stream/route.ts  — SSE proxy
```

### Migration — `supabase/migrations/20260418_crawl_targets_rescue_state.sql`

```sql
ALTER TABLE crawl_targets
  ADD COLUMN IF NOT EXISTS rescue_status TEXT
    CHECK (rescue_status IN ('pending','rescued','dead','needs_human','retry_after')),
  ADD COLUMN IF NOT EXISTS last_rescue_attempt_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS crawl_targets_rescue_pending_idx
  ON crawl_targets (last_rescue_attempt_at NULLS FIRST)
  WHERE rescue_status IN ('pending', 'retry_after') OR rescue_status IS NULL;

-- Seed the 965 known-URL empty cohort
UPDATE crawl_targets ct
SET rescue_status = 'pending'
WHERE ct.fee_schedule_url IS NOT NULL AND ct.fee_schedule_url != ''
  AND NOT EXISTS (SELECT 1 FROM extracted_fees ef
                    WHERE ef.crawl_target_id = ct.id
                      AND (ef.review_status IS NULL OR ef.review_status != 'rejected'));

-- Register magellan agent
INSERT INTO agent_registry (agent_name, display_name, description, role, parent_agent)
VALUES ('magellan', 'Magellan', 'Coverage rescue — runs a 5-rung ladder on URLs where prior extraction yielded nothing.', 'data', NULL)
ON CONFLICT (agent_name) DO NOTHING;

INSERT INTO agent_budgets (agent_name, budget_window, limit_cents)
VALUES ('magellan', 'per_batch', 5000)
ON CONFLICT (agent_name, budget_window) DO NOTHING;

-- lifecycle_state q2_high_confidence for auto-ship
UPDATE agent_registry SET lifecycle_state = 'q2_high_confidence' WHERE agent_name = 'magellan';
```

## Data flow per target — rescue_ladder

```
fees_found_any = False
last_result = None
for rung in LADDER:
    result = await rung.run(target, context)  # may raise
    last_result = result
    log_agent_event(target, rung.name, result)

    if not result.fees:
        continue
    if not is_plausible_fee_schedule(result.fees, result.text):
        continue
    if not any_spotlight_key(result.fees):
        continue

    # WIN — write fees_raw rows, mark rescued
    for fee in result.fees:
        await create_fee_raw(inp=..., agent_name='magellan', ...)
    update_crawl_target_rescue_state(target.id, 'rescued')
    return RescueOutcome.RESCUED

return decide_next_state(last_result)
```

### `decide_next_state` (state machine — Q4 answer D)

```
if "timeout" in error or http in (500,502,503,504): RETRY_AFTER
if fees_present and not plausible:                  NEEDS_HUMAN
if http in (403,404,410):                           DEAD
else:                                               DEAD
```

## Error handling

| Class | Trigger | Action |
|---|---|---|
| Target transient | Timeout / 5xx | Continue ladder |
| Target permanent | 403/404/410 | Ladder exhausts → DEAD |
| Rung crash | Unexpected exception | Log agent_events status='error'; continue |
| Budget warning | LLM/proxy rung cost approaches soft cap | SSE warning; user may cancel |
| Circuit tripped | 5 consecutive failures OR >30% failures in 50 OR 3 consecutive proxy-rung exhaustions | Halt; admin Reset |

Circuit thresholds tuned per agent. Magellan's `error_rate_threshold=0.30` (vs Darwin's 0.20) — rescue fails more often by nature.

## Testing strategy

**Unit (pure):** `plausibility.is_plausible_fee_schedule`, `decide_next_state`, spotlight detection.

**Integration (real PG, mocked external):**
- `select_candidates` — SKIP LOCKED, eligibility filter
- `rescue_batch_happy_path`, `rescue_batch_ladder_advances`, `rescue_batch_all_rungs_fail_marks_dead`, `rescue_batch_retry_after_on_transient`, `rescue_batch_circuit_trips`

**Per-rung:** `test_playwright_stealth`, `test_pdf_ocr`, `test_llm_extract` against fixtures.

**UI:** coverage-page, rescue-stream, status-panel.

**Coverage targets:** 80% orchestrator, 70% rungs, 90% plausibility.

## Dependencies on existing work

- `create_fee_raw` tool (Phase 62A-07) — assumed working.
- Darwin's CircuitBreaker / BatchRunner / CircuitBanner / SSE-proxy patterns (Phase 64 slice #1) — migrated to shared locations.
- `agent_registry`, `agent_events`, `agent_budgets` tables — existing.
- `playwright`, `tesseract`/`poppler`, `anthropic` Python packages — already in requirements.

## Out of scope (explicit)

- URL discovery for the 3,837 no-URL cohort (slice #2).
- Paid proxy provider selection (deferred; rung 5 will be stubbed with TODO + fallback to "pretend proxy = request failed" until a provider is picked).
- Dashboard-wide view of both Darwin + Magellan on one page (each gets its own admin page).
- Knox state-agent integration (Phase 63).

## Open questions (documented; not blocking plan)

- Proxy provider choice (BrightData / ScraperAPI / rotating residential) — deferred until other 4 rungs prove whether proxy is worth adding.
- Whether the plausibility function should use a small LLM classifier for ambiguous cases, or stay purely rule-based. Start rule-based; revisit if false-negative rate is too high.
- Retry window: 30 days is a first guess. Revisit after first 90 days of data.
- Whether Magellan's nightly cron should share one of Modal's 5 cron slots (by temporarily pausing a less-critical cron) — deferred to an operational task, not a design question.
