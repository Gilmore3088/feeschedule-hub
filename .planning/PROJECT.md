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

## Current Milestone: v7.0 Hamilton Reasoning Engine

**Goal:** Upgrade Hamilton from a section-based report writer to a unified intelligence engine with global thesis generation, cross-source reasoning, and role-based delivery for admin, B2B, and consumers.

**Target features:**
- Global thesis generator (quarterly thesis emerges from data, not hardcoded)
- Voice v3 (150-200 words per section, think-then-compress, revenue prioritization, tension model)
- Section generator v2 (cross-source context — fees + revenue + economic + regulatory + complaints in every analysis)
- Unified chat persona (consolidate 4 agents into 1 role-based Hamilton)
- Editor v2 (thesis alignment across sections, contradiction detection, revenue > pricing validation)
- Tool descriptions v2 (strategic guidance for when to pull what data)

**Not in scope:** Signal detection/ingestion (v8.0), consumer delivery (v9.0), scheduled automation (v8.0).

**Master spec:** `docs/specs/hamilton-v2-master-spec.md`

**Previous milestones:**
- v1.0 E2E Pipeline Test Suite (shipped 2026-04-06)
- v2.0 Hamilton Research & Content Engine (shipped 2026-04-07)
- v3.0 National Coverage Push (shipped)
- v4.x Report Design (completed 2026-04-07 -- template v4.2 deployed)
- v5.0 National Data Layer (completed 2026-04-08 -- Call Reports, FRED, Beige Book, CFPB, derived analytics)
- v6.0 Two-Sided Experience (in progress -- consumer/B2B layout shells, landing pages)

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
