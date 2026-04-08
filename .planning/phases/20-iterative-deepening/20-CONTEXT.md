# Phase 20: Iterative Deepening - Context

**Gathered:** 2026-04-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Each state is crawled 3-5 times automatically, with each pass escalating to harder discovery strategies and injecting learnings from prior passes. The wave orchestrator (Phase 19) drives the campaign; this phase adds multi-pass iteration with strategy escalation.

Requirements: ITER-01, ITER-02, ITER-03

</domain>

<decisions>
## Implementation Decisions

### Escalation Strategy Tiers (from roadmap -- locked)
- **D-01:** Pass 1: Easy URL discovery (sitemap, common fee schedule paths). Fast, low-cost.
- **D-02:** Pass 2: Playwright for JS-rendered pages. Catches SPAs and dynamically loaded fee schedules.
- **D-03:** Pass 3+: PDF search and fee schedule keyword queries. Targets harder-to-find institutions with non-standard URL patterns.
- **D-04:** 3-5 passes per state, automatic. No manual re-triggering between passes. Each pass builds on what prior passes found.

### Per-Pass Logging (from roadmap -- locked)
- **D-05:** After each pass, log: fees discovered this pass, cumulative coverage %, new URL patterns or extraction patterns found. Visible in agent_runs or a pass-level log.

### Claude's Discretion (implementation details)
- **D-06:** How to integrate with wave orchestrator: loop inside `run_campaign()` that runs N passes per state, or have the orchestrator re-queue incomplete states. Claude picks the approach that best supports resume-from-failure.
- **D-07:** Where to store pass metadata: extend `agent_runs` table with `pass_number` and `strategy` columns, or create a separate `agent_passes` table. Claude picks based on what's simplest and supports the per-pass log requirement.
- **D-08:** How to parameterize `run_state_agent()`: accept a strategy tier parameter that controls which discovery stages activate, or create a wrapper that calls the agent multiple times with different configs. Claude picks based on minimal disruption to existing agent code.
- **D-09:** Whether the agent skips already-discovered institutions on subsequent passes (only targets institutions without fee URLs or with failed extractions). This is implied but Claude confirms the approach.
- **D-10:** How many passes to default to (3 vs 5) and whether to stop early if coverage reaches a threshold (e.g., 90%).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### State Agent
- `fee_crawler/agents/state_agent.py` -- `run_state_agent(state_code)` entry point. Currently runs all strategies in one pass.
- `fee_crawler/agents/discover.py` -- URL discovery with Playwright + PDF search. Already has sitemap, common paths, and PDF scoring.

### Wave System (Phase 19)
- `fee_crawler/wave/orchestrator.py` -- `run_campaign()`, `run_wave()`, `resume_wave()`, `MAX_CONCURRENT_STATES=1`
- `fee_crawler/wave/ranker.py` -- `rank_states_by_coverage()`, `WaveConfig`
- `fee_crawler/wave/persistence.py` -- `WaveRecord`, save/load/update wave state
- `fee_crawler/wave/models.py` -- `StateResult`, `WaveStatus`
- `fee_crawler/wave/cli.py` -- CLI commands (run, recommend, resume)

### Knowledge System
- `fee_crawler/knowledge/loader.py` -- `load_knowledge()`, `write_learnings()` -- learnings from prior passes feed into subsequent ones

### Database
- `fee_crawler/db.py` -- `agent_runs` table, DB connection management

### Requirements
- `.planning/REQUIREMENTS.md` -- ITER-01, ITER-02, ITER-03

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `discover.py` already has all three strategy tiers implemented (sitemap/common paths, Playwright, PDF search) -- they just run in a single pass currently
- `knowledge/loader.py` provides `load_knowledge()` and `write_learnings()` -- natural injection point for cross-pass learning
- Wave orchestrator's `run_campaign()` already loops through states sequentially -- adding an inner pass loop is straightforward
- `agent_runs` table tracks per-state run results

### Key Insight
The discovery function `discover_url()` in `discover.py` already uses Playwright for everything (line 71). The escalation isn't about enabling/disabling Playwright -- it's about which URL patterns and search strategies to try. Pass 1 = direct/sitemap URLs only; Pass 2 = deeper page crawling with link following; Pass 3+ = aggressive PDF hunting and keyword search.

### Integration Points
- `run_state_agent()` needs to accept strategy tier or pass number
- `orchestrator.run_campaign()` needs inner pass loop
- `agent_runs` needs pass tracking columns or a related table

</code_context>

<specifics>
## Specific Ideas

- Each pass should only target institutions that weren't successfully extracted in prior passes -- avoid re-extracting known fees
- Knowledge learnings from pass N feed into pass N+1 (e.g., "this state uses WordPress, look for /wp-content/ PDFs")
- Early termination if coverage hits 90%+ after any pass saves time on well-covered states
- The `strategy` field in agent_runs makes it easy to see which pass found which fees in the admin UI

</specifics>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope

</deferred>

---

*Phase: 20-iterative-deepening*
*Context gathered: 2026-04-08*
