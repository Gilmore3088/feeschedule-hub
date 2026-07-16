# Ingestion Engine — Architecture & Migration Plan

**Status:** Proposed
**Date:** 2026-07-16
**Scope:** The fee-crawler backend — how institutions are discovered, fetched, read, extracted, verified, and rolled up into the published index.
**Goal:** A high-performance, accurate capture-and-update engine built from **stateless capability workers** dispatched by **stateful per-state supervisors**, coordinated through a **queue**, rolling up to a **national publish**.

> This plan consolidates three overlapping generations of pipeline (CLI commands, `state_agent`, Phase-62 agent platform) onto primitives that **already exist** in the repo — the `jobs` queue, the `knowledge/states/*.md` learning system, and the `fees_raw → fees_verified → fees_published` tier tables. It is a consolidation, not a greenfield rewrite. See §7 for the exact replace/keep/delete mapping.

---

## 1. Mental model

Two kinds of "agent", deliberately separated:

- **Capability workers** — stateless, specialized, one job = one thing. `fetch`, `read` (pdf/html/js), `extract`, `build-report`. They hold no memory, make no strategy decisions, and scale independently to their own queue depth. Fetch and read are **deterministic with an escalation ladder**; only `extract` and `build-report` are LLM jobs.
- **State supervisors** — one stateful agent per state (50 + DC/territories). Owns its work-list, decides what to do this cycle, dispatches jobs to workers, and **accumulates state-specific knowledge** that makes each cycle faster and more accurate. This is where the intelligence lives.

Everything rolls up: state supervisors write verified fees into per-state staging; a **national roll-up** aggregates, dedupes, computes the index, and **publishes atomically**.

```
  ┌── State Supervisor (×51) ──────────────────────────────────┐
  │  read state_knowledge → plan work → enqueue jobs → learn    │
  └───────────────┬────────────────────────────────────────────┘
                  │ enqueues typed jobs into `jobs` (queue column)
     ┌────────────┼─────────────┬──────────────┬───────────────┐
     ▼            ▼             ▼              ▼               ▼
 [q:fetch]   [q:read]      [q:extract]    [q:verify]     [q:report]
   fetcher    reader        extractor      verifier      report-builder
  (IO,        (CPU/OCR,    (LLM batch,     (rules+       (LLM, on-demand,
  browser     deterministic token-bound)   Darwin/Knox)  national tier)
  escalation)  escalation)
     │            │             │              │
     └────────────┴─────────────┴──────────────┘
                  writes → fees_raw → fees_verified (per state)
                                     │
                          ┌──────────▼───────────┐
                          │  National roll-up      │
                          │  dedupe → index →      │
                          │  validate → PUBLISH    │  (atomic swap)
                          └────────────────────────┘
```

**Design invariant:** every published number traces to a document snapshot whose bytes we still hold, and the live index is only ever changed by one atomic publish.

---

## 2. What already exists (build on this)

| Primitive | Where | Reuse decision |
|---|---|---|
| `jobs` queue (`queue`, `entity_id`, `payload`, `status`, `priority`, `attempts`, `locked_by/at`) | `scripts/migrate-schema.sql` | **Keep & extend** — this is the backbone. Add `SKIP LOCKED` claim + heartbeat. |
| `knowledge/states/*.md` + `national.md` + `loader.py`/`promoter.py`/`pruner.py` | `fee_crawler/knowledge/` | **Keep the concept, structure the storage** — promote freeform md into `state_knowledge` tables (§4.3) while keeping md as a human-readable export. |
| `fees_raw → fees_verified → fees_published` tiers with lineage (`document_r2_key`, `source_url`, `extraction_confidence`, `agent_event_id`) | `supabase/migrations/20260420_fees_tier_tables.sql` | **Keep** — this is the provenance backbone already. |
| `platform_registry` (`fee_paths`, `extraction_method` per platform) | `scripts/migrate-schema.sql` | **Keep** — feeds the fetcher/reader escalation defaults. |
| `crawl_targets` (institution directory, `state_code`, `last_content_hash`, `consecutive_failures`) | `scripts/migrate-schema.sql` | **Keep** — the work-list source per state. `last_content_hash` is the change-gate anchor. |
| `agent_tools/pool.py` (txn pool + session pool for LISTEN/NOTIFY) | `fee_crawler/agent_tools/` | **Keep** — worker wake-up + DB access. |
| `review_status.py`, `validation.py`, `job_result.py` | `fee_crawler/` | **Keep** — verify stage + IPC. |
| Darwin (classify→verify), Knox (adversarial review), Magellan (dead-URL rescue) | `fee_crawler/agents/{darwin,knox,magellan}/` | **Refactor into workers** — see §7. |

