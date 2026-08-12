# Darwin v1 — Classifier + Orchestrator Design

**Date:** 2026-04-17
**Status:** Design approved, pending written-spec review
**Phase target:** 64 (Darwin) — slice #1 of decomposed roadmap

## Context

The Agent Team v10.0 architecture (locked 2026-04-16) names Darwin as the classification/verification agent. Phase 62A shipped Darwin's tool layer: `promote_fee_to_tier2` (DB-enforced `agent_name='darwin'`), `upsert_classification_cache`, `update_fee_raw_flags`. Phase 62A-12 backfilled 102,965 rows into `fees_raw`. Nothing has been promoted — `fees_verified` and `classification_cache` are empty.

Darwin's full v10.0 contract is (1) classify, (2) detect outliers, (3) verify against source, (4) honor the 5-step self-improvement loop. Building all four at once produces a spec nobody can hold in their head. This doc covers **slice #1: classify + orchestrator**, the minimum that gets Tier 2 populated so Hamilton and the reports have something to consume. Outlier detection, source re-verify, and the self-improvement loop land in follow-on slices against the same `agent_events` substrate.

## Goals

1. Convert the 102,965 `fees_raw` backlog into `fees_verified` using an LLM classifier running under `agent_name='darwin'`.
2. Keep the classifier cheap (Haiku) and cache-first so steady-state cost stays low.
3. Expose Darwin's activity through the admin panel, not the terminal (see user feedback memory `feedback_no_cli_tools.md`).
4. Establish the agent-console UI shape for Knox / Atlas to reuse.
5. Log every Darwin decision to `agent_events` so later slices can implement REVIEW/DISSECT/UNDERSTAND/IMPROVE against real history.

## Non-goals

- Outlier detection on fee amounts (next slice).
- Source-document re-verification (next slice).
- REVIEW / DISSECT / UNDERSTAND / IMPROVE loop implementations — v1 only satisfies LOG.
- Promoting to Tier 3 (`fees_published`) — that is adversarial-gated, separate scope.
- Rewriting the taxonomy or canonical keys — reuses what `classify_nulls.py` already validates.

## Decisions (from brainstorming)

| Question | Answer |
|---|---|
| Scope | Classifier + orchestrator only; outlier/source-verify/5-step deferred |
| Run shape | Admin UI trigger + Modal cron, both importing the same Python classifier module |
| Confidence policy | ≥ 0.90 → auto-promote to `fees_verified`; below → `classification_cache` only |
| UI shape | Full agent console — stats cards, decision stream, 5-step loop panels (empty states for REVIEW/DISSECT/UNDERSTAND/IMPROVE until later slices) |
| Run semantics | Fixed-size batches via dropdown (100/500/1000); button disabled during run; optional chain-N-batches |
| Budget | Per-run soft cap only; no hard ceiling; monitored via UI gauge |
| Failure cap | Circuit breaker: 5 consecutive failures OR >20% error rate in last 50 rows OR 3 consecutive post-retry 429s → halt via `agent_registry.status='halted'`; admin clicks Reset |
| Rate limits | Exp backoff + jitter on 429/529, honor `retry-after`, max 3 retries per call, 200ms inter-batch delay, serial batches within a run |
| Implementation | Approach 2 — Next.js server action → Python FastAPI sidecar (Modal web endpoint) → shared `fee_crawler/agents/darwin.py` module |

## Architecture

```
┌──────────────────────────────┐      ┌───────────────────────────────┐
│ Next.js admin app            │      │ Python sidecar (Modal web)    │
│  /admin/darwin  (RSC + SSE)  │◄────►│  POST /darwin/classify-batch  │
│  server action → sidecar     │ HTTP │  GET  /darwin/status          │
└──────────────┬───────────────┘      │  POST /darwin/reset           │
               │                      └──────────────┬────────────────┘
               │                                     │ imports
               │                                     ▼
               │                    ┌──────────────────────────────────┐
               │                    │ fee_crawler/agents/darwin.py     │
               │                    │  select_candidates()             │
               │                    │  classify_batch() (Haiku)        │
               │                    │  _promote_or_cache()             │
               │                    │  via agent_tools write gateway   │
               │                    └──────────────┬───────────────────┘
               │                                   │
               ▼                                   ▼
        ┌─────────────────────────────────────────────────┐
        │ Postgres (Supabase)                             │
        │  fees_raw → fees_verified (promote_to_tier2)    │
        │  classification_cache                           │
        │  agent_events, agent_auth_log                   │
        │  agent_registry (halt state)                    │
        └─────────────────────────────────────────────────┘
                            ▲
                            │
               ┌────────────┴────────────┐
               │ Modal scheduled fn      │
               │  darwin_nightly_drain() │  (3am ET)
               │  imports darwin.py      │
               └─────────────────────────┘
```

