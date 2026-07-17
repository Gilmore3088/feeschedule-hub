# Handoff — Ingestion Engine, Backend UI, and Deploy Path

**Date:** 2026-07-16
**Branch:** `claude/repo-operational-audit-x5uyvu` (14 commits ahead of `main`)
**Author of this work:** AI pair session (see commit trailers)

---

## ⚠️ Status in one line

**Nothing here is live.** Everything is on the branch above, tested only against a
**throwaway sandbox Postgres** with **fake** network/LLM/R2 adapters. It is not
merged, not deployed, and has never touched production Supabase, Modal, the
Anthropic API, real bank sites, or R2. This is a **complete, tested, deploy-ready
blueprint** — the go-live steps (which need production credentials) are in
`docs/architecture/ingestion-engine-DEPLOY.md`.

---

## What this branch delivers (the arc)

1. **Operational audit** of the existing repo — security holes, silent crons,
   frozen tables, 3 generations of duplicated pipeline. → `docs/audits/repo-operational-audit-2026-07-16.md`
2. **A from-scratch ingestion engine** (`fee_crawler/engine/`) that consolidates
   those 3 generations into one design: stateless capability workers behind a
   queue, dispatched by per-state supervisors, rolling up to an atomic national
   publish. Personified: **Magellan** (fetch) · **Rosetta** (read) · **Knox**
   (extract) · **Darwin** (verify) · **Steward** (per-state) · **Atlas** (publish).
3. **Legacy cleanup** — deleted the unauthenticated Modal sidecars, the
   every-minute cron multiplexer, duplicate circuit breakers, and dead code.
4. **The wire to the product** — a compatibility view (`extracted_fees_compat`)
   that lets the product read the engine's fresh data with a one-line `FROM` swap
   (the current product reads a **frozen** table the engine no longer writes to).
5. **The ops console read layer** (`src/lib/engine-db/`) + a design/mockup, to
   replace the 1,949-line `admin-queries.ts` monolith and the legacy-table admin UI.
6. **Deploy-readiness** — proven-idempotent migrations, a parity-check script, and
   a step-by-step runbook.

**65 engine tests pass** against a real Postgres 16 (logic, change-gate,
provenance, idempotency, publish, compat view, console SQL).

---

## Critical facts a new owner must know

- **The fakes hide the hard part.** Every test injects fake fetch/read/extract/
  classify. The engine has never crawled a real site (anti-bot, JS, scanned PDFs),
  called real Claude (quality, rate limits, cost), run OCR, or written R2. The
  **shadow run** (DEPLOY.md Step 3) is first contact and *will* surface issues.
- **The product is currently disconnected from the engine.** ~18 files in
  `src/lib/crawler-db/*` + public `api/v1` + reports read the frozen
  `extracted_fees`. The engine writes `fees_raw → fees_verified →
  fees_published_engine`. Nothing bridges them until the compat-view swap runs.
- **Migrations are additive and idempotent** — Steps 1–4 of the deploy are
  non-destructive; nothing is dropped until the final cutover.
- **The old pipeline still runs in production** (whatever was last deployed).
  This branch deletes it, but only takes effect once deployed.

---

## Repo map (what's new on this branch)

| Path | What it is |
|---|---|
| `fee_crawler/engine/` | The engine: `queue`, `worker`, `documents` (change-gate), `runs`, `handlers/{fetch,read,extract,verify}` (the personas), `adapters`(+`_impl`), `promoter`, `classifier`, `supervisor`, `knowledge`, `rollup`, `golden`, `alerting`, `personas`, `cli`, `run_worker` |
| `fee_crawler/modal_app_engine.py` | Modal deployment: `pump`/`supervise`/`national` crons + spawned `drain_queue` workers (replaces the every-minute multiplexer) |
| `fee_crawler/tests/engine/` | 10 test files, 65 tests (run against local Postgres) |
| `supabase/migrations/20260716*.sql` | 7 engine migrations (queue ext, documents, runs, knowledge, publish, golden, taxonomy ref, compat view) |
| `src/lib/engine-db/` | 7 typed TS read modules for the ops console (queues, runs, states, publish, review+provenance, golden) |
| `scripts/engine_e2e_demo.py` | Runnable narrated end-to-end demo (Steward→…→Atlas) |
| `scripts/parity_check.py` | Read-only frozen-vs-compat parity gate |
| `docs/architecture/*.md` | 6 design docs (see index below) |

---

## How to run the tests (reproduce the green)