---

## 3. Target architecture

### 3.1 Queue as the spine
One `jobs` table, one row per unit of work, `queue` names the capability. Workers claim by type:

```sql
-- Worker claim (the standard Postgres queue pattern; add to a claim helper)
UPDATE jobs SET status='running', locked_by=$worker, locked_at=NOW()
WHERE id = (
  SELECT id FROM jobs
  WHERE queue=$queue AND status='pending' AND run_at<=NOW()
  ORDER BY priority DESC, run_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1
)
RETURNING *;
```

- **Wake-up:** `NOTIFY jobs_<queue>` on enqueue; workers `LISTEN` on the **session pool** (port 5432) and poll on a fallback interval. (Transaction pool cannot hold LISTEN — this is why the session pool exists.)
- **Scaling:** each queue is a separate Modal function autoscaled on `SELECT count(*) FROM jobs WHERE queue=$q AND status='pending'`. Idle → 0 workers; a flooded state → many. This is "launch when needed."
- **Chaining:** a worker's success enqueues the next stage's job (fetch → read → extract → verify). Stages are decoupled: read can back up while fetch races ahead.

### 3.2 Heartbeat + reaper (kills the orphaned-`running` bug)
Every worker updates `locked_at` every 30s while processing. A **reaper** (one cheap cron) resets any `status='running'` job whose `locked_at` is older than a timeout back to `pending` (or `failed` past `max_attempts`). No job is ever silently stuck — this replaces the audit's 18-orphaned-`crawl_runs`-rows failure mode by construction.

---

## 4. Data model changes

### 4.1 `jobs` — extend the existing table
```sql
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS state_code CHAR(2);        -- shard tag
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS run_id     BIGINT;         -- which cycle
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS parent_job_id BIGINT;      -- provenance of the chain
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS heartbeat_at TIMESTAMPTZ;  -- reaper anchor
CREATE INDEX IF NOT EXISTS jobs_claim_idx ON jobs (queue, status, priority DESC, run_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS jobs_reaper_idx ON jobs (status, heartbeat_at)
  WHERE status = 'running';
```
`queue` values: `resolve | fetch | read | extract | verify | rollup | report`.

### 4.2 `documents` — content-addressed capture (new)
Bytes live in R2 keyed by hash; identical documents dedupe.
```sql
CREATE TABLE IF NOT EXISTS documents (
  id                BIGSERIAL PRIMARY KEY,
  crawl_target_id   BIGINT NOT NULL REFERENCES crawl_targets(id),
  state_code        CHAR(2) NOT NULL,
  source_url        TEXT NOT NULL,
  content_sha256    TEXT NOT NULL,          -- hash of NORMALIZED text (the change-gate)
  raw_sha256        TEXT NOT NULL,          -- hash of raw bytes
  r2_key            TEXT NOT NULL,          -- content-addressed: documents/<raw_sha256>
  http_status       INT,
  render_mode       TEXT,                   -- http | browser
  doc_type          TEXT,                   -- pdf | html | js
  fetched_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  run_id            BIGINT,
  UNIQUE (crawl_target_id, content_sha256)  -- unchanged doc is a no-op insert
);
CREATE INDEX documents_target_time_idx ON documents (crawl_target_id, fetched_at DESC);
```

