# Backend UI — Build Plan

**Status:** In progress · companion to `backend-ui-inventory.md` (the page map)
**Date:** 2026-07-16

The inventory answered *what happens to every page*. This is *how we build it*,
in order, and what's already done.

## Principle

Two independent tracks, sequenced so the risky one is de-risked first:

1. **Product rewire** (connect the engine to what users see) — a compatibility
   view + parity check, then a one-line `FROM` swap. This is the value connection.
2. **Ops console** (make the engine observable) — a typed `engine-db` read layer,
   one SSE feed, an overview page, and a handful of workflow pages.

Both replace the `admin-queries.ts` monolith and the legacy tables.

## Phase A — Product rewire ✅ (foundation done)

The finding that makes this urgent: ~18 `crawler-db` files + public `api/v1` +
reports read the **frozen** `extracted_fees`, so the product is served from a
table the engine no longer writes to.

- [x] **`fee_taxonomy_ref`** — DB home for `canonical_fee_key → (fee_family,
  display)` (65 base categories, seeded from `fee-taxonomy.ts`). Retires the
  TS/Python hand-synced taxonomy as a drift source.
- [x] **`extracted_fees_compat`** view — the live published tier in the exact
  `extracted_fees` column shape. 5 tests: legacy shape, family/category +
  conditions-via-lineage mapping, active-batch-only, approved status, row parity.
- [ ] **Parity check on real data** — diff `extracted_fees` vs the view for a
  sample of institutions in staging; investigate any delta (esp. `conditions`
  and category mapping for the ~197 canonical synonyms beyond the 65 base keys).
- [ ] **Swap the query layer** — repoint `src/lib/crawler-db/*` reads from
  `extracted_fees` to `extracted_fees_compat` (one shared `FROM`), behind a flag.
- [ ] **Drop `extracted_fees`** once the swap is verified in production.

## Phase B — Ops console read layer ✅ (done)

- [x] **`src/lib/engine-db/`** — typed read modules, one concern per file,
  replacing the 1,949-line `admin-queries.ts`:
  - `queues.ts` — fleet board (Magellan/Rosetta/Knox/Darwin depth·running·dead·
    throughput·oldest) + dead-letter, from `jobs`.
  - `runs.ts` — `pipeline_runs` timeline + stuck-run freshness.
  - `states.ts` — steward grid (coverage + last-cycle notes + hints) + per-state
    institutions.
  - `publish.ts` — Atlas: publish batches + live index summary.
  - `review.ts` — review queue (flagged `fees_raw`) + **provenance** (fee →
    document snapshot + char span).
  - `golden.ts` — golden-set regression status.
- [x] Every query validated against the engine schema (6 tests, `test_console_queries.py`).

## Phase C — Console UI (next)

- [ ] **SSE feed** — one `GET /api/admin/engine/stream` over the engine's
  existing `LISTEN jobs_*`, streaming queue depths + run-status transitions.
  Replaces the per-agent `coverage/stream` + `darwin/stream` routes.
- [ ] **`middleware.ts`** — guard `/admin/*` + `/api/admin/*` centrally (fixes
  the audit's layout auth hole); secure `job-health`.
- [ ] **Overview page** (`/admin` or `/admin/engine`) — the console from the
  mockup: stat band, fleet, steward grid, run timeline, Atlas panel, exceptions.
  Warm/editorial (FT/Connected-FINS), theme-aware.
- [ ] **Workflow pages** — review (bulk approve/reclassify → writes
  `institution_hints.fee_name_aliases`), run history, dead-letter triage
  (requeue), per-state drill-down, document browser, golden-set editor.

## Phase D — Consolidation (from the inventory)

- [ ] Fold the CONSOLE pages (pipeline, ops, agents, darwin, scout, coverage,
  data-quality, quality, verify-index) into the overview; delete their old routes.
- [ ] Delete duplicates: `hamilton/research/*`, `hamilton/{leads,methodology,scout}`,
  `agents/messages`.
- [ ] Move `query` to `/admin/advanced` (admin-only, read-only, logged).

## What's shippable today

Phase A's foundation and all of Phase B are built and tested (11 new tests; 65
engine tests total, all green against live Postgres). The next concrete step is
Phase A's parity check + query swap (connects the engine to the product) or
Phase C's SSE + overview page (makes it visible) — both now unblocked by the
read layer.
