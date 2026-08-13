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

### Active (v10.0)

- [ ] Agent event log with full lineage (event → agent → decision → source doc)
- [ ] Three-tier data architecture: Raw → Business → Presentation
- [ ] 5-step self-improvement loop (LOG, REVIEW, DISSECT, UNDERSTAND, IMPROVE) as first-class contract on every agent
- [ ] Inter-agent communication protocol (Darwin↔Knox challenge/prove handshake)
- [ ] Observability: every Tier 3 number traceable back to originating crawl event
- [ ] Adversarial review gate on Tier 2 → Tier 3 promotion
- [ ] Bootstrap protocol (Q1 human-validated, Q2 high-confidence auto, Q3+ autonomy-with-exceptions)
- [ ] Per-agent cost quotas (Knox: quarterly burst; Darwin: per-batch; Hamilton: per-report)
- [ ] Golden-corpus testing pattern for agents (contract tests, fixture replay, canary runs, shadow mode)
- [ ] SQLite fully eliminated from all production paths

### Out of Scope

- Admin UI redesign — current admin works, focus on agent architecture
- Mobile app — web-first
- Real-time fee monitoring — quarterly cadence is sufficient (state agents run 4x/year)
- Any new user-facing features during v10.0 — this milestone is foundation only
- Continued dual-support for SQLite — kill it, do not preserve

## Current Milestone: v10.0 Pipeline Integrity and Agent Team Foundation

**Goal:** Transform the current collection of disconnected stages into a hierarchical agent team — Hamilton coordinating Knox, Darwin, and Atlas at the top, with Knox commanding a fleet of 51 state agents in the field — all operating under a 5-step self-improvement loop, with source lineage restored and a three-tier data architecture (Raw → Business → Presentation) that Hamilton consumes.

**Agent team (locked 2026-04-16):**
- **Hamilton** — synthesis / consultant; reads Tier 3 only
- **Knox** — data command; supervises 51 state agents; aggregates cross-state knowledge
- **Darwin** — classification / verification; adversarial-challenges Knox's data; owns Tier 1 → Tier 2 promotion
- **Atlas** — orchestration; schedules, routes, manages per-agent cost budgets
- **State agents (×51)** — one per state + DC; own their territory's institutions; compound per-state knowledge; report up to Knox

**Operating contract — 5-step loop:** every agent honors LOG → REVIEW → DISSECT → UNDERSTAND → IMPROVE as a first-class architectural requirement.

**Three-tier data model:** Raw (Tier 1, Knox's state agents write here) → Business (Tier 2, Darwin-verified, admin-reviewable) → Presentation (Tier 3, adversarially-gated, Hamilton reads). Lineage preserved from any Tier 3 number back to the originating crawl event.

**Target features:**
- Phase 62a — Data Foundation (event log, 3-tier schema, write-CRUD tools, cost quotas)
- Phase 62b — Runtime Foundation (5-step loop, inter-agent comms, observability lineage, adversarial gate, bootstrap protocol, testing pattern)
- Phase 63 — Knox + 51-state agent fleet (quarterly cadence; source lineage restored; per-institution dossiers compound)
- Phase 64 — Darwin (categorization QA, challenge-protocol, active learning, Tier 1→2 promotion)
- Phase 65 — Atlas (scheduling, cost-tier budgets, escalation queue, knowledge promotion cron)
- Phase 66 — Hamilton refactor (reads only Tier 3, source badges, refuses un-traced data)
- Phase 67 — Capability discovery + tool primitives + UI silent-actions
- Phase 68 — RLS + security + final hardening

**Not in scope:** any new user-facing feature; any Phase 59-61 rework; any continued dual-support for SQLite (kill it entirely per `project_kill_sqlite.md`).

**Source material:** `.planning/audits/2026-04-16-pipeline-audit/` (4 mapping docs + pipeline synthesis + agent-native synthesis).

**Previous milestones:**
- v1.0 E2E Pipeline Test Suite (shipped 2026-04-06)
- v2.0 Hamilton Research & Content Engine (shipped 2026-04-07)
- v3.0 National Coverage Push (shipped 2026-04-08)
- v5.0 National Data Layer (shipped 2026-04-08)
- v6.0 Two-Sided Experience (in progress)
- v7.0 Hamilton Reasoning Engine (shipped 2026-04-08)
- v8.0 Hamilton Pro Platform (shipped 2026-04-09)
- v8.1 Hamilton Pro Live Data Wiring (shipped 2026-04-10)
- v9.0 Data Foundation & Production Polish (in progress, Phase 55 infrastructure-complete; Phases 56-61 shipped)

## Context

- Next.js 16 App Router + React 19 + Tailwind v4 frontend
- Python 3.12 pipeline on Modal (Playwright + Claude Haiku extraction)
- **Supabase PostgreSQL is the sole data store** — no SQLite in any production path; legacy SQLite in `fee_crawler/db.py` is deprecated per `project_kill_sqlite.md` and will be eliminated during v10.0
- State agents run against Supabase (proven on Wyoming 91%, Montana 47%); quarterly cadence going forward
- Compounding knowledge in `fee_crawler/knowledge/` (national + per-state) — promoted into shared agent memory in v10.0
- Existing skills: executive-report, monthly-pulse, consumer-guide, fee-benchmarking, competitive-intelligence, district-economic-outlook, fee-revenue-correlation, data-quality-audit

## Constraints

- **Content quality**: Reports must look like they came from McKinsey — not dashboards, not data dumps
- **Accuracy**: All data in reports must trace to pipeline-verified fees
- **Cost**: Claude API calls for Hamilton analysis are acceptable ($5-10 per report)
- **No overlap**: Pipeline/agent work is being done by the owner in parallel — this milestone is content layer only

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Hamilton as AI analyst persona | Consistent brand voice, scalable, memorable name | Validated v2.0+ |
| B2B primary, consumer secondary | Banks/consultants pay, consumers drive visibility | Validated v8.0 |
| Template + Claude hybrid reports | Recurring = cheap templates, on-demand = deep Claude analysis | Validated v2.0/v7.0 |
| $2,500/mo subscription model | Peer benchmarking on demand justifies premium pricing | Validated v8.0 |
| Hierarchical agent team (Hamilton / Knox / Darwin / Atlas + 51 state agents) | Prior monolithic pipeline layered without connecting; specialized agents with shared contract + peer challenge solve the coordination problem | Locked v10.0 (2026-04-16) |
| Three-tier data architecture (Raw / Business / Presentation) | Solves confirmation bias, observability, Hamilton credibility in one model; maps to medallion-architecture industry standard | Locked v10.0 |
| 5-step loop (LOG / REVIEW / DISSECT / UNDERSTAND / IMPROVE) as agent contract | Every agent must be an observation/learning machine, not just a function | Locked v10.0 |
| Quarterly cadence for Knox + state fleet | Fees change slowly; 4x/year is enough; bounds cost; prevents confirmation-bias cascades from high-frequency retraining | Locked v10.0 |
| Darwin and Knox mutually adversarial, no 5th agent | Two-way peer challenge is simpler than a dedicated devil's advocate; each agent's role already implies challenge | Locked v10.0 |
| Kill SQLite completely in v10.0 | Dual-support is schema-drift fuel; Supabase is the single source of truth | Locked v10.0 |

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
*Last updated: 2026-04-16 after v10.0 milestone start (Pipeline Integrity and Agent Team Foundation)*
