# Phase 21: Knowledge Automation - Context

**Gathered:** 2026-04-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Automate knowledge persistence: after each iteration pass, state knowledge files update automatically. Patterns appearing in 3+ states promote to national.md. CLI prune command keeps files under token budget.

Requirements: KNOW-01, KNOW-02

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion (all areas)

- **D-01:** Auto-write learnings after each pass is already partially done (`write_learnings()` called in `run_state_agent()`). Ensure it captures new URL patterns, fee schedule locations, and extraction notes from the current pass.
- **D-02:** Cross-state pattern promotion: after a wave completes, scan all state knowledge files for patterns appearing in 3+ states. Promote to `national.md`. Claude decides the matching algorithm (exact string, fuzzy, or category-based).
- **D-03:** CLI `python -m fee_crawler knowledge prune` already has `prune_state()` and `prune_national()`. Ensure token budget is configurable and the prune preserves highest-signal entries.
- **D-04:** Integration with Phase 20's pass loop: `write_learnings()` should include pass metadata (pass number, strategy tier, coverage delta).

</decisions>

<canonical_refs>
## Canonical References

- `fee_crawler/knowledge/loader.py` -- `load_knowledge()`, `write_learnings()`
- `fee_crawler/knowledge/pruner.py` -- `should_prune_state()`, `prune_state()`, `prune_national()`
- `fee_crawler/agents/state_agent.py` -- calls `write_learnings()` after each pass
- `fee_crawler/wave/orchestrator.py` -- wave completion hook point for cross-state promotion
- `.planning/REQUIREMENTS.md` -- KNOW-01, KNOW-02

</canonical_refs>

<code_context>
## Existing Code Insights

### Key Insight
Most of Phase 21 is already built. `write_learnings()` and `prune_state()` exist. The gaps are:
1. Cross-state pattern promotion (new)
2. CLI `knowledge` subcommand registration (may exist partially)
3. Ensuring pass metadata flows through learnings
4. Auto-prune trigger after promotion

</code_context>

<deferred>
## Deferred Ideas

None

</deferred>

---

*Phase: 21-knowledge-automation*
*Context gathered: 2026-04-08*
