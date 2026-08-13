# Phase 23: Call Report & FRED Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-07
**Phase:** 23-call-report-fred-foundation
**Areas discussed:** Scaling fix approach, Asset tier segmentation, District indicators, B2B institution connection, Scope verification

---

## Scaling Fix Approach

### Q1: Where should the *1000 multiplication happen?

| Option | Description | Selected |
|--------|-------------|----------|
| Query layer (Recommended) | Multiply in SQL or TypeScript query functions | |
| Ingestion layer | Fix at data import time — store actual dollars in DB. Requires migration + backfill | ✓ |
| You decide | Claude picks best approach | |

**User's choice:** Ingestion layer
**Notes:** User wants the source of truth (DB) to be correct, even though it requires a heavier migration.

### Q2: How to verify the scaling fix?

| Option | Description | Selected |
|--------|-------------|----------|
| Spot-check 5-10 banks | Compare against FFIEC CDR filings | |
| Automated reconciliation | Range assertion tests | |
| Both | Manual spot-check plus automated assertions | ✓ |

**User's choice:** Both

---

## Asset Tier Segmentation

### Q3: Which asset tier breakpoints?

| Option | Description | Selected |
|--------|-------------|----------|
| Existing 5-tier (Recommended) | Use current fed-districts.ts tiers | |
| FDIC standard tiers | Use FDIC official asset size groupings | ✓ |
| Custom breakpoints | New tiers optimized for fee analysis | |

**User's choice:** FDIC standard tiers

### Q4: Backward compatibility?

| Option | Description | Selected |
|--------|-------------|----------|
| Replace everywhere | Switch all tier references to FDIC standard | ✓ |
| FDIC for Call Reports only | Two tier systems in parallel | |
| You decide | Claude determines approach | |

**User's choice:** Replace everywhere

---

## District Indicators

### Q5: Which indicators per district?

| Option | Description | Selected |
|--------|-------------|----------|
| Unemployment rate | Core indicator, partially in place | ✓ |
| Employment growth | Nonfarm payrolls change | ✓ |
| Housing/CRE data | Home price index or CRE data | ✓ |
| Just unemployment | Keep it simple | |

**User's choice:** All three, plus fee-specific metrics: overdraft revenue, other fee revenue, CFPB complaints
**Notes:** User expanded scope to include fee-specific banking metrics per district alongside economic indicators.

---

## B2B Institution Connection

### Q6: How to connect Call Reports to institution slugs?

| Option | Description | Selected |
|--------|-------------|----------|
| Institution profile page | Each slug page shows Call Report financials | |
| Peer comparison view | Powers peer benchmarking | |
| Both profile + peer | Individual profiles AND peer comparison | ✓ |

**User's choice:** Both profile + peer

### Q7: Key insight for bank executives?

| Option | Description | Selected |
|--------|-------------|----------|
| Revenue positioning | Competitive ranking in peer group | |
| Trend + opportunity | Growth trends plus regulatory risk signals | |
| Full financial context | Positioning + trends + regulatory risk | ✓ |

**User's choice:** Full financial context

### Q8: Complaint data source?

| Option | Description | Selected |
|--------|-------------|----------|
| CFPB complaint database | Pull from public complaint API | ✓ |
| Call Report complaint fields | Use existing Call Report fields | |
| Defer complaints to later | Add in future phase | |

**User's choice:** CFPB complaint database

---

## Scope Verification

### Q9: Audit existing implementations?

| Option | Description | Selected |
|--------|-------------|----------|
| Audit first (Recommended) | Run queries, verify, mark done requirements | ✓ |
| Plan for everything | Treat all as open | |
| Trust the scout | Accept findings, plan only gaps | |

**User's choice:** Audit first

---

## Claude's Discretion

- Migration strategy for 38K row backfill
- CFPB API pagination and rate limiting
- Specific FRED series IDs for district employment/housing
- SQL query structure for per-institution views

## Deferred Ideas

- Housing/CRE deep analysis — basic data now, analytics later
- CFPB complaint trend analysis over time
- Institution-level composite health scoring
