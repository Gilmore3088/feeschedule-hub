# Refactor: Admin Nav Consolidation

## Overview

The Ops nav section has 8 items and growing. Several items overlap in function (Pipeline, Operations, Quality, Extracts, Review are all data lifecycle). Research is a different function entirely (content/lead-gen). This plan reorganizes the nav into clear, purpose-driven sections.

## Current Nav (11 items, 3 groups)

```
Dashboard

INDEX
  Market          — Bloomberg-style segment analysis
  National        — National Fee Index
  Peer            — Peer comparison tool
  Categories      — Fee catalog (49 categories)

OPS (too many!)
  Pipeline        — Coverage gaps, URL ingestion, funnel
  Operations      — Crawl runs, system health
  Institutions    — Browse all institutions
  Review          — Approve/reject extracted fees
  Research        — AI agents for content creation
  Districts       — Fed district reports
  Extracts        — Raw extracted fee data
  Quality         — Coverage funnel, tier/charter breakdowns
```

## Proposed Nav (11 items, 4 groups)

```
Dashboard

BENCHMARKS
  Market          — Bloomberg-style segment analysis
  National        — National Fee Index
  Peer            — Peer comparison tool
  Categories      — Fee catalog (49 categories)
  Districts       — Fed district geographic analysis

DATA
  Pipeline        — Coverage gaps, URL ingestion, quality metrics
  Review          — Approve/reject/flag fees
  Institutions    — Browse all institutions + extracts

RESEARCH
  Research Hub    — AI agents, content creation, analysis

```

### What changes

| Item | Current | Proposed | Rationale |
|------|---------|----------|-----------|
| Districts | Ops | Benchmarks | It's geographic analysis, not operations |
| Pipeline | Ops | Data | Absorbs Quality + Operations (funnel, crawl health, quality cards already there) |
| Operations | Ops | Merged into Pipeline | Pipeline page already has recent crawls and funnel |
| Quality | Ops | Merged into Pipeline | Pipeline already shows quality cards from hygiene.ts |
| Extracts | Ops | Merged into Institutions | Extracts is just "fees by institution" — same as clicking into an institution |
| Review | Ops | Data | Core data workflow — approve/reject fees |
| Institutions | Ops | Data | Browse + manage institutions |
| Research | Ops | Research (own section) | Separate purpose: content creation, lead-gen, analysis |

### Items removed from nav (merged)

1. **Operations** — merged into Pipeline (recent crawls section already there)
2. **Quality** — merged into Pipeline (quality cards already there)
3. **Extracts** — merged into Institutions (extracts are institution-level fee data)

### Net result: 8 nav items (down from 11), 4 clear groups

## Implementation

### Phase 1: Rename groups and move items in admin-nav.tsx

**File**: `src/app/admin/admin-nav.tsx`

Restructure `NAV_GROUPS` to:
1. Dashboard (standalone)
2. Benchmarks: Market, National, Peer, Categories, Districts
3. Data: Pipeline, Review, Institutions
4. Research: Research Hub

### Phase 2: Redirect removed routes

- `/admin/ops` -> redirect to `/admin/pipeline` (or keep as alias)
- `/admin/quality` -> redirect to `/admin/pipeline` (quality cards are there)
- `/admin/fees` (Extracts) -> redirect to `/admin/institutions` or keep as-is

### Phase 3: Ensure Pipeline page has all Operations + Quality content

Pipeline already has:
- Coverage funnel (was in Quality)
- Quality cards (uncategorized, null amounts, duplicates)
- Recent crawls (was in Operations)
- Coverage gaps table
- URL submission

May need to add from Operations page:
- Crawl run history (if more detailed than recent crawls)
- System health metrics

May need to add from Quality page:
- Tier coverage breakdown
- Charter coverage breakdown

## Acceptance Criteria

- [ ] Nav reorganized into 4 groups: Dashboard, Benchmarks, Data, Research
- [ ] Districts moved to Benchmarks group
- [ ] Operations and Quality merged into Pipeline
- [ ] Extracts merged into Institutions or removed from nav
- [ ] Research gets its own section
- [ ] Old routes redirect to new locations
- [ ] No functionality lost — everything accessible from new locations

## Files to Modify

| File | Change |
|------|--------|
| `src/app/admin/admin-nav.tsx` | Reorganize NAV_GROUPS |
| `src/app/admin/ops/page.tsx` | Add redirect or keep as secondary view |
| `src/app/admin/quality/page.tsx` | Add redirect to /admin/pipeline |

## References

- `src/app/admin/admin-nav.tsx` — current nav structure
- `src/app/admin/pipeline/page.tsx` — already has funnel + quality + recent crawls
- `src/app/admin/ops/page.tsx` — operations page to merge
- `src/app/admin/quality/page.tsx` — quality page to merge
