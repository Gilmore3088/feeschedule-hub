# Phase 10: CI Integration - Context

**Gathered:** 2026-04-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Create a GitHub Actions workflow that runs the e2e test suite on schedule (nightly/weekly) with fast mode (no LLM) and full mode (with LLM) options.

</domain>

<decisions>
## Implementation Decisions

- **D-01:** Two modes: fast (pytest -m "e2e and not llm and not slow") and full (pytest -m e2e)
- **D-02:** Schedule: nightly for fast mode, weekly for full mode
- **D-03:** Full mode requires ANTHROPIC_API_KEY secret for real LLM calls
- **D-04:** workflow_dispatch for manual triggering with mode parameter
- **D-05:** Python 3.12, install from requirements.txt

### Claude's Discretion
- All implementation details

</decisions>

<canonical_refs>
## Canonical References

- `pyproject.toml` — pytest markers (e2e, llm, slow)
- `requirements.txt` — Python dependencies
- `.github/workflows/` — empty, new file needed

</canonical_refs>

---

*Phase: 10-ci-integration*
*Context gathered: 2026-04-06*
