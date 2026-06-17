# Pipeline Rebuild — Architecture & Phase 1 Spec

**Date:** 2026-06-02
**Status:** Draft for review
**Owner goal:** "Streamline, simplify, and perhaps rebuild the pipeline. I don't know how to
trigger it, monitor it, or get visibility on each step. I feel like we keep adding more onto a
broken shell."

---

## 1. The problem (why it feels broken)

The pipeline today is **7 independent agents wired to 4 separate Modal cron windows by hardcoded
clock times** (2am / 3am / 4am, then SQL time-gates at 05:00 / 06:00 UTC). Concretely:

- **No single "run the pipeline."** To run the whole thing you trigger each piece and hope they
  chain. The owner's "I don't know how to trigger it" is literally true — there is no trigger.
- **The monitoring UI reads a dead table.** `/admin/ops` reads `ops_jobs`; the live agents write
  to `agent_events` + `workers_last_run` instead, so the ops screen is permanently empty.
- **State is fragmented across 3 places** — `workers_last_run` (gate markers), `agent_events`
  (granular audit), `ops_jobs` (graveyard). None gives a "here is each step, here is where it is
  right now" view.
- **A ghost of a previous fix exists.** `fee_crawler/pipeline/executor.py` defines a real staged
  pipeline with lock-file + resume — and nothing calls it. A `pipeline_runs` table is declared in
  `scripts/migrate-schema.sql` for that executor; it is wired to dead code.
- **The existing `/admin/pipeline` control plane can't run on Vercel.** `src/app/admin/pipeline/
  actions.ts` triggers work via `spawnJob()` which shells out to `python -m fee_crawler ...` as a
  subprocess. Vercel has no persistent Python and no long-lived subprocesses — this is a dead end.

**Key fact:** the *agents themselves work* (Darwin, Knox, Magellan, extractor, discoverer produce
data). What's broken is the **orchestration layer and the control plane** around them — how you
start it, how state is recorded, and how you see it.

## 2. Decisions (locked with owner)

| Decision | Choice |
|---|---|
| Aggressiveness | **Full rebuild, agents included** — every stage rebuilt against a clean contract. |
| First win | **A real control room** — one `/admin/pipeline` page that both triggers and monitors. |
| Execution surface | **Vercel, not Modal.** Modal is deleted. |
| Orchestration engine | **Vercel Workflow DevKit** (durable: retry, replay, run dashboard for free). |
| Heavy stages | Run inside **Vercel Sandbox** microVMs (Chromium + PDF/OCR), no Modal. |

**"Agents included" nuance (owner-approved):** every stage gets rebuilt against the new contract
with new orchestration, state, and tests. Where a stage's core is a *working pure function* (the
Playwright fetch that beat bot-blockers, the tesseract OCR fallback), that logic is **re-homed into
the new module / run inside the Sandbox** rather than re-derived from zero. We rebuild the
architecture without retyping battle-won parsers.

**Engine risk is bounded:** the stage contract and the two state tables are **engine-agnostic**. A
stage is always `run(ctx) → {rowsIn, rowsOut}` writing to `pipeline_steps`, regardless of what
drives it. So the orchestration engine is a thin, swappable adapter. Phase 1 proves the DevKit on
one stage before committing the rest; swapping to plain functions + DB-queue later is contained.

## 3. Target architecture (the model)

```
 admin button ─┐                         ┌─ classify (Darwin)  "use step"  (LLM + DB)
 Vercel Cron  ─┼─► start(pipelineRun) ──►│─ review   (Knox)    "use step"  (LLM + DB)
 API trigger  ─┘     (one code path)     │─ publish / snapshot "use step"  (DB only)
                                         │─ discover / crawl   "use step" ─► Vercel Sandbox
                                         └─ extract (browser/PDF/OCR)      ─► Vercel Sandbox
                          │
                          ▼  every step writes status + counts
            ┌───────────────────────────────┐
            │ pipeline_runs / pipeline_steps │ ◄── /admin/pipeline reads live
            └───────────────────────────────┘
