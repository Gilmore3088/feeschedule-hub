# Ingestion Engine — Cutover Checklist

**Status:** Ready to execute once the new engine has shadowed one clean cycle.
**Companion to:** `ingestion-engine-plan.md`.

The new engine (`fee_crawler/engine/`, `modal_app_engine.py`) is built and tested
alongside the legacy pipeline. These steps retire the old path. They are grouped
here — not done during the build — because each deletion breaks a currently-wired
subsystem, and the plan mandates that every build phase leave the system runnable.
Execute top-to-bottom **after** the shadow run in §Shadow below passes.

## Shadow (do first)
- [ ] Deploy `modal_app_engine.py` with `pump` + `supervise` + `national` crons, but
      leave `national` publishing to a **staging** batch only (don't flip the app's
      read to `fees_published_current` yet).
- [ ] Run one full cycle. Diff `fees_published_engine` (new) against the legacy
      `fees_published` for a sample of states. Investigate any institution whose
      fee set differs.
- [ ] Seed `golden_institutions` / `golden_fees` (~75 hand-verified) and confirm
      `national` blocks on a deliberately-broken golden target.

## Flip
- [ ] Repoint the app's published reads to `fees_published_current` (view over the
      active batch). This is the go-live switch; rollback = repoint back.

## Retire legacy Modal (replaces the every-minute multiplexer)
- [ ] Remove the `run_post_processing` (`* * * * *`) function and its 05:00/06:00
      time-window blocks from `fee_crawler/modal_app.py`.
- [ ] Remove `run_discovery`, `run_pdf_extraction`, `run_browser_extraction`,
      `ingest_data` **crawl** crons once `pump`/`supervise` cover them (keep the
      FDIC/NCUA/CFPB **ingest** crons — those feed `crawl_targets`, still needed).
- [ ] Delete the FastAPI sidecars `fee_crawler/darwin_api.py`,
      `fee_crawler/magellan_api.py` and their `modal.asgi_app()` registrations in
      `modal_app.py`. (Also closes the unauthenticated-endpoint finding from the
      operational audit.) Delete `tests/test_darwin_api.py`, `tests/test_magellan_api.py`.

## Collapse duplicate agent/extraction code
- [ ] Point Darwin's orchestrator at `agents/_common/circuit.py`; delete the
      divergent `agents/darwin/circuit.py`.
- [ ] Refactor Darwin classify + Knox review to run behind the `verify` queue
      handler (a real `Classifier`/second-pass); delete their standalone
      dispatch paths once the verify worker covers them.
- [ ] Refactor Magellan rescue to the `fetch` escalation rung (payload `rescue:true`);
      delete the standalone Magellan orchestrator path.
- [ ] Delete the two parallel extraction stacks once the `read`+`extract` workers
      are the only path: `agents/extract_{pdf,html,js}.py` and `pipeline/extract_{pdf,html}.py`
      (keep `pipeline/extract_llm.py` — the `LLMExtractor` adapter wraps it, or inline it).

## Retire the state-agent / wave path
- [ ] Migrate `wave/` callers and `knowledge/loader.py` off `agents/state_agent.py`
      onto the `StateSupervisor`; delete `agents/state_agent.py` and the Gen-2
      `agents/{discover,classify,validate,strategy}.py`.
- [ ] Regenerate `knowledge/states/*.md` + `national.md` from the tables
      (`python -m fee_crawler.engine.cli export-md <STATE>`), then treat the DB as
      the source of truth.

## Retire the SQLite dialect shim (T5.3)
- [ ] Rewrite the remaining ~37 `commands/*.py` callers to native Postgres
      placeholders (`%s` / `ON CONFLICT`) — the engine workers already bypass the
      shim.
- [ ] Delete `_translate_placeholders` from `fee_crawler/db.py`; extend
      `scripts/ci-guards.sh` to fail on its reintroduction.

## CI
- [ ] Add `DATABASE_URL_TEST` to the engine test job so `fee_crawler/tests/engine/`
      runs in CI (46 tests; they self-skip without it).
- [ ] Add a `test` npm script + vitest + `tsc --noEmit` to CI (separate operational
      audit finding, unblocks the TS layer).

## Rollback
Repoint the app's published reads from `fees_published_current` back to legacy
`fees_published`. The atomic-swap design means this is one config change; no data
migration is required.