### 4.3 `state_knowledge` — structure the per-state learning (new)
Replaces (augments) the freeform `knowledge/states/*.md`. Two tables: durable per-institution facts, and per-state cycle notes.

```sql
-- Durable, queryable, per-institution learned facts. Read before dispatch.
CREATE TABLE IF NOT EXISTS institution_hints (
  crawl_target_id   BIGINT PRIMARY KEY REFERENCES crawl_targets(id),
  state_code        CHAR(2) NOT NULL,
  known_fee_url     TEXT,                   -- skip re-discovery
  render_mode       TEXT,                   -- http | browser  (skip escalation)
  doc_type          TEXT,                   -- pdf | html | js
  needs_ocr         BOOLEAN DEFAULT FALSE,
  fee_name_aliases  JSONB DEFAULT '{}',     -- local name → canonical hints for extractor
  last_good_run_id  BIGINT,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX institution_hints_state_idx ON institution_hints (state_code);

-- Per-state, per-cycle rollup notes (the "Run #N" log, now structured + queryable).
CREATE TABLE IF NOT EXISTS state_run_notes (
  id            BIGSERIAL PRIMARY KEY,
  state_code    CHAR(2) NOT NULL,
  run_id        BIGINT NOT NULL,
  discovered    INT DEFAULT 0,
  extracted     INT DEFAULT 0,
  failed        INT DEFAULT 0,
  patterns      JSONB DEFAULT '[]',         -- structured learnings this cycle
  promoted      JSONB DEFAULT '[]',         -- candidates for national.md
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX state_run_notes_state_idx ON state_run_notes (state_code, run_id DESC);
```
`knowledge/states/*.md` becomes a **generated export** of these tables (human-readable), not the source of truth — so the notes are queryable and drive dispatch decisions, not just documentation.

### 4.4 Fees + run tracking
- **Keep** `fees_raw → fees_verified → fees_published` unchanged — they already carry provenance. Extractor writes `fees_raw`; verify stage promotes to `fees_verified`; national roll-up publishes.
- **Add** an explicit foreign key from `fees_raw.crawl_event_id` to `documents.id` so every fee traces to a content-addressed snapshot (today it references `crawl_results`).
- **Replace** `crawl_runs`/`crawl_results` freshness tracking with a single `pipeline_runs` row per (state, cycle) written in try/finally (§6.3).

---

## 5. Job-type state machine

Every job: `pending → running → (succeeded | failed | dead)`. `failed` with `attempts < max_attempts` → back to `pending` with backoff (`run_at = NOW() + 2^attempts min`). `dead` (exhausted) → routed to a human/triage queue, never silently dropped.

```
resolve  ──success──▶ fetch   (enqueues fetch with resolved URL)
fetch    ──success──▶ read    (enqueues read with r2_key + doc_type)
         ──unchanged─▶ (STOP — change-gate hit, no downstream work)
         ──deadurl──▶ magellan-rescue (escalation), else mark target failing
read     ──success──▶ extract (enqueues extract with clean text + region span)
extract  ──success──▶ verify  (writes fees_raw, enqueues verify)
verify   ──success──▶ (promotes to fees_verified; no downstream job)
         ──lowconf──▶ human-review queue
rollup   (national, scheduled) ──▶ publish
report   (on-demand, independent of the above chain)
```

**Change-gate is the throughput lever:** `fetch` normalizes the fetched text, hashes it, compares to `crawl_targets.last_content_hash` / `documents.content_sha256`. Match → the chain **stops at fetch**; no read/extract/verify jobs are created. In steady state 85–95% of targets stop here.

---

## 6. Contracts

### 6.1 Capability worker contract (all workers)
```
claim(job) → validate(payload) → do_one_thing() → write_result() → enqueue_next() → ack
             │ heartbeat every 30s throughout                       │
             └ on error: classify (retryable|permanent) ────────────┘
                retryable → release to pending w/ backoff
                permanent → dead + triage note
```
Workers are **idempotent**: re-running the same job produces the same result (writes keyed on stable identity, not blind insert). No worker knows about any other worker — it consumes a typed job and emits typed jobs.

