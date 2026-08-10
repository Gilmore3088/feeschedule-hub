# Ingestion Engine — Deploy Runbook

**Status:** Ready to execute by someone holding the production credentials.
The engine is built and tested on branch `claude/repo-operational-audit-x5uyvu`
but **nothing here is live** — it has only ever run against a throwaway sandbox
Postgres with fake network/LLM/R2 adapters. This runbook is the go-live path.

## What's already proven (no prod access needed)
- 65 engine tests green against real Postgres (logic, gating, provenance, publish).
- The 7 engine migrations apply **in order and idempotently** (safe to re-run).
- `extracted_fees_compat` returns parity shape in unit tests.

## What still requires the real world (and will surface new issues)
The fakes have never touched: real bank sites (anti-bot, weird PDFs), the real
Anthropic API (extraction quality, rate limits), OCR, or R2. Budget time for the
shadow run to find these.

---

## Prerequisites (secrets this runbook assumes)
`DATABASE_URL`, `DATABASE_URL_SESSION`, `SUPABASE_SERVICE_ROLE_KEY`,
`ANTHROPIC_API_KEY`, `MODAL_TOKEN_ID`/`MODAL_TOKEN_SECRET`,
`R2_ENDPOINT`/`R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`/`R2_BUCKET`,
`BFI_APP_URL`, `BFI_REVALIDATE_TOKEN`. All live in the `bfi-secrets` Modal secret.

## Step 0 — Review & merge
- [ ] Open a PR from `claude/repo-operational-audit-x5uyvu` → `main`; review the
      diff (engine, migrations, compat view, engine-db, deletions in modal_app.py).
- [ ] Merge. **Do not deploy Modal from the branch** — merge first.

## Step 1 — Apply migrations to production Supabase
Idempotent; apply in filename order. The 7 engine migrations:
```
supabase/migrations/20260716000001_engine_phase0.sql
supabase/migrations/20260716000003_engine_fees_provenance.sql
supabase/migrations/20260716000002_engine_state_knowledge.sql
supabase/migrations/20260716000004_engine_publish.sql
supabase/migrations/20260716000005_engine_golden.sql
supabase/migrations/20260716000006_engine_fee_taxonomy_ref.sql
supabase/migrations/20260716000007_engine_extracted_fees_compat.sql
```
- [ ] `node scripts/apply-migration.mjs` (the tracked applier — records into
      `schema_migrations`), or apply each via psql.
- [ ] Backfill hints from existing targets: `python -m fee_crawler.engine.cli backfill <STATE>` per state (optional warm start).
- [ ] Seed `golden_institutions` / `golden_fees` (~75 hand-verified) — the publish gate.

## Step 2 — Deploy the engine workers (Modal)
- [ ] `modal deploy fee_crawler/modal_app_engine.py`
      (crons: `pump` every minute, `supervise` daily 06:00, `national` daily 10:00;
      `drain_queue` is spawned, autoscaled).
- [ ] Confirm the `bfi-secrets` secret carries every var in Prerequisites.
- [ ] Leave `national` publishing to a **staging** batch only for the shadow run
      (don't flip the app's reads yet).

## Step 3 — Shadow run (first contact with the real world)
- [ ] Kick one state: `python -m fee_crawler.engine.cli run-cycle IA` (or let the
      06:00 `supervise` cron fire), then watch the queues drain.
- [ ] Inspect: `documents` populated, `fees_raw` → `fees_verified` flowing,
      `pipeline_runs` terminal, dead-letter (`jobs status='dead'`) small.
- [ ] Fix what only reality reveals: anti-bot blocks (Magellan escalation),
      OCR-needed PDFs (Rosetta), extraction misses (Knox prompt), misclassifies
      (Darwin). Iterate until IA looks right, then widen states.

## Step 4 — Parity check, then connect to the product
- [ ] `DATABASE_URL=... python scripts/parity_check.py` (reads only; compares the
      frozen `extracted_fees` to `extracted_fees_compat`). Investigate any
      category/row deltas — especially `conditions` and the ~197 canonical
      synonyms beyond the 65 base keys.
- [ ] When parity is clean, repoint `src/lib/crawler-db/*` reads from
      `extracted_fees` → `extracted_fees_compat` (one shared `FROM`), behind a flag.
- [ ] Verify the public site + `api/v1` render the fresh data. **This is the
      moment the engine's work first reaches users.**

## Step 5 — Cut over & retire legacy
Follow `ingestion-engine-CUTOVER.md`:
- [ ] Repoint the app's published reads to `fees_published_current` / the compat view.
- [ ] Remove the legacy Modal crawl crons + sidecars (already deleted on the branch).
- [ ] Retire `state_agent`/`wave`/dup extraction stacks + the `db.py` SQLite shim.
- [ ] Drop `extracted_fees` once the swap is verified.

## Rollback (at every step)
- Migrations are additive — nothing is dropped until Step 5, so Steps 1–4 are
  non-destructive.
- Product read flip is one config change; revert the `FROM` to `extracted_fees`.
- The publish swap is atomic and versioned; roll back to the prior batch.

---

### Can Claude run this?
Steps 1–5 need production credentials and outbound network (Supabase, Modal,
Anthropic, R2) that a sandbox session does not have — so they must run from an
environment that holds `bfi-secrets`. What Claude can do without those: everything
in "already proven" above, plus author the PR, the parity script, and this
runbook (done). The go-live commands are yours to run, or run from a session
provisioned with the secrets.
