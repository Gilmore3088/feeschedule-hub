# Phase 28: Audience Shell Separation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md -- this log preserves the alternatives considered.

**Date:** 2026-04-07
**Phase:** 28-audience-shell-separation
**Areas discussed:** Nav identity split, Auth guard strategy, Personalization scope, Pro nav items

---

## Nav Identity Split

| Option | Description | Selected |
|--------|-------------|----------|
| Same structure, different items | Both use same horizontal nav bar layout with different link sets and color accents | |
| Distinct designs | Consumer gets editorial-style nav, Pro gets denser workspace-style nav | ✓ |
| You decide | Claude picks based on design context | |

**User's choice:** Distinct designs
**Notes:** Consumer nav = editorial, spacious, warm palette. Pro nav = workspace, dense, tool-like with institution name visible.

---

## Auth Guard Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| pro/layout.tsx (Recommended) | Single auth check in pro layout, all /pro/* pages automatically protected | ✓ |
| Next.js middleware | middleware.ts intercepts /pro/* requests before rendering | |
| You decide | Claude picks based on codebase patterns | |

**User's choice:** pro/layout.tsx (Recommended)
**Notes:** Simple, no middleware complexity. Invalid sessions redirect to login with return URL.

---

## Personalization Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Profile + derived labels | Pure mapping from profile fields, no DB call | |
| Profile + derived + live data | Includes lightweight DB query for peer medians | |
| You decide | Claude picks the right balance | ✓ |

**User's choice:** You decide
**Notes:** Claude has discretion on whether to include live DB data or keep it pure profile-field mapping.

---

## Pro Nav Items

| Option | Description | Selected |
|--------|-------------|----------|
| Four-door aligned | Nav mirrors launchpad: Hamilton, Peer Builder, Reports, Federal Data + Dashboard | |
| Keep current + add doors | Keep existing 8 items, four-door model only on dashboard | |
| Simplified hybrid | Trim to 5-6 items consolidating related items | ✓ |

**User's choice:** Simplified hybrid
**Notes:** Consolidate from 8 to 5-6 focused entries. Exact items at Claude's discretion but aligned with four-door launchpad model.

---

## Claude's Discretion

- Personalization service: whether to include live DB data or keep pure profile-field mapping
- Exact pro nav item labels and grouping (5-6 items)
- MobileNav component update approach
- Whether ConsumerNav uses any auth state

## Deferred Ideas

None