```

**Four properties that fix the problem:**

1. **One orchestrator.** A `"use workflow"` function runs stages in sequence. This is the "run the
   pipeline" that doesn't exist today; it replaces dead `executor.py`.
2. **One stage contract.** Every stage is a small, testable `Stage` — readable in one screen.
3. **One trigger path.** Admin button and Vercel Cron both call `start(pipelineRun, params)`.
   Manual and scheduled are identical code.
4. **One source of product truth.** `pipeline_runs` / `pipeline_steps` hold run + per-step status
   and counts; the control room reads them with the existing `sql` client. (Workflow's own run
   state remains the execution engine's truth and powers the free dashboard; we link out to it.)

## 4. Phase decomposition

Each phase is its own spec → plan → implementation. The **old Modal crons keep running untouched**
until Phase 5 proves the new path matches — so there is never a window without a working pipeline.

1. **Control-plane foundation (THIS SPEC).** Two tables + stage contract + orchestrator + control
   room v1 + trigger action, proven end-to-end on one real safe stage (`publish`).
2. **Light stages.** Port `classify` (Darwin) and `review` (Knox) to `"use step"` (LLM + DB).
3. **Heavy stages.** `discover` / `crawl` and `extract` (browser + PDF/OCR) running in Vercel
   Sandbox; re-home the proven Python extraction inside the sandbox VM.
4. **Scheduling + triggers complete.** Vercel Cron enqueues the daily run through the same
   `start()`; control room gains per-stage and re-run-failed-step buttons.
5. **Cutover + demolition.** Verify new == old output, then delete Modal app, `executor.py`, the
   `spawnJob`/`ops_jobs` subprocess path, hardcoded time-gates, and duplicate entry points.

---

## 5. Phase 1 — Control-plane foundation (detailed)

### 5.1 Goal

A single button in `/admin/pipeline` starts a real pipeline run that executes one stage
(`publish`), and the page shows that run and its step live — status, rows in, rows out, duration,
and any error — backed by two clean tables and the Workflow engine. This proves the entire spine
(trigger → orchestrate → record state → display) on a safe, useful, idempotent stage before any LLM
or browser work.

**Why `publish` is the proof stage:** it is pure SQL (read `fees_verified` with
`extraction_confidence >= 0.90` not yet published → insert into `fees_published`), fully
deterministic, idempotent (a `LEFT JOIN` on `lineage_ref` prevents duplicates), immediately useful,
and the lowest-risk port. It exercises `rows_in` / `rows_out` without LLM or Sandbox complexity.

### 5.2 New tables

New migration `supabase/migrations/20260603_pipeline_control_plane.sql`, applied via a new
`scripts/apply-pipeline-control-plane.mjs` following the existing `apply-*.mjs` pattern
(read `.sql`, `sql.unsafe(body)`, `{ prepare: false, max: 1 }` against `DATABASE_URL`).

The legacy `pipeline_runs` declared in `scripts/migrate-schema.sql` (executor-era, phase-resume
columns) is **replaced** by this clean definition; the migration drops it if present and unused.

```sql
-- pipeline_runs: one row per run (product truth)
CREATE TABLE IF NOT EXISTS pipeline_runs (
    id               BIGSERIAL PRIMARY KEY,
    trigger_source   TEXT        NOT NULL CHECK (trigger_source IN ('manual','cron','api')),
    triggered_by     TEXT        NOT NULL,          -- username or 'cron'
    status           TEXT        NOT NULL DEFAULT 'queued'
                       CHECK (status IN ('queued','running','succeeded','failed','canceled')),
    params_json      JSONB       NOT NULL DEFAULT '{}',
    workflow_run_id  TEXT,                          -- link to Vercel Workflow run / dashboard
    stages_total     INT         NOT NULL DEFAULT 0,
    stages_done      INT         NOT NULL DEFAULT 0,
    started_at       TIMESTAMPTZ,
    finished_at      TIMESTAMPTZ,
    error            TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- pipeline_steps: one row per stage per run
CREATE TABLE IF NOT EXISTS pipeline_steps (
    id           BIGSERIAL PRIMARY KEY,
    run_id       BIGINT      NOT NULL REFERENCES pipeline_runs(id) ON DELETE CASCADE,
    stage        TEXT        NOT NULL,
    seq          INT         NOT NULL,
    status       TEXT        NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','running','succeeded','failed','skipped')),
    rows_in      INT,
    rows_out     INT,
    cost_cents   INT         NOT NULL DEFAULT 0,
    started_at   TIMESTAMPTZ,
    finished_at  TIMESTAMPTZ,
    error        TEXT,
    notes_json   JSONB,
    UNIQUE (run_id, stage)
);

CREATE INDEX IF NOT EXISTS idx_pipeline_runs_created  ON pipeline_runs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pipeline_steps_run     ON pipeline_steps (run_id, seq);
```

### 5.3 The stage contract (engine-neutral)

`src/lib/pipeline/stage.ts`

```ts
export interface StageContext {
  runId: number;
  params: Record<string, unknown>;
}

export interface StageResult {
  rowsIn: number;
  rowsOut: number;
  costCents?: number;
  notes?: Record<string, unknown>;
}

export interface Stage {
  name: string;                                  // 'publish', 'classify', ...
  run(ctx: StageContext): Promise<StageResult>;
}
```

The ordered stage list lives in `src/lib/pipeline/stages/index.ts`. Phase 1 registers only
`publish`. Later phases append `classify`, `review`, `discover`, `extract`, `snapshot`.

### 5.4 The publish stage (Phase 1's real stage)

`src/lib/pipeline/stages/publish.ts` — re-homes `fee_crawler/commands/publish_fees.py` to TS using
the existing `sql` client. Reads eligible `fees_verified` (`extraction_confidence >= 0.90`, not yet
in `fees_published`), inserts `fees_published` rows (`lineage_ref = fee_verified_id`). Returns
`{ rowsIn: eligibleCount, rowsOut: insertedCount }`. Wrapped in `sql.begin` for atomicity.

### 5.5 The orchestrator (Workflow DevKit)

Add deps: `workflow`, plus `withWorkflow` Next.js integration. `src/lib/pipeline/workflow.ts`

```ts
import { STAGES } from "./stages";

export async function pipelineRun(runId: number, params: Record<string, unknown>) {
  "use workflow";
  const selected = pickStages(params);            // Phase 1: ['publish']
  for (const stageName of selected) {
    await runStage(runId, stageName, params);     // "use step"
  }
}
```

`runStage` is a `"use step"` function (full Node access) that: marks the `pipeline_steps` row
`running`, calls `stage.run(ctx)`, writes `rows_in` / `rows_out` / `succeeded` (or `failed` +
`error`), and bumps `pipeline_runs.stages_done`. Transient failures throw `RetryableError`;
permanent ones throw `FatalError`. On any stage failure the run is marked `failed` and the error
surfaces in the control room.

### 5.6 The trigger action

`src/app/admin/pipeline/actions.ts` — replace the dead subprocess `spawnJob` path with:

```ts
"use server";
export async function startPipelineRun(stages: string[]): Promise<{ ok: boolean; runId?: number; error?: string }> {
  const user = await requireAuth("trigger_jobs");
  const [run] = await sql`
    INSERT INTO pipeline_runs (trigger_source, triggered_by, status, params_json, stages_total)
    VALUES ('manual', ${user.username}, 'queued', ${sql.json({ stages })}, ${stages.length})
    RETURNING id`;
  await seedSteps(run.id, stages);                 // insert pending pipeline_steps rows
  const wf = await start(pipelineRun, [Number(run.id), { stages }]);
  await sql`UPDATE pipeline_runs SET workflow_run_id = ${wf.runId}, status = 'running', started_at = NOW() WHERE id = ${run.id}`;
  revalidatePath("/admin/pipeline");
  return { ok: true, runId: Number(run.id) };
}
```

### 5.7 Control room v1

Rebuild `src/app/admin/pipeline/page.tsx` (server component, `requireAuth`, `Breadcrumbs`, existing
`Pipeline` nav item already present in `admin-nav.tsx`). Reads `pipeline_runs` (latest 20) +
`pipeline_steps` for the selected run via new query functions in `src/lib/crawler-db/pipeline.ts`.
Renders:

- **Trigger bar:** a "Run publish" button (client component → `startPipelineRun(['publish'])`).
  Built to extend to per-stage / full-run buttons in Phase 4.
- **Runs list:** id, trigger source, who, status badge, started, duration, stages_done/total.
- **Step detail:** per-stage status, rows_in → rows_out, duration, error, link to the Workflow
  dashboard run (`workflow_run_id`).
- Auto-refresh while a run is non-terminal (poll the server component; live streaming via Workflow
  `getReadable()` is a Phase 4 enhancement).

Deletes/retires the `/admin/ops` dead view (or repoints it) in a follow-up; out of scope here.

### 5.8 Testing

- **Unit (vitest):** `publish` stage against a seeded set — asserts `rowsIn`/`rowsOut`, idempotency
  (second run inserts 0), and confidence threshold filtering. Steps are plain functions
  (`"use step"` is a no-op without the compiler), so they test directly.
- **Integration (`@workflow/vitest`):** `start(pipelineRun, [...])`, assert `pipeline_runs` →
  `succeeded`, one `pipeline_steps` row `succeeded` with correct counts.
- **Failure path:** force the stage to throw; assert run + step `failed` with `error` populated.

### 5.9 Acceptance criteria

- [ ] `pipeline_runs` + `pipeline_steps` migrated to the live DB.
- [ ] "Run publish" in `/admin/pipeline` creates a run, executes publish, records a step with real
      `rows_in`/`rows_out`, marks the run `succeeded`.
- [ ] The page shows the run + step live (status, counts, duration) — replacing the empty ops view.
- [ ] Re-running is idempotent (no duplicate `fees_published`).
- [ ] A forced failure marks run + step `failed` with the error visible in the UI.
- [ ] The Workflow dashboard link resolves for the run.
- [ ] No Modal / no Python subprocess involved in the publish path.

### 5.10 Risks & mitigations

| Risk | Mitigation |
|---|---|
| Workflow DevKit maturity / learning surface | Prove on one stage; engine-neutral contract keeps swap-out cheap. |
| Vercel function timeout on long stages | Publish is fast + batched; long/heavy stages move to Sandbox in Phase 3. |
| Supabase `db push` blocked (403) | Use the established `scripts/apply-*.mjs` migration path. |
| Legacy `pipeline_runs` collision | Migration drops the unused executor-era table before creating the new one. |
| Double-publish race | `sql.begin` + `LEFT JOIN lineage_ref` idempotency + `UNIQUE(run_id, stage)`. |

### 5.11 Out of scope for Phase 1

LLM stages (classify/review), Sandbox/heavy stages, Vercel Cron scheduling, per-stage/re-run
buttons, live log streaming, deleting Modal. All are later phases.