```bash
# 1. a disposable Postgres (any local instance works)
pg_ctlcluster 16 main start                       # or: docker compose up -d postgres
createdb bfi_test 2>/dev/null || true
export DATABASE_URL_TEST="postgres://postgres:postgres@localhost:5432/bfi_test"

# 2. deps
pip install asyncpg pytest pytest-asyncio

# 3. run
python -m pytest fee_crawler/tests/engine/ -q       # 65 passed

# 4. see the whole pipeline run, narrated (Steward→Magellan→Rosetta→Knox→Darwin→Atlas)
PYTHONPATH=. DATABASE_URL_TEST=$DATABASE_URL_TEST python scripts/engine_e2e_demo.py
```

The TS `engine-db` layer can't be compiled here (no `node_modules`); its SQL is
validated in `fee_crawler/tests/engine/test_console_queries.py`.

---

## The go-live path (needs production credentials)

Full detail: **`docs/architecture/ingestion-engine-DEPLOY.md`**. Summary:

1. **Merge** the PR to `main`.
2. **Apply migrations** to production Supabase (idempotent; filename order).
3. **`modal deploy fee_crawler/modal_app_engine.py`** (national → staging only at first).
4. **Shadow run** one state, watch queues drain, fix what only reality reveals.
5. **`python scripts/parity_check.py`**, then repoint `src/lib/crawler-db/*` reads
   to `extracted_fees_compat` — this is when the engine first reaches users.
6. **Cut over & retire legacy** per `docs/architecture/ingestion-engine-CUTOVER.md`.

Rollback is available at every step (additive migrations, one-config read flip,
atomic/versioned publish swap).

**Who runs it:** any environment holding the `bfi-secrets` set (Supabase, Modal,
Anthropic, R2). A sandbox session without those credentials cannot.

---

## Document index

| Doc | Purpose |
|---|---|
| `docs/audits/repo-operational-audit-2026-07-16.md` | The original operational audit (security/reliability/sprawl). |
| `docs/architecture/ingestion-engine-plan.md` | The engine architecture + the cast (personas). |
| `docs/architecture/ingestion-engine-CUTOVER.md` | Shadow → flip → retire checklist for the legacy path. |
| `docs/architecture/ingestion-engine-DEPLOY.md` | The go-live runbook (this is your Step 0). |
| `docs/architecture/backend-ui-inventory.md` | Every `/admin` route mapped (no-lost-function); resolved decisions. |
| `docs/architecture/backend-ui-plan.md` | Phased UI build (compat rewire · read layer · console · consolidation). |

---

## Open decisions / risks to weigh

- **Canonical fee taxonomy beyond 65 base keys.** The compat view maps the 65
  base categories cleanly; the ~197 canonical synonyms need parity attention in
  DEPLOY Step 4. `fee_taxonomy_ref` is now the DB home for this map — extend it there.
- **Extraction quality is unproven.** Knox's real accuracy (and cost per report)
  is only known after the shadow run. Seed the **golden set** before publishing.
- **Anti-bot / JS / scanned PDFs.** Magellan's browser rung and Rosetta's OCR rung
  exist but haven't met real defenses. Expect iteration on the fetch/read stages.
- **Deep legacy deletion is staged, not done.** `state_agent`, `wave`,
  `commands/crawl`, the dup extraction stacks, and the `db.py` SQLite shim are
  still present (they carry brains / are still wired to the CLI); their removal is
  the tracked CUTOVER follow-up, not a build step.
- **Product-page rewire is a hard dependency for value.** Without DEPLOY Step 5,
  a perfectly working engine feeds a table nobody reads.

---

## The 14 commits on this branch

```
docs(audit): operational audit 2026-07-16 (security, reliability, sprawl)
docs(architecture): ingestion engine plan — workers + state supervisors + queue
feat(engine): Phase 0 — queue, change-gate documents, run tracking
feat(engine): Phase 1 — capability workers (fetch/read/extract/verify)
feat(engine): Phase 2 — state supervisor + structured knowledge
feat(engine): Phase 3 — national roll-up + atomic publish
feat(engine): Phase 4/5 — scheduling, alerting, golden regression, cutover
refactor(engine): personify the cast + remove redundant legacy processes
test(engine): end-to-end demo of the personified pipeline
docs(ui): backend UI page-by-page inventory (no-lost-function map)
docs(ui): resolve the 3 open UI decisions + record the frozen-table finding
feat(engine): compat view — connect the engine to the product
feat(ui): engine-db read layer for the ops console + build plan
docs+tooling: deploy-readiness — parity script + runbook
```

**Next concrete step:** open the PR (reviewable, one merge from `main`), then run
the DEPLOY runbook from an environment with `bfi-secrets`. Nothing proceeds to
production without an explicit human decision at Step 0.
