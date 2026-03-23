# Tool Inventory

> What gets removed, what stays, and what gets added.

---

## Deprecate — Remove During Migration

| Tool | Current Role | Replaced By | Remove In |
|---|---|---|---|
| **Fly.io** | Web server + crawler host + SQLite volume | Vercel (web) + Modal (workers) | Phase 2 |
| **better-sqlite3** | Next.js DB driver (190 call sites, 21 files) | postgres.js | Phase 1 |
| **Litestream** | SQLite replication to S3 | Not needed (Supabase handles durability) | Phase 1 |
| **GitHub Actions: crawl-pipeline.yml** | Weekly SSH crawl via Fly.io | Modal scheduled functions | Phase 2 |
| **GitHub Actions: refresh-data.yml** | Daily FRED/BLS/NCUA refresh via SSH | Modal scheduled functions | Phase 2 |
| **fly.toml** | Fly.io app config | vercel.json | Phase 2 |
| **run.sh** | Litestream startup + Next.js launch | Not needed (Vercel handles startup) | Phase 2 |
| **Dockerfile (current monolithic)** | Node.js + Python in one image | Dockerfile.workers (Python only) | Phase 2 |
| **FLY_API_TOKEN** (GitHub secret) | Fly.io auth for CI/CD | Remove after Phase 2 | Phase 2 |
| **DB_PATH env var** | Points to SQLite file | DATABASE_URL (Postgres) | Phase 1 |

---

## Keep — Do Not Change

These assets represent hard-won domain knowledge. The infrastructure changes around them.

### Domain Knowledge (sacred)
| Asset | What It Does | Notes |
|---|---|---|
| Fee taxonomy (49 categories, 9 families) | Canonical fee categorization | Hardest thing to rebuild. Touch nothing. |
| `fee_analysis.py` + `fee-taxonomy.ts` | Python + TypeScript taxonomy definitions | Keep in sync. Do not refactor during migration. |
| `fee_amount_rules.py` | Dollar bounds per fee category | Keeps outlier detection accurate |
| LLM extraction prompts + tool_use schema | Structured fee extraction from Claude | Proven. Only change: switch to Haiku model. |
| `cms_fingerprint.py` | Detects Banno, Q2, Drupal, WP, etc. | Extend to drive routing (Phase 5). Don't rewrite. |
| `COMMON_PATHS` list | 50+ fee schedule URL paths | Keep, extend with per-platform paths |
| Validation + outlier detection logic | Bounds checking, statistical flags | Keep all logic, only adapt DB calls |

### Pipeline Logic (keep, adapt DB calls only)
| Command | What It Does |
|---|---|
| All 16 `ingest_*` commands | FDIC, NCUA, CFPB, FRED, BLS, NYFED, OFR, SOD, Beige Book, Census, etc. |
| `auto_review.py` | Confidence-based approve/reject |
| `categorize_fees.py` | Maps fee names to taxonomy categories |
| `outlier_detection.py` | Statistical outlier flagging |
| `analyze.py` | Peer comparison computation |
| `validate.py` | Retroactive validation pass |
| `discover_urls.py` | URL discovery (rewrite to async in Phase 3) |

### Frontend (keep entirely — only DB calls change)
| Asset | Notes |
|---|---|
| All 50 Next.js pages | No UI changes during migration |
| All 11 API routes | Queries become async, logic unchanged |
| All 14 server actions | Add `await`, logic unchanged |
| Custom auth (`auth.ts`) | Session-based, bcrypt — keep. Just make DB calls async. |
| Stripe integration | Keep. Update webhook endpoint URL in Phase 2. |
| shadcn/ui, Tailwind, Recharts | No changes |
| Anthropic AI SDK (`@ai-sdk/anthropic`) | Keep for research agent |
| Admin hub (12 routes) | No changes |
| Public pages (`/fees`, `/research`, etc.) | No changes |

---

## Add — New Tools

### Infrastructure
| Tool | Role | Cost | Why This One |
|---|---|---|---|
| **Supabase** (Postgres) | Primary database | Free → $25/mo | Native Postgres, pg_cron built in, `FOR UPDATE SKIP LOCKED`, real-time, likely already provisioned |
| **Vercel** | Next.js hosting | Free → $20/mo | Purpose-built for Next.js: edge cache, preview deploys, instant rollback, zero config |
| **Modal** | Python workers (serverless) | ~$2–5/mo | Pay-per-use compute, native async, cron scheduling, secrets management, no idle cost |
| **Cloudflare R2** | PDF/HTML document store | ~$0.50/mo | Content-addressed by SHA-256, free egress (unlike S3), S3-compatible API |

### Python Dependencies
| Package | Replaces | Why |
|---|---|---|
| `httpx` | `requests` | True async HTTP — enables 20 concurrent discovery tasks |
| `asyncpg` | `psycopg2` / SQLite | Native async Postgres driver, `FOR UPDATE SKIP LOCKED` |
| `modal` | — | Modal SDK for worker deployment |
| `boto3` | — | R2 document store (S3-compatible) |

### Node.js Dependencies
| Package | Replaces | Why |
|---|---|---|
| `postgres` (postgres.js) or `@vercel/postgres` | `better-sqlite3` | Async Postgres driver for Next.js, works in Vercel serverless |

### Database Primitives
| Primitive | Where | Why |
|---|---|---|
| `jobs` table with `FOR UPDATE SKIP LOCKED` | Supabase | Reliable multi-worker job queue without Redis |
| `platform_registry` table | Supabase | First-class platform routing — drives discovery path selection and extraction method |
| `pg_cron` extension | Supabase (built-in) | Replaces GitHub Actions SSH cron triggers |

---

## Configuration Changes

| Setting | Before | After |
|---|---|---|
| `claude.model` | `claude-sonnet-4-5-20250929` | `claude-haiku-4-5-20251001` |
| `claude.max_tokens` | `4096` | `2048` (fee extraction never needs full window) |
| `claude.use_batch_api` | (not set) | `true` for scheduled runs |
| `crawl.workers` | `2` | `20` (async, per-domain rate limited) |
| DB connection | `DB_PATH=data/crawler.db` | `DATABASE_URL=postgresql://...` |
| Hosting | Fly.io `shared-cpu-1x` 512MB | Vercel (web) + Modal (workers) |
