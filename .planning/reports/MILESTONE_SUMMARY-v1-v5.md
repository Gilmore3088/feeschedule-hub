# Bank Fee Index -- Full Project Summary (v1.0 through v5.0)

**Generated:** 2026-04-08
**Purpose:** Team onboarding and project review

---

## 1. Project Overview

**Bank Fee Index** is the national authority on bank and credit union fee data. A B2B platform that collects, analyzes, and publishes fee intelligence across 4,000+ financial institutions, powered by AI agents that crawl fee schedules and an AI research analyst (Hamilton) that produces McKinsey-grade reports.

**Revenue model:** Subscriptions ($2,500/mo for peer benchmarking), consulting, and consumer-side ads/affiliates.

**Core value:** Accurate, complete, timely fee data with rich analysis -- the kind of insight a bank executive would pay a consulting firm $15K to produce, generated on demand from live pipeline data.

**Tech stack:** Next.js 16 (App Router) + React 19 + Tailwind v4 + Postgres (Supabase) + Python 3.12 (fee crawler) + Anthropic Claude API + Modal (serverless workers) + Vercel + Stripe.

---

## 2. Architecture

### Data Flow
```
FDIC/NCUA APIs → Python crawler (Modal workers) → Postgres DB
                                                       ↓
                                           TypeScript query layer
                                                       ↓
                              Hamilton (AI agent) ← → Admin Portal
                                    ↓                      ↓
                              PDF Reports          Data verification
                                    ↓
                           Stripe subscriptions
```

### Key Architectural Decisions

| Decision | Rationale | Phase |
|----------|-----------|-------|
| `* 1000` scaling at SQL query level | Explicit, grep-able, no hidden magic | 23 |
| `RichIndicator` shape for all time-series | Consistent API -- Hamilton treats all indicators the same | 23 |
| One function per requirement pattern | Testable, clear, matches codebase conventions | 23 |
| LLM summaries pre-computed during ingestion | Zero latency at query time, ~$0.15/edition | 24 |
| Hamilton = single universal agent | No legacy agents, no dead ends, everything rolls up | 25 |
| Single `queryNationalData` tool with section param | One tool call for full national picture | 25 |
| Postgres tsvector for external intelligence search | Lightweight FTS, no vector DB at <1000 docs | 27 |
| Sequential wave execution (MAX_CONCURRENT=1) | Reliability over speed for unattended runs | 19 |
| 3-tier strategy escalation per state | Easy → Playwright → aggressive PDF/keyword search | 20 |
| Cross-state pattern promotion at 3+ threshold | Balances signal vs noise in national knowledge | 21 |

---

## 3. Milestones & Phases Delivered

### v1.0 E2E Pipeline Test Suite (shipped 2026-04-06)

| Phase | Name | Status |
|-------|------|--------|
| 1 | Test Infrastructure | Complete |
| 2 | Seed Stage Tests | Complete |
| 3 | Discovery Stage Tests | Complete |
| 4 | Extraction Stage Tests | Complete |
| 5 | Categorization Stage Tests | Complete |
| 6 | Validation Stage Tests | Complete |
| 7 | Audit Trail Verification | Complete |
| 8 | Idempotency and Timing | Complete |
| 9 | Full Pipeline Test | Complete |
| 10 | CI Integration | Complete |
| 11 | Modal Pre-flight | Complete |

**What it delivered:** Comprehensive pytest test suite covering all 5 stages of the fee crawler pipeline. GitHub Actions CI with nightly fast + weekly full runs. Modal pre-flight validation.

### v2.0 Hamilton -- Research & Content Engine (shipped 2026-04-07)

| Phase | Name | Status |
|-------|------|--------|
| 12 | Hamilton Foundation | Complete |
| 13 | Report Engine Core | Complete |
| 14 | Recurring Reports | Complete |
| 15 | Premium Products | Complete |
| 16 | Public Catalog + Go-to-Market | Complete |
| 17 | Hamilton Chat | Complete |
| 18 | Report Assembly Pipeline | Complete |

**What it delivered:** Hamilton AI research agent with streaming chat, report engine with Modal render workers, R2 artifact storage, Stripe subscriptions, public report catalog, and the full report assembly pipeline.

### v3.0 National Coverage Push (shipped 2026-04-08)

| Phase | Name | Status |
|-------|------|--------|
| 19 | Wave Orchestrator | Complete |
| 20 | Iterative Deepening | Complete |
| 21 | Knowledge Automation | Complete |
| 22 | Wave Reporting | Complete |

**What it delivered:** Fire-and-forget crawler automation. Wave orchestrator batches all 50 states, runs 3-pass iterative deepening (easy → Playwright → PDF), auto-promotes cross-state patterns to national knowledge, and generates post-wave Markdown reports.

**CLI:**
```
python -m fee_crawler wave run [--max-passes 5] [--states WY,MT]
python -m fee_crawler wave resume <wave_id>
python -m fee_crawler wave recommend
python -m fee_crawler wave report <wave_id>
python -m fee_crawler knowledge prune --all
python -m fee_crawler knowledge status
```

### v5.0 National Data Layer (shipped 2026-04-08)

| Phase | Name | Status |
|-------|------|--------|
| 23 | Call Report & FRED Foundation | Complete |
| 24 | Industry Health & Beige Book | Complete |
| 25 | Derived Analytics & Hamilton Tools | Complete |
| 26 | National Data Admin Portal | Complete |
| 27 | External Intelligence System | Complete |

