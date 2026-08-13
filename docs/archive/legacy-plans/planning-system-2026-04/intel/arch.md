---
updated_at: "2026-04-06T00:00:00.000Z"
---

## Architecture Overview

Full-stack B2B fee intelligence platform with a Next.js 16 App Router frontend, PostgreSQL data layer, Python fee crawler pipeline deployed on Modal serverless, and AI-powered research agents (Hamilton) using Anthropic LLMs via Vercel AI SDK.

## Key Components

| Component | Path | Responsibility |
|-----------|------|---------------|
| App Router Pages | `src/app/` (87 pages) | Server-rendered UI: public, admin, pro tiers |
| Server Actions | `src/app/**/actions.ts` (22 files) | Mutations: fee review, search, peer mgmt, reports |
| Public API (v1) | `src/app/api/v1/` | REST endpoints: fees, index, institutions, OpenAPI |
| Research Agents | `src/app/api/research/`, `src/app/api/hamilton/` | Streaming LLM chat with skill injection |
| Report Engine | `src/lib/report-engine/`, `src/lib/report-templates/` | Generate McKinsey-grade PDF/HTML reports |
| Crawler DB Layer | `src/lib/crawler-db/` (17 modules) | SQL queries via postgres client (no ORM) |
| Auth & Access | `src/lib/auth.ts`, `src/lib/access.ts` | Session cookies, RBAC (viewer/analyst/admin/premium) |
| Fee Taxonomy | `src/lib/fee-taxonomy.ts` | 9 families, 49 categories, 4-tier system |
| Stripe Integration | `src/lib/stripe.ts`, webhook route | Subscription billing and dunning |
| Scout System | `src/lib/scout/` | State-level agent runs for fee discovery |
| Hamilton Agent | `src/lib/hamilton/` | Unified research analyst with voice, validation |
| Fee Crawler | `fee_crawler/` | Python pipeline: seed, discover, extract, categorize, validate |
| Modal Workers | `fee_crawler/modal_app.py` | Scheduled cron jobs (2am-4am ET) on Modal serverless |
| Components | `src/components/` (55 files) | UI: maps, charts, filters, command palette, skeletons |

## Data Flow

```
Institutions (FDIC/NCUA seed) -> URL Discovery (Playwright/HTTP) -> Document Download
-> Fee Extraction (LLM: claude-haiku) -> Categorization (49-category taxonomy)
-> Validation -> Review Queue (admin: approve/reject/edit)
-> Published Index (national + peer segments) -> Public API + Dashboard
-> Hamilton Research Agent -> Reports (McKinsey-grade PDF/HTML)
```

## Conventions

- Server Components by default; `"use client"` pushed as low as possible
- URL-based filters via `parsePeerFilters()` (charter, tiers[], districts[])
- Template literal SQL with `postgres` client (no ORM)
- Singleton read DB connection; open/close pattern for write DB
- Zod validation for API inputs and environment variables
- Session-based auth with HMAC-SHA256 signed cookies (24h TTL)
- Daily cost circuit breaker ($50) for LLM spend
- Fee review pipeline: pending -> staged (auto at >=0.85 confidence) -> approved/rejected
- Path alias `@/*` maps to `./src/*`
