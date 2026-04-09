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
- ✓ Global thesis engine (quarterly thesis generation from data payload) — v7.0
- ✓ Voice v3.1 (revenue-first, tension model, think-then-compress, 150-200 words) — v7.0
- ✓ Unified chat persona (single Hamilton with consumer/pro/admin roles) — v7.0
- ✓ 12-source queryNationalData + queryRegulatoryRisk tool — v7.0
- ✓ Editor v2 (thesis alignment, revenue prioritization, "so what?" checks) — v7.0
- ✓ 17 tool descriptions with Returns/When/Combine-with guidance — v7.0
- ✓ Hamilton Pro architecture foundation (CSS isolation, screen DTOs, mode behavior, navigation contract) — v8.0 Phase 38
- ✓ Hamilton Pro DB schema (6 tables: analyses, scenarios, reports, watchlists, signals, alerts) — v8.0 Phase 39
- ✓ Hamilton shell layout (route group, auth gating, TopNav, ContextBar, LeftRail, UpgradeGate) — v8.0 Phase 40
- ✓ Settings page (institution profile, peer sets, intelligence snapshot, feature toggles, billing) — v8.0 Phase 41
- ✓ 5 screen shells with component architecture (Home, Analyze, Simulate, Reports, Monitor) — v8.0 Phases 42-46

### Active

- [ ] Settings cleanup: DB migration for fed_district + Stripe billing portal wiring
- [ ] Monitor: real signal queries, watchlist CRUD, empty states (strip demo data)
- [ ] Home/Briefing: real thesis generation, real index data, real alerts
- [ ] Analyze: verified streaming with Hamilton API, real focus tab context injection
- [ ] Simulate: category-agnostic fee simulation (all 49 categories), real distribution data, confidence gating
- [ ] Reports: client-oriented templates (Peer Benchmarking, Regional, Category Deep Dive, Competitive Positioning), real generation pipeline, PDF export
- [ ] Integration pass: screen-to-screen flows (Home CTA -> Simulate -> Report)

### Out of Scope

- Admin UI redesign — current admin works, focus on data coverage
- Mobile app — web-first
- Real-time fee monitoring — batch/quarterly cadence is sufficient
- Wave orchestrator / iterative deepening — deferred from v3.0, pipeline work done in parallel by owner
- A/B testing settings page variants — deferred to post-launch polish
- v6.0 remaining work (B2B launchpad, PDF export) — subsumed by Report Builder screen
- New UI components or screen redesigns — v8.0 built all shells, v8.1 is data wiring only
- Signal pipeline automation — seeding signals is manual/dev-only for now, automation deferred post-v8.1

## Current Milestone: v8.1 Hamilton Pro Live Data Wiring

**Goal:** Wire every Hamilton Pro screen to real data, strip all hardcoded/demo content, and deliver a production-ready paid experience.

**Target features:**
- Settings cleanup (DB migration for fed_district + Stripe billing portal wiring)
- Monitor: real signal queries, watchlist CRUD, empty states (strip demo data)
- Home/Briefing: real thesis generation, real index data, real alerts
- Analyze: verified streaming with Hamilton API, real focus tab context injection
- Simulate: category-agnostic fee simulation (all 49 categories), real distribution data, confidence gating
- Reports: client-oriented templates (Peer Benchmarking, Regional, Category Deep Dive, Competitive Positioning), real generation pipeline, PDF export
- Integration pass: screen-to-screen flows (Home CTA -> Simulate -> Report)

## Current State

**Latest shipped:** v8.0 Hamilton Pro Platform (2026-04-09) — screen shells + architecture
**v8.1 progress:** Not started (defining requirements)

**Previous milestones:**
- v1.0 E2E Pipeline Test Suite (shipped 2026-04-06)
- v2.0 Hamilton Research & Content Engine (shipped 2026-04-07)
- v3.0 National Coverage Push (shipped 2026-04-08)
- v4.x Report Design (completed 2026-04-07 -- template v4.2 deployed)
- v5.0 National Data Layer (completed 2026-04-08)
- v6.0 Two-Sided Experience (Phases 28-32 partially shipped — consumer landing + institution pages done, B2B launchpad + PDF export deferred)
- v7.0 Hamilton Reasoning Engine (shipped 2026-04-08)
- v8.0 Hamilton Pro Platform (Phases 38-46 — architecture, DB tables, shell, settings, 5 screen shells with demo content)

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
| Hamilton as AI analyst persona | Consistent brand voice, scalable, memorable name | ✓ Good — unified persona ships in v7.0 |
| B2B primary, consumer secondary | Banks/consultants pay, consumers drive visibility | ✓ Good — role-based depth (consumer/pro/admin) |
| Template + Claude hybrid reports | Recurring = cheap templates, on-demand = deep Claude analysis | ✓ Good — thesis engine adds depth layer |
| $2,500/mo subscription model | Peer benchmarking on demand justifies premium pricing | — Pending |
| Unified Hamilton replaces 4 agents | Single getHamilton(role) shares one reasoning layer | ✓ Good — v7.0, simpler codebase |
| Revenue-first insight ordering | Revenue implications lead, pricing data follows | ✓ Good — v7.0 voice rules + editor enforcement |
| Editor v2 informational only | Non-blocking validation preserves pipeline resilience | ✓ Good — v7.0, flags but doesn't block rendering |

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
*Last updated: 2026-04-09 after v8.1 milestone start*
