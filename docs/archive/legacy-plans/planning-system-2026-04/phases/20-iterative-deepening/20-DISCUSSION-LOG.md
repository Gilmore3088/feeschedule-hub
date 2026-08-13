# Phase 20: Iterative Deepening - Discussion Log

> **Audit trail only.**

**Date:** 2026-04-08
**Phase:** 20-iterative-deepening
**Areas discussed:** Escalation tiers, orchestrator integration, per-pass logging

---

## Notes

User noted that most decisions were already made in the roadmap. Confirmed:
- 3 escalation tiers are locked (easy -> Playwright -> PDF/keyword)
- 3-5 passes automatic, no manual re-triggering
- Per-pass logging with fees/coverage/patterns

All implementation details (orchestrator integration, DB schema, agent parameterization) delegated to Claude's discretion.

## Claude's Discretion

- Orchestrator integration approach
- Pass metadata storage
- Agent parameterization method
- Skip-already-discovered logic
- Default pass count and early termination threshold
