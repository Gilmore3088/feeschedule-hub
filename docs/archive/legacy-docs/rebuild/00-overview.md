# Bank Fee Index — Backend Rebuild Plan

> **Created:** 2026-03-22  
> **Goal:** 50%+ fee coverage (35,000+ institutions) with a sustainable, cost-efficient, scalable backend  
> **Current state:** ~3% coverage (2,115 / 71,923 institutions), SQLite on Fly.io, weekly cron processing 100 institutions/run

---

## The Problem in One Sentence

We are running a continuously-needed intelligence system as a weekly batch script on a 512MB machine shared with the web server.

## The Fix in One Sentence

Separate the web app (Vercel), the database (Supabase Postgres), the workers (Modal), and the document store (Cloudflare R2) — then run discovery and extraction at real scale for the first time.

---

## Coverage Funnel — Current vs Target

```
CURRENT                                    TARGET
───────────────────────────────────────    ───────────────────────────────────────
71,923 institutions seeded                 71,923 institutions seeded
  ↓ 92%  have website_url                   ↓ 92%  have website_url
  ↓ 4.7% have fee_schedule_url ← BROKEN     ↓ 50%+ have fee_schedule_url
  ↓ 84%  download succeeds                  ↓ 85%  download succeeds
  ↓ 88%  text extracted                     ↓ 90%  text extracted
  ↓ 92%  LLM extraction works              ↓ 95%  extraction works (rules + LLM)
                                           
= 2,115 institutions (3%)                 = 35,000+ institutions (50%+)
```

**Root cause:** `discover_urls` has never been run at scale. 63,000 institutions have a website but no fee URL. The weekly GitHub Actions cron with `--limit 100` processes ~400 institutions/month against a 71,923-institution database.

---

## Stack Before → After

| Layer | Before | After | Why |
|---|---|---|---|
| Web hosting | Fly.io (shared w/ crawler) | **Vercel** | Purpose-built for Next.js, edge cache, zero config |
| Database | SQLite + Litestream on Fly volume | **Supabase Postgres** | Concurrent writes, `FOR UPDATE SKIP LOCKED` job queue, pg_cron |
| Python workers | GitHub Actions SSH cron | **Modal** (serverless) | Pay-per-use, no idle cost, async-native, 6hr timeout |
| Document store | Fly.io local volume | **Cloudflare R2** | Content-addressed, free egress, decouples download from extraction |
| LLM model | Sonnet real-time | **Haiku + Batch API** | 5x cheaper model + 50% batch discount = 10x total savings |
| Job scheduling | GitHub Actions | **pg_cron** (built into Supabase) | Native to Postgres, no SSH, no timeouts |
| HTTP client (Python) | `requests` + ThreadPoolExecutor | **httpx + asyncio** | True async, 20 concurrent tasks vs 2 sync threads |

---

## Cost Comparison

| Scenario | One-time LLM (70K insts) | Monthly infra |
|---|---|---|
| Current approach at scale | ~$1,155 | ~$15 |
| **New approach (Haiku + Batch + Rules)** | **~$62** | **~$8–25** |

---

## Plan Index

| Doc | Phase | Duration | Gate |
|---|---|---|---|
| [01-tool-inventory.md](./01-tool-inventory.md) | Reference | — | — |
| [02-risk-register.md](./02-risk-register.md) | Reference | — | — |
| [03-phase-0-foundation.md](./03-phase-0-foundation.md) | 0: Foundation | Week 1 (~5 hrs) | All services provisioned, baseline recorded |
| [04-phase-1-database.md](./04-phase-1-database.md) | 1: DB Migration | Weeks 1–2 (~15 hrs) | Postgres live, all 50 pages load, Fly.io still running |
| [05-phase-2-infrastructure.md](./05-phase-2-infrastructure.md) | 2: Infra Split | Week 3 (~8 hrs) | Fly.io destroyed, Vercel live, Modal deployed |
| [06-phase-3-discovery.md](./06-phase-3-discovery.md) | 3: Discovery at Scale | Weeks 3–5 + compute | 12,000+ fee URLs discovered |
| [07-phase-4-extraction.md](./07-phase-4-extraction.md) | 4: Extraction Pipeline | Weeks 5–8 + compute | Nightly Haiku batch running, 12K+ institutions with fees |
| [08-phase-5-coverage.md](./08-phase-5-coverage.md) | 5: 50% Coverage | Weeks 8–12 + compute | **35,000+ institutions with approved fees** |
| [09-appendix.md](./09-appendix.md) | Reference | — | Scripts, schemas, code skeletons |

---

## Hard Rules

1. **No phase skipping.** Each gate must pass before the next phase begins.
2. **Keep Fly.io alive until Phase 2 gate passes.** Never destroy it while it's still serving traffic.
3. **Keep SQLite as read-only backup for 30 days** after Postgres migration.
4. **Never run LLM extraction without a daily budget cap.** Default: $20/day.
5. **Domain knowledge stays.** Fee taxonomy, validation rules, extraction prompts — none of that changes.