| Worker | Input | Output | Escalation ladder | Bound |
|---|---|---|---|---|
| **resolve** | target id | fee URL + confidence | `institution_hints.known_fee_url` → heuristic paths (`platform_registry.fee_paths`, `/fees`, `/disclosures`) → LLM discovery | LLM only on heuristic miss |
| **fetch** | target id, URL | `documents` row + r2_key, or `unchanged` | `institution_hints.render_mode` → HTTP → headless browser | browser only on HTTP-empty |
| **read** | r2_key, doc_type | clean text + fee-region span | text-extract (pdfplumber/bs4) → OCR (tesseract) → vision-LLM | OCR only on empty text; vision only on OCR-fail |
| **extract** | text region, state aliases | `fees_raw` rows (strict JSON schema, confidence, char span) | Haiku batch → Sonnet on low-confidence | Batch API default |
| **verify** | fees_raw ids | promote to `fees_verified` or flag | rules (`validation.py`) → Darwin classify → Knox adversarial | deterministic first |
| **report** | published slice | narrative report | LLM (national tier), on-demand | independent queue |

### 6.2 State supervisor contract (one per state, scheduled per cycle)
```
for each cycle (run_id):
  targets   = crawl_targets WHERE state_code=$s AND status='active'
  hints     = institution_hints WHERE state_code=$s          # read learned facts
  worklist  = select_work(targets, hints)                    # new, changed-last-time, failed, stale
  for t in worklist: enqueue(resolve|fetch, t, priority by hints)
  await drain(run_id)                                        # via job completion notifications
  notes     = summarize(run_id)                              # discovered/extracted/failed + patterns
  update institution_hints (render_mode, known_fee_url, needs_ocr, aliases)  # WRITE learnings
  insert state_run_notes(run_id, notes)
  promote(notes.promoted → national)                         # cross-state patterns
```
The supervisor is the **only** stateful actor. Its two writes — `institution_hints` (durable, drives next dispatch) and `state_run_notes` (cycle log) — are the compounding-improvement mechanism. Cycle 1 does heavy discovery; cycle N is mostly cache hits because the supervisor wrote down what worked.

### 6.3 Run tracking (try/finally, replaces silent crons)
```python
run = pipeline_runs.start(state, cycle)          # status='running', heartbeat
try:
    ... dispatch + drain ...
    run.finish("completed", stats)
except Exception as e:
    run.finish("failed", error=str(e))           # ALWAYS marks terminal
    raise                                          # fail loud (no swallow)
```
A reaper fails any `pipeline_runs` row stuck `running` past timeout. Freshness dashboards read `pipeline_runs`, so they can never show a stuck job as healthy.

### 6.4 National roll-up + atomic publish
```
1. gather fees_verified across all states (per-state staging already isolated)
2. dedupe on (institution_id, canonical_fee_key)
3. recompute index aggregates into fees_published_staging
4. validate staging (row counts within tolerance, no null medians, sanity floors)
5. BEGIN; swap staging → fees_published; refresh materialized index; COMMIT
6. revalidate + trigger app ISR revalidation
```
The app never reads mid-write. A bad state run is contained to its own partition and fails validation at step 4 before it can reach the live index.

---

## 7. What is being REPLACED / KEPT / DELETED

