# Phase 19: Wave Orchestrator - Context

**Gathered:** 2026-04-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Build a wave orchestrator that batches all 50 states into priority-ordered waves, launches state agents for each wave, auto-advances between waves without human intervention, tracks progress per wave, and supports resuming partial waves after failures. This is a fire-and-forget system — the operator launches once and it runs unattended for hours.

</domain>

<decisions>
## Implementation Decisions

### Concurrency Model
- **D-01:** Claude's discretion on concurrency approach. Options include Modal `.map()` for parallel state agents, sequential loop, or local async. Choose based on Modal compute constraints, cost, and reliability. The key requirement is it runs unattended — reliability over speed.

### Prioritization Logic
- **D-02:** States ranked by coverage gap % (lowest current coverage first). Query `crawl_targets` to compute per-state coverage, rank from worst to best. This maximizes new fee data per wave by targeting the most underserved states first.

### Automation Model
- **D-03:** Fire-and-forget execution. The operator triggers the campaign once (CLI or Modal endpoint). The system auto-advances through all states in a wave and all waves in the campaign without stopping for approval. No human-in-the-loop between waves or states.
- **D-04:** The system should run for as many hours as needed, capturing as much data as possible. Only stop on hard failures (DB connection loss, API key exhaustion), not on per-state errors. Per-state errors are logged and skipped.

### Wave Persistence
- **D-05:** Claude's discretion on persistence approach (DB table vs JSON vs inferred from agent_runs). Must support resume-from-failure — if the process crashes after completing 3 of 8 states in a wave, resuming skips the 3 completed states.

### CLI / Invocation
- **D-06:** Primary invocation via CLI: `python -m fee_crawler wave run` (runs entire campaign). Also expose `wave recommend` to preview the ranked state list and `wave resume <wave_id>` for crash recovery. Modal HTTP endpoint optional but not required for v3.0.

### Claude's Discretion
- Concurrency model (D-01): Choose the approach that maximizes reliability for unattended multi-hour runs
- Wave persistence mechanism (D-05): Choose what best supports resume-from-failure
- Wave size: 5-10 states per wave, Claude can tune based on what makes sense for the priority ranking
- Error handling granularity: How to handle per-institution vs per-state vs per-wave failures

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### State Agent
- `fee_crawler/agents/state_agent.py` — The 5-stage agent (inventory → discover → classify → extract → validate). `run_state_agent(state_code)` is the entry point.
- `fee_crawler/agents/discover.py`, `classify.py`, `extract_pdf.py`, `extract_html.py`, `extract_js.py`, `validate.py` — Stage implementations

### Knowledge System
- `fee_crawler/knowledge/loader.py` — `load_knowledge()`, `write_learnings()`, `get_known_failures()`
- `fee_crawler/knowledge/pruner.py` — `should_prune_state()`, `prune_state()`

### Modal Integration
- `fee_crawler/modal_app.py` — Existing Modal app with 5 cron slots (maxed). HTTP endpoint `run_state_agent` at line 220.

### CLI
- `fee_crawler/__main__.py` — Argparse CLI dispatcher. New `wave` subcommand goes here.

### Database
- `agent_runs` table — Tracks per-state runs (state_code, total_institutions, stages, status)
- `agent_run_results` table — Per-institution per-stage results
- `crawl_targets` table — Institution data with state_code, fee_schedule_url, status

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `run_state_agent(state_code)` — Fully functional 5-stage agent, returns summary dict with discovered/extracted/validated counts
- `agent_runs` + `agent_run_results` tables — Already track per-state run progress
- `_generate_learnings()` in state_agent.py — Already generates and writes learnings after each run
- Knowledge loader/pruner — Already handles per-state and national knowledge files
- `_connect()` helper in state_agent.py — Postgres connection from DATABASE_URL

### Established Patterns
- CLI commands follow `cmd_<name>(args)` pattern in `__main__.py`
- Modal functions use `@app.function()` decorator with secrets, timeout, memory, image
- State agent is synchronous, returns dict — wave orchestrator wraps this
- Knowledge pruning triggered automatically after N runs via `should_prune_state()`

### Integration Points
- New `wave` subcommand in `fee_crawler/__main__.py`
- Optional new Modal function for remote execution
- Reads from `crawl_targets` for state prioritization
- Writes to `agent_runs` for tracking (existing)
- May need new `wave_runs` table for wave-level tracking

</code_context>

<specifics>
## Specific Ideas

- User wants this to run unattended for hours — reliability is paramount over speed
- Per-state errors should be logged and skipped, not halt the campaign
- The `wave recommend` command should print a readable ranked list the operator can review before launching
- Coverage gap % is the sort key — states with lowest coverage get processed first

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 19-wave-orchestrator*
*Context gathered: 2026-04-06*
