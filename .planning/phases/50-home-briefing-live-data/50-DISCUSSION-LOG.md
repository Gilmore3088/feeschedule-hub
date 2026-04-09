# Phase 50: Home / Briefing Live Data - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.

**Date:** 2026-04-09
**Phase:** 50-home-briefing-live-data
**Areas discussed:** Thesis generation failure, Empty states

---

## Thesis Generation Failure

| Option | Description | Selected |
|--------|-------------|----------|
| Data-only fallback | Show positioning numbers without AI narrative | ✓ |
| Explicit unavailable | "Hamilton analysis temporarily unavailable" with retry | |
| Skip the card | Hide HamiltonViewCard entirely | |

**User's choice:** Data-only fallback, but need backend warning flag when thesis fails for a client
**Notes:** Operators need visibility into API failures. Log structured warning.

---

## Empty States

| Option | Description | Selected |
|--------|-------------|----------|
| Onboarding guidance | Each card guides user to configure relevant settings | ✓ |
| Minimal empty state | Simple "No data yet" | |
| Hide empty cards | Don't render cards without data | |

**User's choice:** Onboarding guidance

## Claude's Discretion

- Empty state visual styling
- Thesis-unavailable indicator approach
- Positioning layout with sparse data

## Deferred Ideas

- User-specific thesis with institution peer context
- Thesis caching/scheduling