| Current (audit-identified) | Disposition | Replaced by |
|---|---|---|
| `modal_app.py` every-minute `run_post_processing` scheduler-within-a-scheduler | **REPLACE** | Per-queue autoscaled workers + a thin reaper cron. No time-window multiplexing. |
| Gen-1 CLI crawl (`commands/crawl.py` + `pipeline/extract_pdf.py|extract_html.py|extract_llm.py`) | **REPLACE** | `fetch`/`read`/`extract` workers. |
| Gen-2 `agents/state_agent.py` + `discover/classify/extract_*` | **REPLACE** | State **supervisor** (orchestration/memory) + capability workers (the doing). |
| Gen-2 `agents/extract_pdf.py|extract_html.py|extract_js.py` **and** `pipeline/extract_*` (two parallel stacks) | **REPLACE (collapse to one)** | Single `read` worker with doc-type escalation. |
| Darwin (classify→verify) | **REFACTOR → `verify` worker** | Runs inside verify stage; keep the model + retry logic. |
| Knox (adversarial review) | **REFACTOR → `verify` worker (2nd pass)** | Low-confidence gate inside verify. |
| Magellan (dead-URL rescue) | **REFACTOR → `fetch` escalation rung** | Invoked by fetch on dead URL. |
| `darwin_api.py` + `magellan_api.py` near-duplicate FastAPI sidecars | **DELETE** | Not needed — workers are queue-driven, not HTTP sidecars. Removes the unauthenticated-endpoint risk from the audit. |
| `agents/darwin/circuit.py` (divergent duplicate) | **DELETE** | Use `agents/_common/circuit.py` only. |
| `workers/extraction_worker.py` (stub, 0 callers) | **DELETE** | `extract` worker. |
| `workers/llm_batch_worker.py` (0 callers — the only Batch impl) | **PROMOTE** | Becomes the `extract` worker's batch path (finally wired). |
| `workers/alert_sender.py` (unwired) | **KEEP + WIRE** | Failure alerting (§9). |
| `knowledge/states/*.md` as source of truth | **REPLACE storage** | `institution_hints` + `state_run_notes`; md becomes generated export. |
| `crawl_runs`/`crawl_results` freshness | **REPLACE** | `pipeline_runs` (try/finally). |
| Root strays `_run_il_3x.py`, `_run_states.py`, `_run_states_original.py`, `_run_il_3x.log` | **DELETE** | Supervisor is the entry point. |
| `db.py` SQLite dialect-translation shim (37 legacy callers) | **RETIRE with the CLI commands** | Workers use `agent_tools/pool.py` directly (native Postgres). |
| `jobs` table, `platform_registry`, `fees_raw/verified/published`, `agent_tools/pool.py`, `review_status.py`, `validation.py`, `job_result.py` | **KEEP** | Reused as-is (extended where noted). |

---

## 8. Migration phases & atomic tasks

Each task is independently shippable with a stated done-condition. Ship in order; each phase leaves the system runnable.

### Phase 0 — Foundations (queue + provenance)
- [ ] **T0.1** Add a `claim_job(queue, worker_id)` helper using `FOR UPDATE SKIP LOCKED`. *Done:* two workers cannot claim the same job under concurrent load (integration test).
- [ ] **T0.2** Add `heartbeat(job_id)` (30s) + a `reap_stale_jobs()` cron. *Done:* a killed worker's job returns to `pending` within timeout.
- [ ] **T0.3** Apply `jobs` ALTERs (§4.1) + claim/reaper indexes. *Done:* migration applied, recorded in `schema_migrations`.
- [ ] **T0.4** Create `documents` table (§4.2); write an R2 content-addressed put helper. *Done:* fetching the same bytes twice yields one R2 object.
- [ ] **T0.5** Create `pipeline_runs` table + start/finish helpers (try/finally). *Done:* a forced exception leaves the row `failed`, not `running`.

### Phase 1 — Capability workers (behind the queue, no supervisor yet)
- [ ] **T1.1** `fetch` worker: HTTP→browser escalation, normalize+hash, write `documents`, emit `unchanged` on hash match. *Done:* unchanged doc creates no `read` job.
- [ ] **T1.2** `read` worker: pdf/html/js → clean text + fee-region span; OCR + vision escalation. *Done:* a scanned PDF yields text via OCR.
- [ ] **T1.3** `extract` worker: promote `llm_batch_worker` to the batch path; strict JSON schema; write `fees_raw` with `document_id` + char span. *Done:* malformed model output self-retries; every `fees_raw` row has a `documents` FK.
- [ ] **T1.4** `verify` worker: `validation.py` rules → Darwin → Knox; promote to `fees_verified` or flag low-confidence. *Done:* an out-of-range amount is flagged, not published.
- [ ] **T1.5** Delete `darwin_api.py`, `magellan_api.py`, `agents/darwin/circuit.py`, `workers/extraction_worker.py`. *Done:* no references remain (grep clean); sqlite-kill guard extended to block sidecars.

