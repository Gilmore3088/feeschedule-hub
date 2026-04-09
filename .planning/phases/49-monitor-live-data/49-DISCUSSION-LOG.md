# Phase 49: Monitor Live Data - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.

**Date:** 2026-04-09
**Phase:** 49-monitor-live-data
**Areas discussed:** Empty state design, Left rail wiring

---

## Empty State Design

| Option | Description | Selected |
|--------|-------------|----------|
| Informative message | "No signals yet. Hamilton will surface changes..." | |
| Onboarding guidance | Guide user to add watchlist items with CTA | ✓ |
| Both combined | Message + guidance | |

**User's choice:** Onboarding guidance
**Notes:** Empty state should guide users to add institutions to watchlist to start receiving signals.

---

## Left Rail Wiring

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, wire it now | Pinned Institutions + Peer Sets + Saved Analyses all from real DB | ✓ |
| Just strip fakes | Remove hardcoded, show empty states | |
| Monitor sections only | Only wire watchlist-related sections | |

**User's choice:** Wire all left rail sections to real data now
**Notes:** Replaces Goldman Sachs, Morgan Stanley, Top 5 Global, etc. with real DB queries.

## Claude's Discretion

- Add-to-watchlist UX mechanism
- Empty state visual styling
- Simulate CTA behavior in left rail

## Deferred Ideas

- Signal pipeline automation