Three processes, one shared classifier module. The sidecar and the cron import `darwin.py` — no duplication.

## Components

### 1. `fee_crawler/agents/darwin.py` (new)

Pure async Python, no HTTP. Public surface:

```python
async def select_candidates(conn, limit: int) -> list[CandidateRow]
async def classify_batch(
    conn,
    size: int,
    *,
    on_event: Callable[[BatchEvent], Awaitable[None]] | None = None,
) -> BatchResult

@dataclass
class BatchResult:
    processed: int
    cache_hits: int
    llm_calls: int
    promoted: int
    cached_low_conf: int
    rejected: int           # validation failures (unknown key, NEVER_MERGE)
    failures: int           # hard errors (transient LLM, DB)
    cost_usd: float
    duration_s: float
    circuit_tripped: bool
    halt_reason: str | None
```

Candidate selection uses `SELECT ... FOR UPDATE SKIP LOCKED` so cron and UI runs cannot double-classify.

Internal helpers reuse `normalize_fee_name`, `_validate_llm_result`, `_classify_batch_with_llm` from `fee_crawler/commands/classify_nulls.py`. Those functions are re-exported or lifted verbatim with the write path swapped from `UPDATE extracted_fees` to the agent-tool path.

`_promote_or_cache(fee_raw_id, key, confidence, reasoning)`:
- `confidence >= 0.90` and `key is not None` and validation passes → `promote_fee_to_tier2` (writes `fees_verified` + `agent_events` + `agent_auth_log`).
- otherwise → `upsert_classification_cache` with the normalized name, key (may be null), confidence, and reasoning.

### 2. `fee_crawler/darwin_api.py` (new)

FastAPI app, three endpoints, deployed as Modal web endpoint. No in-app auth — the Next.js server action in front enforces admin role before calling.

- `POST /darwin/classify-batch { size: int }` → SSE stream; events: `batch_start`, `candidates_selected`, `cache_lookup_done`, `llm_call_start`, `llm_call_done`, `row_complete`, `halted`, `done`.
- `GET /darwin/status` → JSON: `{ pending, today_promoted, today_cost_usd, circuit: { halted, reason, halt_at, halt_context }, recent_run_avg_tokens_per_row }`.
- `POST /darwin/reset { actor: string }` → clears halt state, writes `agent_events` row with `agent_name='admin_<actor>'` as the audit trail.

### 3. `src/app/admin/darwin/` (new)

```
page.tsx                    — RSC: layout, initial stats from /darwin/status
actions.ts                  — server action: admin-auth check, then proxy SSE from sidecar
components/
  darwin-console.tsx        — client: EventSource orchestration, state machine
  batch-runner.tsx          — client: size dropdown (100/500/1000), Run button,
                              chain-N checkbox, per-run cost estimate
  decision-stream.tsx       — client: live-appending table, colored rows,
                              hover for reasoning
  loop-panels.tsx           — RSC: 5-step panels; LOG panel shows recent
                              agent_events; REVIEW/DISSECT/UNDERSTAND/IMPROVE
                              show empty state "activates after later slices"
  budget-gauge.tsx          — client: polls /darwin/status every 10s
  circuit-banner.tsx        — client: red banner + Reset button when halted
```

Nav item added to `AdminNav` (exact-match guard because `/admin/fees` prefix bug is documented).

### 4. Modal cron — `fee_crawler/modal_app.py` (edit)

Add one function:

```python
@app.function(schedule=modal.Cron("0 7 * * *"))  # 7 UTC = 3 ET
async def darwin_nightly_drain():
    async with get_connection() as conn:
        result = await darwin.classify_batch(conn, size=500)
    emit_result(result.to_dict())
```

No UI interaction; result goes to stdout (Modal captures). Runs once daily.

## Data flow per batch

1. Sidecar opens a PG connection.
2. `SELECT fr.* FROM fees_raw fr LEFT JOIN fees_verified fv ON fv.fee_raw_id = fr.fee_raw_id WHERE fv.fee_verified_id IS NULL ORDER BY fr.fee_raw_id LIMIT $1 FOR UPDATE OF fr SKIP LOCKED`.
3. Normalize each `fee_name` → `normalized_name`.
4. Batch lookup `classification_cache WHERE normalized_name = ANY($1)`.
5. Split into `cache_hits` and `cache_misses`.
6. Group misses into sub-batches of 50, one LLM call each (retry on 429/529, validate each result, write cache entry whether key is returned or null).
7. Merge cache hits and fresh LLM results.
8. For each row, `_promote_or_cache` (emit `row_complete` SSE per row).
9. Return `BatchResult`, emit `done`.