### Phase 2 — State supervisor + structured knowledge
- [ ] **T2.1** Create `institution_hints` + `state_run_notes` (§4.3). Backfill `institution_hints` from existing `knowledge/states/*.md` via a one-shot parser. *Done:* every state's md facts are queryable rows.
- [ ] **T2.2** State supervisor: read hints → `select_work` → enqueue → drain → write hints + notes (§6.2). *Done:* running IA twice — second run skips discovery for targets with `known_fee_url`.
- [ ] **T2.3** Generate `knowledge/states/*.md` + `national.md` **from** the tables (export, not source). *Done:* md regenerates deterministically from DB.
- [ ] **T2.4** Delete `agents/state_agent.py`, root `_run_*` strays + log; retire Gen-1 `commands/crawl.py` + `pipeline/extract_*` + Gen-2 `agents/extract_*`. *Done:* one extraction path remains.

### Phase 3 — National roll-up + publish
- [ ] **T3.1** `rollup` job: gather `fees_verified` → dedupe → `fees_published_staging`. *Done:* dedupe collapses duplicate (institution, canonical_key).
- [ ] **T3.2** Staging validation gate (counts, null-median, sanity floors). *Done:* a run that drops >X% of rows fails the gate.
- [ ] **T3.3** Atomic swap + index refresh + ISR revalidation. *Done:* app never observes a partial index (concurrent-read test).

### Phase 4 — Scheduling & scaling
- [ ] **T4.1** Replace the every-minute `run_post_processing` with per-queue autoscaled Modal functions (scale on queue depth) + one reaper cron + one national-rollup cron. *Done:* idle → 0 workers; a 200-PDF state floods only the `read` queue.
- [ ] **T4.2** Per-state supervisor schedule (staggered) so all 51 run per cycle independently. *Done:* one state's failure does not block another's run.

### Phase 5 — Reliability & cleanup
- [ ] **T5.1** Wire `alert_sender` → Sentry/Slack on `dead` jobs and `failed` `pipeline_runs`. *Done:* a forced failure pages within the cycle.
- [ ] **T5.2** Golden-set regression: re-extract ~75 pinned institutions per cycle, diff vs known-good by `extractor_version`. *Done:* a deliberate extractor regression is caught before publish.
- [ ] **T5.3** Retire `db.py` SQLite shim once no CLI command remains. *Done:* `_translate_placeholders` deleted; grep guard blocks its return.

---

## 9. Guarantees this design provides

- **Provenance:** every `fees_raw/verified/published` row → `documents` row → R2 bytes by hash. Any published number is traceable and re-verifiable.
- **Idempotency:** workers key writes on stable identity; a re-run (crash recovery, retry) never duplicates or corrupts.
- **Blast radius:** state runs are isolated to per-state staging; a bad run fails the national validation gate before it can reach the live index.
- **No silent failure:** `pipeline_runs` + job `dead` state + reaper + alerting mean a broken stage is loud and attributable — directly fixing the audit's silent-cron and orphaned-`running` findings.
- **Compounding accuracy:** `institution_hints` turns each cycle's learnings into next cycle's defaults; `state_run_notes` gives per-state trend visibility.
- **Throughput:** change-gating skips 85–95% of unchanged docs; per-queue autoscaling matches compute to demand; batch extraction and bulk upserts keep the write phase short.

## 10. Cutover & rollback
- Run the new engine **shadow** for one cycle: workers write to `fees_raw`/`documents`, but the national publish stays on the old path. Diff new vs old `fees_verified`.
- Flip publish to the new roll-up once the golden set and shadow diff are clean.
- Rollback = point the `rollup` cron back at the legacy path; `fees_published` swap is atomic and versioned, so reverting is one swap.
