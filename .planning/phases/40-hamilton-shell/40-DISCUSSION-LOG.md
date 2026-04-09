# Phase 40: Hamilton Shell - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-09
**Phase:** 40-hamilton-shell
**Areas discussed:** Route structure, Left rail behavior, Auth + upgrade flow

---

## Route Structure

### Route Group Location

| Option | Description | Selected |
|--------|-------------|----------|
| Replace /pro entirely | Clean break, /pro becomes Hamilton | |
| Nest inside /pro | Gradual migration, Hamilton alongside existing pages | ✓ |
| New top-level /hamilton | Separate from /pro entirely | |

**User's choice:** Nest inside /pro
**Notes:** User then specified exact routes: `/pro/hamilton`, `/pro/analyze`, `/pro/simulate`, `/pro/reports`, `/pro/monitor` (no route group prefix in URL).

### Existing Page Migration

**User's choice:** Keep existing /pro pages alongside. New Hamilton routes are additions.

### Default Landing

**User's choice:** `/pro/monitor` is the default. Monitor is the daily-use/retention screen. Hamilton Home is a quick link from Monitor.

---

## Left Rail Behavior

### Universal vs Screen-Specific

| Option | Description | Selected |
|--------|-------------|----------|
| Screen-specific | Each screen has its own left rail matching prototypes | |
| Universal with tabs | One structure, sections highlighted per screen | |
| You decide | Claude picks based on prototypes and LEFT_RAIL_CONFIG | ✓ |

**User's choice:** You decide

### Empty State

| Option | Description | Selected |
|--------|-------------|----------|
| Guided onboarding | Show 'Get Started' prompts guiding first session | ✓ |
| Empty but ready | Show sections with 'No items yet' placeholders | |
| You decide | Claude picks | |

**User's choice:** Guided onboarding

---

## Auth + Upgrade Flow

### Paywall for Non-Subscribers

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse existing /subscribe | Same redirect as current /pro | |
| Hamilton-branded upgrade | Preview + pricing within shell | ✓ |
| You decide | Claude picks | |

**User's choice:** Hamilton-branded upgrade page

### Admin Access

| Option | Description | Selected |
|--------|-------------|----------|
| Full bypass + admin bar | Admins see everything with admin indicator | ✓ |
| Full bypass, no bar | Admins see it exactly as subscribers | |
| You decide | Claude picks | |

**User's choice:** Full bypass with admin bar (reuses current pattern)

---

## Claude's Discretion

- Route group vs wrapper component approach
- Left rail collapse/expand animation
- Mobile nav pattern (bottom nav vs hamburger)
- Hamilton-branded upgrade page structure (page vs modal)

## Deferred Ideas

None
