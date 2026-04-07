# Bank Fee Index

## What This Is

The national authority on bank and credit union fee data. A B2B platform that collects, analyzes, and publishes fee intelligence across 4,000+ financial institutions, powered by AI agents that crawl fee schedules and an AI research analyst (Hamilton) that produces McKinsey-grade reports. Revenue from subscriptions ($2,500/mo for peer benchmarking), consulting, and consumer-side ads/affiliates.

## Core Value

Accurate, complete, timely fee data with rich analysis — the kind of insight a bank executive would pay a consulting firm $15K to produce, generated on demand from live pipeline data.

## Requirements

### Validated

- ✓ FDIC/NCUA institution seeding — v1.0
- ✓ Cascading URL discovery (sitemap, common paths, AI + Playwright) — v1.0 + agents
- ✓ LLM fee extraction via Claude with tool-use schema — v1.0 + agents
- ✓ Fee categorization (9 families, 49 categories) — v1.0
- ✓ Confidence-based validation and auto-staging — v1.0
- ✓ E2E test suite (27 tests, CI integration, Modal pre-flight) — v1.0
- ✓ State Agent (5-stage: inventory → discover → classify → extract → validate) — built parallel
- ✓ Compounding knowledge system (national + state-level learnings) — built parallel
- ✓ FeeScout research pipeline (4-agent SSE) — built parallel
- ✓ URL audit pipeline (4-agent) — built parallel
- ✓ State detail pages with interactive institution tables — built parallel
- ✓ Account product tagging + fee cap detection — built parallel
- ✓ Wyoming 91% coverage, Montana 47% — built parallel

### Active

- [ ] Wave orchestrator for batched state crawl campaigns
- [ ] Iterative deepening strategy (easy URLs → harder discovery → PDF sources)
- [ ] Automated knowledge logging (learnings feed next iteration)
- [ ] Per-state coverage tracking and progress reporting
- [ ] State prioritization by institution count (largest first)
- [ ] Coverage targets: 50%+ baseline, 75%+ gold

### Out of Scope

- Admin UI redesign — current admin works, focus on data coverage
- Mobile app — web-first
- Real-time fee monitoring — batch/quarterly cadence is sufficient

## Current Milestone: v5.0 National Data Layer

**Goal:** Build the data foundation that Hamilton needs to produce credible national analysis. Fix data queries, create summary views, and build admin portal pages for national data — the raw work that feeds reports later.

**Target features:**
- Fix Call Report revenue queries (scaling thousands→dollars, YoY trends, bank vs CU, top institutions)
- FRED economic summaries (rates, unemployment, CPI YoY, consumer sentiment — verified and complete)
- Beige Book district summaries (condensed economic narratives per district)
- Industry health summaries (ROA, efficiency, deposits, loans from institution_financials)
- Derived metrics (fee_income_ratio, revenue concentration, charter comparisons)
- Admin portal pages for national data (`/admin/national` — raw summaries before they hit reports)
- Hamilton can query and digest all data sources via tools

**Not in scope:** Report template redesign — v4.2 template is locked. This builds data; future milestone wires it into reports.

**Previous milestones:**
- v1.0 E2E Pipeline Test Suite (shipped 2026-04-06)
- v2.0 Hamilton Research & Content Engine (shipped 2026-04-07)
- v3.0 National Coverage Push (in progress — agents running state crawls in parallel)
- v4.x Report Design (completed 2026-04-07 — template v4.2 deployed)

## Context

- Next.js 16 App Router + React 19 + Tailwind v4 frontend
- Python 3.12 pipeline on Modal (Playwright + Claude Haiku extraction)
- SQLite local / PostgreSQL (Supabase) production
- Compounding knowledge in `fee_crawler/knowledge/` (national + per-state)
- State Agent proven on Wyoming (91%) and Montana (47%)
- Existing skills: executive-report, monthly-pulse, consumer-guide, fee-benchmarking, competitive-intelligence, district-economic-outlook, fee-revenue-correlation, data-quality-audit

## Constraints

- **Content quality**: Reports must look like they came from McKinsey — not dashboards, not data dumps
- **Accuracy**: All data in reports must trace to pipeline-verified fees
- **Cost**: Claude API calls for Hamilton analysis are acceptable ($5-10 per report)
- **No overlap**: Pipeline/agent work is being done by the owner in parallel — this milestone is content layer only

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Hamilton as AI analyst persona | Consistent brand voice, scalable, memorable name | — Pending |
| B2B primary, consumer secondary | Banks/consultants pay, consumers drive visibility | — Pending |
| Template + Claude hybrid reports | Recurring = cheap templates, on-demand = deep Claude analysis | — Pending |
| $2,500/mo subscription model | Peer benchmarking on demand justifies premium pricing | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition:**
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone:**
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-06 after v3.0 milestone start*