Idempotency: re-running is a no-op because promoted rows are excluded. `SKIP LOCKED` prevents concurrent runs from stepping on each other.

## Error handling

| Class | Trigger | Action |
|---|---|---|
| Transient LLM | 429, 529, timeout, connection reset | Exp backoff w/ jitter, honor `retry-after`, max 3 retries per call |
| Validation | Unknown canonical key / NEVER_MERGE | Cache as null, count in `rejected`, batch continues |
| Permanent LLM | 400, 401, 402 | Halt run, surface error to UI |
| DB | Connection loss, `promote_to_tier2` raises | Rollback batch, count as `failures`, surface error |
| Circuit tripped | 5 consecutive row failures OR >20% errors in last 50 rows OR 3 consecutive post-retry 429s | Write `agent_registry.status='halted'`, emit `halted` SSE event, require admin Reset |

Circuit-breaker state in `agent_registry` (`halt_reason`, `halt_at`, `halt_context::jsonb`). Reset is logged to `agent_events` with the admin user as actor.

## 5-step loop status in v1

| Step | Status |
|---|---|
| LOG | ✅ satisfied — every `promote_fee_to_tier2`, `upsert_classification_cache`, and failure already writes `agent_events` |
| REVIEW | ❌ next slice |
| DISSECT | ❌ next slice |
| UNDERSTAND | ❌ next slice |
| IMPROVE | ❌ next slice |

UI reserves the panel real-estate so follow-on slices are additive, not restructuring.

## Testing strategy

**Unit (no DB, no network):**
- `_validate_llm_result_unknown_key`, `_validate_llm_result_never_merge_nsf_overdraft`
- `cost_estimate_from_history` within ±10%
- `circuit_breaker_state_machine` — state transitions from `(recent_outcomes, config)`

**Integration (real Postgres, mocked Anthropic):**
- `select_candidates_skips_promoted`
- `classify_batch_happy_path` (50 rows, all ≥0.90)
- `classify_batch_cache_reuse` — second run on same normalized names triggers zero LLM calls
- `classify_batch_low_confidence_caches_only`
- `classify_batch_never_merge_rejected`
- `classify_batch_circuit_trips_on_consecutive_failures`
- `classify_batch_skip_locked_concurrent` — 2 concurrent callers, zero double-promotion
- `promote_emits_agent_events_row`

**E2E (real Postgres + real Haiku), opt-in via `DARWIN_E2E=1`:**
- 10 hand-labeled fee names, ≥ 80% accuracy; manual run before model version bumps; not a CI gate.

**UI tests (vitest + Testing Library):**
- `darwin_page_renders_empty_state`
- `darwin_page_renders_live_stream` (mocked EventSource)
- `circuit_banner_shows_on_halted`
- `batch_size_dropdown_persists` (localStorage)

Coverage targets: 85%+ on `darwin.py`, 70%+ on `darwin_api.py`.

## Dependencies on existing work

- `promote_fee_to_tier2` tool + SQL function (Phase 62A-07, 62A-12) — assumed working; tests confirm.
- `upsert_classification_cache` tool (Phase 62A-10) — same.
- `agent_events`, `agent_auth_log`, `agent_registry` tables (Phase 62A) — same.
- `normalize_fee_name`, `CANONICAL_KEY_MAP`, `NEVER_MERGE_PAIRS` (existing `fee_analysis.py`).

## Out of scope (explicit)

- Knox (state-agent fleet) — Phase 63, separate.
- Atlas (orchestration / scheduling / knowledge promotion) — Phase 65, separate.
- Hamilton refactor to consume `fees_verified` instead of `extracted_fees` — Phase 66, separate.
- Rewriting or cleaning up the frozen `extracted_fees` table — legacy, not touched.
- Auth on the sidecar endpoint — assumed network-isolated behind Next.js; public exposure is a follow-on hardening step.

## Open questions (documented; not blocking plan)

- Modal cron cadence is currently 1×/day at 3am ET — probably correct now, but once Knox produces a steady inflow we may want hourly. Revisit after first live week.
- `recent_run_avg_tokens_per_row` starts with no history — first-run cost estimate uses a conservative upper bound (`$0.002/row`). After run 1, UI switches to observed rate.
- Darwin's reasoning prompts currently embed the full taxonomy; if that token count becomes the dominant cost, move to prompt caching via `anthropic-beta: prompt-caching-2024-07-31`. Not urgent at Haiku pricing.
