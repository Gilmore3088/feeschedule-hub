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

- [ ] Hamilton AI analyst persona (consistent voice, byline, tone)
- [ ] Report design system (McKinsey-grade templates, shared visual language)
- [ ] National Fee Index quarterly report
- [ ] State Fee Index reports (per-state, data-driven + Hamilton narrative)
- [ ] Monthly pulse reports (automated recurring)
- [ ] Competitive peer briefs (Hamilton deep analysis, on-demand premium product)
- [ ] Multi-dimensional slicing (state, MSA, Fed district, charter, asset tier)
- [ ] Consumer-facing institution fee lookup
- [ ] Methodology paper (how the index works)

### Out of Scope

- Building more pipeline/agent infrastructure — owner is building that in parallel
- Admin UI redesign — current admin works, focus on content output
- Mobile app — web-first
- Real-time fee monitoring — batch/quarterly cadence is sufficient

## Current Milestone: v2.0 Hamilton — Research & Content Engine

**Goal:** Build the report engine and content library that establishes Bank Fee Index as the national authority on bank fees, powered by Hamilton, the AI research analyst.

**Business model:** B2B primary (banks + consultants ~$2,500/mo), consumer site secondary (traffic/ads/affiliates)

**Two report modes:**
- Template-driven (recurring, cheap) — national/state indexes, monthly pulse
- Hamilton-heavy (on-demand, high-value) — competitive briefs, peer reports

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
*Last updated: 2026-04-06 after v2.0 milestone start*
