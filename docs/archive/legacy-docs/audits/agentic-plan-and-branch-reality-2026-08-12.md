# Agentic Plan and Branch Reality Audit - 2026-08-12

Superseded status note: this document explains why the repo was still on the
legacy runtime at the start of the August 12 cleanup. The current working tree
has since removed the tracked Python crawler/Modal runtime and rewired launch
actions to `agent_runs`. See
`docs/audits/legacy-retirement-status-2026-08-12.md` for current state.

## Question

Why are we still building on old Modal/fee_crawler paths if prior chats already
worked on the agentic replacement?

## Short Answer

The prior work exists, but it is not live on `main`, and not all of it satisfies
the current target of "no Modal, no fee_crawler."

There are three different realities in this repo:

1. `main` was still wired to the old TypeScript admin launcher -> Modal -> `python -m fee_crawler` runtime.
2. `origin/claude/repo-operational-audit-x5uyvu` contains a large ingestion engine branch, but its own handoff says it is not merged, not deployed, tested only with fake adapters, and still deploys through `fee_crawler/modal_app_engine.py`.
3. `origin/claude/peaceful-ride-EK68V` contains more aggressive agentic/Vercel pipeline work, but it is also not merged to `main` and still contains `fee_crawler` agents plus edits to `fee_crawler/modal_app.py`.

So the work was not "done" in production terms. It was planned, partially built,
or stranded in branches. `main` continued to expose the old runtime.

## Evidence

### Branch: `origin/claude/repo-operational-audit-x5uyvu`

`HANDOFF.md` says this branch is "Nothing here is live." It also says the branch
was tested only against throwaway Postgres with fake network/LLM/R2 adapters and
has never touched production Supabase, Modal, Anthropic, real bank sites, or R2.

The branch adds:

- `fee_crawler/engine/*`
- `fee_crawler/modal_app_engine.py`
- engine migrations
- `src/lib/engine-db/*`
- deploy and cutover docs

This is useful source material, but it is not the final target because it still
keeps Python and Modal as the deployment substrate.

### Branch: `origin/claude/peaceful-ride-EK68V`

This branch contains commits named like:

- `feat(pipeline): Phase 1 control plane - trigger + monitor + per-step visibility`
- `feat(pipeline): Phase 4 - Vercel Cron, per-stage/re-run controls, live monitor`
- `feat(agentic): eliminate every red on WORKFLOW-MAP - full agentic loop wired`

But its diff still includes `fee_crawler/agents/*`, `fee_crawler/modal_app.py`,
and many Python pipeline changes. It is not merged to `main`, and it is not a
clean no-Modal/no-fee_crawler replacement.

### Main Before Phase 0 Patch

The live `main` runtime included:

- `src/lib/job-runner.ts` hardcoded Modal ops/cancel fallback URLs.
- `src/lib/modal-endpoints.ts` hardcoded Modal sidecar URL fallbacks.
- `src/lib/report-job-runner.ts` called `MODAL_REPORT_URL`.
- `src/lib/scout/audit-agents.ts` called `MODAL_DISCOVER_URL`.
- Admin UI copy told operators it was "contacting Modal" and waiting for a Modal call ID.

That is why clicking Atlas/Magellan could still do nothing useful while showing
agentic labels. The UI names were newer than the execution runtime.

## Phase 0 Applied In This Pass

This pass intentionally stops the bleeding before doing a larger merge:

- Added `src/lib/execution-backend.ts`.
- Defaulted execution to `EXECUTION_BACKEND=disabled`.
- Replaced `src/lib/modal-endpoints.ts` with a throwing compatibility shim.
- Changed `src/lib/job-runner.ts` so allowed legacy commands are blocked before DB insert or network calls.
- Changed legacy cancellation so it never calls the old Modal cancel endpoint.
- Changed `src/lib/report-job-runner.ts` so reports record a failed local envelope and never call `MODAL_REPORT_URL`.
- Changed Scout heuristic discovery so it no longer calls `MODAL_DISCOVER_URL`.
- Added `scripts/ci-guards.sh modal-kill`.
- Updated Atlas/Magellan/Darwin/Hamilton operator copy from Modal-specific status to backend-neutral status.
- Added a visible backend banner to `/admin`.

## What Is Still Not Done

This patch does not complete the full objective. It blocks the legacy TypeScript
runtime hooks and makes the operator experience honest.

Still outstanding:

- Build the actual `agentic_v1` backend in `main`.
- Choose whether to port useful logic from the two stranded branches or rewrite
  the backend in TypeScript/Vercel primitives.
- Delete or archive the old `fee_crawler` runtime after its useful extraction,
  discovery, taxonomy, and ingest logic has been ported.
- Replace `ops_jobs.modal_call_id` naming with agent-run/backend receipt fields.
- Continue deleting stale admin Pipeline components once each remaining panel is
  proven unreachable or replaced by the agentic run surface.
- Remove Modal operational scripts once the Supabase migration path is no longer
  dependent on Modal secrets.
- Move product reads off legacy/frozen tables through one published fee data path.

## Practical Next Move

Do not merge either branch wholesale.

Use them as salvage sources:

- Salvage from `repo-operational-audit-x5uyvu`: queue/run schema ideas, engine
  tests, compat/parity thinking, deploy/cutover docs.
- Salvage from `peaceful-ride-EK68V`: pipeline control-plane UI, step visibility,
  Vercel Cron route patterns, stage-level tests.

Then implement `agentic_v1` directly on `main` behind the new execution gate.