**What it delivered:** Complete national data foundation. Call Report revenue with correct scaling + charter/tier splits. FRED economic indicators as rich objects with history + trend. Industry health metrics (ROA, deposits, loans). Beige Book LLM summaries with theme extraction. Derived analytics (concentration, dependency, per-institution). Hamilton consolidated with `queryNationalData` + `searchIntelligence` tools. Admin Data Hub portal with 5 tabs. External intelligence ingestion with full-text search.

**Data query modules:**
- `call-reports.ts` -- 5 revenue functions with `* 1000` scaling
- `fed.ts` -- FRED summary, Beige Book queries, district indicators
- `health.ts` -- ROA/ROE/efficiency, deposit/loan growth, charter segmentation
- `derived.ts` -- Revenue concentration, fee dependency, per-institution averages
- `intelligence.ts` -- External intelligence CRUD + search

---

## 4. Requirements Coverage

### v5.0 (29 requirements -- all complete)

| Category | Requirements | Status |
|----------|-------------|--------|
| Call Report Revenue (CALL) | CALL-01 through CALL-06 | All complete |
| FRED Economic Data (FRED) | FRED-01 through FRED-04 | All complete |
| Beige Book (BEIGE) | BEIGE-01 through BEIGE-03 | All complete |
| Industry Health (HEALTH) | HEALTH-01 through HEALTH-04 | All complete |
| Derived Analytics (DERIVE) | DERIVE-01 through DERIVE-03 | All complete |
| Admin Portal (ADMIN) | ADMIN-01 through ADMIN-05 | All complete |
| External Intelligence (INTEL) | INTEL-01 through INTEL-04 | All complete |

### v6.0 (24 requirements -- not started)
- SHELL-01 through SHELL-03: Audience shell separation (Phase 28 in progress)
- CLND-01 through CLND-08: Consumer landing page
- INST-01 through INST-04: Institution educational pages
- B2B-01 through B2B-05: B2B launchpad dashboard
- RPT-01 through RPT-04: Scoped report generation

---

## 5. Test Coverage

| Module | Tests | Framework |
|--------|-------|-----------|
| call-reports.test.ts | 40 | vitest |
| fed.test.ts | 30 | vitest |
| health.test.ts | 26 | vitest |
| derived.test.ts | 21 | vitest |
| intelligence.test.ts | 12 | vitest |
| personalization.test.ts | 9 | vitest |
| format/taxonomy/districts | 60 | vitest |
| test_iterative_deepening.py | 18 | pytest |
| test_wave_orchestrator.py | 22 | pytest |
| test_wave_reporter.py | 12 | pytest |
| test_ingest_beige_book.py | 11 | pytest |
| fee_analysis + validation (Python) | 60 | pytest |
| **Total** | **~320** | |

**Commands:**
```
npx vitest run                           # TypeScript tests
python -m pytest fee_crawler/tests/      # Python tests
```

---

## 6. Tech Debt & Deferred Items

### Known Issues
- Phase 23 ROADMAP plan checklist may be stale (F-03 from audit)
- FDIC RIAD4070 (overdraft revenue) field not exposed by BankFind API -- column exists but NULL until FFIEC CDR bulk download path established
- 7 pre-existing test failures in fees.test.ts (winsorization) and hamilton/voice.test.ts -- predate v5.0

### Deferred to v6.0+
- File upload (PDF/DOCX) for external intelligence -- text paste covers 90% of use cases
- Vector embeddings for semantic search -- overkill at <1000 documents
- Automated RSS/feed ingestion of industry publications
- BLS data integration, additional FRED series
- State/regional report data layer (state-specific Call Reports)

### Worktree Merge Pattern (operational)
Git worktree-based parallel execution has a recurring issue: worktree branches created from HEAD before planning files existed delete those files on cherry-pick. Requires manual restoration via `git checkout <commit> -- .planning/phases/` after each cherry-pick. Consider committing full Python codebase to git to prevent working directory data loss.

---

## 7. Getting Started

### Run the project
```bash
npm run dev                              # Next.js dev server (localhost:3000)
npm run build                            # Production build
```

### Key directories
```
src/app/                                 # Next.js App Router pages
src/app/admin/                           # Admin portal (auth required)
src/app/admin/national/                  # Data Hub portal (v5.0)
src/app/(public)/                        # Consumer-facing pages
src/app/pro/                             # Pro subscriber pages
src/lib/crawler-db/                      # Data query layer (20+ files)
src/lib/hamilton/                         # Hamilton agent + tools
src/lib/research/                        # Research agent system
fee_crawler/                             # Python crawler pipeline
fee_crawler/agents/                      # State agent + stage implementations
fee_crawler/wave/                        # Wave orchestrator + reporting
fee_crawler/knowledge/                   # State knowledge files + promoter
```

### Entry points
- **Admin Data Hub:** `/admin/national` -- 5-tab portal for data verification
- **Hamilton Chat:** `/admin/hamilton` -- AI research agent
- **Wave CLI:** `python -m fee_crawler wave run` -- automated crawling
- **API:** `/api/v1/fees`, `/api/v1/index`, `/api/v1/institutions`

### Tests
```bash
npx vitest run                           # ~200 TS tests
python -m pytest fee_crawler/tests/      # ~120 Python tests
```

---

## Stats

- **Timeline:** 2026-04-06 → 2026-04-08 (3 days)
- **Milestones:** 4 shipped (v1.0, v2.0, v3.0, v5.0)
- **Phases:** 27 complete, 1 in progress (28), 4 not started (29-32)
- **Commits:** 518
- **Files changed:** 500 (+67,861 / -13,201)
- **Contributors:** James Gilmore
- **v6.0 status:** Phase 28 (Audience Shell Separation) in progress
