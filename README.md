# Bank Fee Index

The national authority on bank and credit union fee data. A B2B platform that
collects, analyzes, and publishes fee intelligence across 4,000+ financial
institutions, with an AI research analyst (Hamilton) that produces
McKinsey-grade reports on demand.

This repo contains:

- **`src/`** — Next.js 16 application (admin, `/pro`, public API)
- **`fee_crawler/`** — Python pipeline that crawls fee schedules and feeds
  Postgres
- **`supabase/migrations/`** — Postgres schema, applied via
  `scripts/apply-migration.mjs`

---

## Getting Started

You can go from a fresh `git clone` to a logged-in admin dashboard in about
fifteen minutes.

### Prerequisites

| Tool       | Version  | Notes                                     |
|------------|----------|-------------------------------------------|
| Node.js    | 20+      | Use `nvm install 20`                      |
| Python     | 3.11+    | 3.12 is the production target             |
| Postgres   | 13+      | Supabase project, or local `supabase start` |

You will also need:

- A Postgres connection string (Supabase transaction-mode pooler, port 6543)
- An **Anthropic API key** (only required if you want to use Hamilton /
  research chat — the rest of the admin works without it)

### 1. Configure environment

```bash
cp .env.example .env.local
```

Open `.env.local` and fill in **at minimum**:

```bash
DATABASE_URL=postgres://...:6543/postgres?sslmode=require   # required
BFI_COOKIE_SECRET=<64 hex chars>                            # required for login
BFI_ADMIN_PASSWORD=<choose a strong password>               # required for seeding
BFI_ANALYST_PASSWORD=<choose a strong password>             # required for seeding
ANTHROPIC_API_KEY=sk-ant-...                                # required for /research and /hamilton
```

Generate `BFI_COOKIE_SECRET` with `openssl rand -hex 32`.

### 2. Run the bootstrap script

```bash
npm run setup
```

This installs Node + Python dependencies, applies pending migrations, and
seeds admin + analyst users. It is idempotent — safe to re-run.

If you prefer to run the steps manually:

```bash
npm install
pip install -r requirements.txt
npm run db:migrate         # apply pending Supabase migrations
npm run db:seed            # seed admin + analyst users
```

### 3. Start the dev server

```bash
npm run dev
```

Open <http://localhost:3000>, click **Sign in**, and log in as
`admin` with the password you set in `BFI_ADMIN_PASSWORD`.

You should land on `/admin`. The dashboard will be empty until the fee
crawler runs — that's expected.

---

## Common scripts

| Command                       | What it does                                    |
|-------------------------------|-------------------------------------------------|
| `npm run dev`                 | Next.js dev server on :3000                     |
| `npm run build`               | Production build                                |
| `npm run lint`                | ESLint                                          |
| `npm run db:migrate`          | Apply pending `supabase/migrations/*.sql`       |
| `npm run db:migrate:status`   | List applied vs pending migrations              |
| `npm run db:seed`             | Seed admin + analyst users                      |
| `npm run setup`               | One-shot dev bootstrap (re-runnable)            |

For the Python crawler:

```bash
python -m fee_crawler --help                  # all subcommands
python -m fee_crawler seed-users              # seed users (same as npm run db:seed)
python -m fee_crawler crawl --state CA        # crawl a state
```

---

## Architecture

See `CLAUDE.md` for the full architectural overview — layers, data flow, key
abstractions, and entry points.

Short version:

- **Server Components** for pages, **Server Actions** for mutations
- **Postgres-only** data layer via the `postgres` client (no ORM); queries
  live in `src/lib/crawler-db/`
- **Research agents** stream LLM responses via the Vercel AI SDK
- **Python crawler** runs as Modal serverless workers on a cron schedule

---

## Deployment

The app deploys to Vercel from `main`. The Python crawler deploys to Modal
from `fee_crawler/modal_app.py`. Required production env vars are documented
in `CLAUDE.md` under "Configuration".

---

## Troubleshooting

**Login form rejects valid credentials.** The seed users haven't been
created. Run `npm run db:seed` after setting `BFI_ADMIN_PASSWORD` and
`BFI_ANALYST_PASSWORD`.

**`DATABASE_URL is not set` on startup.** `.env.local` is missing or the var
is empty. Confirm with `grep DATABASE_URL .env.local`.

**`/admin/hamilton/chat` returns 500.** `ANTHROPIC_API_KEY` is missing.
Set it in `.env.local` and restart the dev server.

**Migrations fail with "permission denied".** Your Postgres user lacks
DDL privileges. Use the service-role connection string from Supabase, not
the anon one.
