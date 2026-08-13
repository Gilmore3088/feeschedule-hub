# Phase 22: Wave Reporting - Context

**Gathered:** 2026-04-08
**Status:** Ready for planning

<domain>
## Phase Boundary

After each wave completes, auto-generate an operator-readable summary report: per-state before/after coverage %, national coverage delta, total fees added, top 3-5 new discoveries. Plain text or Markdown, scannable in 60 seconds.

Requirements: COV-01

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion (all areas)

- **D-01:** Report format: Markdown to stdout + optional file save. Matches the user's preference for post-run reports (MEMORY: feedback_run_reports.md).
- **D-02:** Report content: per-state coverage before/after, national delta, fees added count, top new URL patterns, top institutional discoveries.
- **D-03:** Integration point: hook into `run_campaign()` or `run_wave()` completion in orchestrator.py. Generate report from wave_state_runs + agent_runs data.
- **D-04:** CLI: `python -m fee_crawler wave report <wave_id>` to regenerate a report for a past wave. Auto-print after `wave run` completes.

</decisions>

<canonical_refs>
## Canonical References

- `fee_crawler/wave/orchestrator.py` -- `run_campaign()`, `run_wave()` completion hooks
- `fee_crawler/wave/persistence.py` -- `WaveRecord`, wave state data
- `fee_crawler/wave/models.py` -- `StateResult`, `WaveStateRun`
- `fee_crawler/db.py` -- agent_runs queries for coverage data
- `.planning/REQUIREMENTS.md` -- COV-01

</canonical_refs>

<deferred>
## Deferred Ideas

None

</deferred>

---

*Phase: 22-wave-reporting*
*Context gathered: 2026-04-08*
