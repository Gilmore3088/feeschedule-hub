# FeeSchedule Hub - Product Requirements Document

## What This Is

FeeSchedule Hub is a platform that crawls, extracts, and benchmarks bank and credit union fee schedules. It ingests public fee schedule documents (PDFs and HTML pages) from thousands of financial institutions, uses an LLM to extract structured fee data, and provides analytics for comparing fees across institutions by peer group, asset size, geography, and charter type.

The system has two halves: a **Python data pipeline** that discovers, downloads, extracts, and enriches fee data, and a **Next.js admin interface** for reviewing, approving, and analyzing that data.

---

## Architecture Overview

```
                        ┌──────────────────────────────┐
                        │     Python Data Pipeline      │
                        │   (fee_crawler CLI package)   │
                        │                               │
                        │  seed → discover → crawl →    │
                        │  validate → enrich → analyze  │
                        │  ingest_fdic / ingest_ncua /  │
                        │  ingest_cfpb                  │
                        └──────────────┬───────────────┘
                                       │ writes
                                       ▼
                              ┌─────────────────┐
                              │  SQLite Database │
                              │  data/crawler.db │
                              └────────┬────────┘
                                       │ reads (read-only)
                                       ▼
                        ┌──────────────────────────────┐
                        │     Next.js 16 Frontend       │
                        │     (App Router, React 19)    │
                        │                               │
                        │  Public: Landing, Waitlist    │
                        │  Admin:  Dashboard, Review,   │
                        │          Fee Catalog, Peers   │
                        └──────────────────────────────┘
```

**Key constraint:** The Next.js frontend only reads from the database. All writes happen through the Python pipeline or through server actions (fee review approvals). The database is SQLite via `better-sqlite3`.

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend framework | Next.js (App Router) | 16.1.6 |
| UI library | React | 19.2.3 |
| Styling | Tailwind CSS | 4 |
| UI components | shadcn/ui | - |
| Charts | Recharts | 3.7 |
| Icons | Lucide React | - |
| Database access | better-sqlite3 | 12.6 |
| Data pipeline | Python 3 | - |
| PDF extraction | pdfplumber | - |
| HTML extraction | BeautifulSoup | - |
| LLM extraction | Claude API (Anthropic) | - |
| Database | SQLite | - |

---

## Database Schema

### Core Tables

**`crawl_targets`** - The institution directory. One row per bank/credit union.
- `id`, `institution_name`, `charter_type` (bank/credit_union), `state_code`, `city`
- `asset_size` (in thousands), `asset_size_tier`, `fed_district`
- `website_url`, `fee_schedule_url`, `document_type` (pdf/html)
- `cert_number`, `source` (fdic/ncua), `consecutive_failures`

**`extracted_fees`** - Individual fee data points extracted from documents.
- `id`, `crawl_target_id`, `fee_name`, `fee_category`, `amount`, `frequency`
- `conditions`, `extraction_confidence`, `review_status`, `validation_flags` (JSON)

**`crawl_runs`** / **`crawl_results`** - Pipeline execution tracking.

### Financial Enrichment Tables

**`institution_financials`** - FDIC call reports and NCUA 5300 data.
- `total_assets`, `total_deposits`, `total_loans`, `service_charge_income`
- `roa`, `roe`, `efficiency_ratio`, `tier1_capital_ratio`
- `branch_count`, `employee_count`, `member_count`

**`institution_complaints`** - CFPB consumer complaint aggregates by product.

### Analytics Tables

**`analysis_results`** - Pre-computed peer comparisons (JSON blobs).
**`fee_change_events`** - Historical fee amount changes.

### Auth Tables

**`users`** - Admin users with roles (viewer/analyst/admin).
**`sessions`** - Session tokens with 24hr TTL.
**`fee_reviews`** - Audit trail for approve/reject actions.

---

## Python Data Pipeline

The pipeline is a CLI tool run as `python -m fee_crawler <command>`. Commands are designed to run independently or chained together.

### Commands (in typical execution order)

| Command | What it does |
|---------|-------------|
| `seed_institutions` | Fetches active banks from FDIC BankFind API and credit unions from NCUA bulk data. Populates `crawl_targets`. |
| `discover_urls` | Crawls institution websites to find fee schedule URLs/PDFs. Updates `fee_schedule_url` and `document_type`. |
| `crawl` | Full extraction pipeline: download document, extract text (pdfplumber/BeautifulSoup), call Claude API for structured extraction, validate, store in `extracted_fees`. |
| `validate` | Retroactively validates extracted fees. Sets `validation_flags` and initial `review_status` (staged/flagged/pending). |
| `enrich` | Backfills `asset_size_tier` (6 tiers) and `fed_district` (1-12) on `crawl_targets`. |
| `analyze` | Computes peer comparisons for institutions. Stores results in `analysis_results`. |
| `ingest_fdic` | Pulls quarterly financial data from FDIC API into `institution_financials`. |
| `ingest_ncua` | Pulls NCUA 5300 call report data into `institution_financials`. |
| `ingest_cfpb` | Fetches consumer complaint data from CFPB API into `institution_complaints`. |
| `seed_users` | Creates admin users with roles. |

### Fee Extraction Flow

```
Institution website
    ↓
discover_urls (find fee schedule link)
    ↓
Download PDF or HTML
    ↓
Extract text (pdfplumber / BeautifulSoup)
    ↓
Claude API structured extraction
    → fee_name, amount, frequency, conditions, confidence
    ↓
Validation rules
    → validation_flags (JSON array of {rule, severity, message})
    → review_status set to staged/flagged/pending
    ↓
stored in extracted_fees
```

### Fee Taxonomy

9 families, 47 canonical fee categories. Defined in both Python (`fee_crawler/fee_analysis.py`) and TypeScript (`src/lib/fee-taxonomy.ts`) -- these must stay in sync.

| Family | Example Categories |
|--------|-------------------|
| Account Maintenance | Monthly maintenance, minimum balance, paper statement |
| Overdraft & NSF | Overdraft fee, NSF fee, continuous overdraft |
| ATM & Card | Non-network ATM, foreign ATM, card replacement |
| Wire Transfers | Domestic incoming/outgoing, international |
| Check Services | Cashier's check, stop payment, returned check |
| Digital & Electronic | ACH origination, online transfer, bill pay |
| Cash & Deposit | Coin counting, cash advance, deposited item return |
| Account Services | Account closure, dormant account, legal process |
| Lending Fees | Late payment, loan origination, credit report |

---

## Frontend Routes

### Public

| Route | Purpose |
|-------|---------|
| `/` | Landing page (hero, how-it-works, pricing, FAQ) |
| `/waitlist` | Signup form, saves to `data/waitlist.json` |

### Admin (all require authentication)

| Route | Purpose |
|-------|---------|
| `/admin/login` | Username/password login form |
| `/admin` | Dashboard with stat cards (clickable), top fee categories, institutions table (sortable/filterable), review queue summary |
| `/admin/fees` | Raw extracted fees, grouped by institution. Accepts `?id=N` to filter to one institution. |
| `/admin/fees/catalog` | Fee-centric analytics. All 47 fee categories with stats, grouped by family. Filters: search, family, sort, column toggle. |
| `/admin/fees/catalog/[category]` | Single fee category detail. 3 tabs: Overview (histogram, stats), Breakdowns (by charter/tier/district/state), Institutions (sortable table). |
| `/admin/review` | Fee review queue. Status tabs (staged/flagged/pending/approved/rejected), search, approve/reject buttons, bulk approve (admin only). |
| `/admin/review/[id]` | Individual fee detail with validation flags, audit trail, and action buttons. |
| `/admin/peers` | Peer group browser. Filter by asset tier (6 options), Fed district (12 options), charter type. |
| `/admin/peers/[id]` | Institution detail. Financial data table, CFPB complaints, peer analysis with fee comparison (percentile rankings), matched peers list. |

### Auth & Roles

| Role | Capabilities |
|------|-------------|
| viewer | Read-only access to all dashboards |
| analyst | Can approve/reject individual fees |
| admin | Bulk approve, edit fees, manage users |

Session cookie: `fsh_session`, 24hr TTL, httpOnly.

---

## Key Source Files

### Frontend

| File | Purpose |
|------|---------|
| `src/lib/crawler-db.ts` | All database queries (22 exports). Read-only SQLite access. |
| `src/lib/format.ts` | Canonical `formatAmount()` and `formatAssets()` |
| `src/lib/fee-taxonomy.ts` | Fee families, display names, color mapping |
| `src/lib/auth.ts` | Login, logout, session management, role checks |
| `src/lib/fee-actions.ts` | Server actions: approveFee, rejectFee, editFee, bulkApproveStagedFees |
| `src/app/admin/admin-nav.tsx` | Client component, active nav state via usePathname() |
| `src/app/admin/institution-table.tsx` | Client component, search/sort/filter/paginate institutions |
| `src/components/breadcrumbs.tsx` | Shared breadcrumb navigation |
| `src/components/catalog-filters.tsx` | Fee catalog search/filter controls |
| `src/components/fee-histogram.tsx` | Fee amount distribution chart (Recharts) |
| `src/components/breakdown-chart.tsx` | Dimensional breakdown bar chart |
| `src/components/fee-range-chart.tsx` | P25-P75 range visualization |

### Python Pipeline

| File | Purpose |
|------|---------|
| `fee_crawler/__main__.py` | CLI entry point with subcommands |
| `fee_crawler/db.py` | Database class, schema, migrations |
| `fee_crawler/config.py` | API URLs, crawl delays, LLM settings |
| `fee_crawler/validation.py` | Post-extraction validation rules |
| `fee_crawler/fee_analysis.py` | Fee normalization, peer comparison logic |
| `fee_crawler/peer.py` | Asset tier classification, district mapping |
| `fee_crawler/pipeline/extract_llm.py` | Claude API fee extraction |
| `fee_crawler/pipeline/extract_pdf.py` | PDF text extraction (pdfplumber) |
| `fee_crawler/pipeline/extract_html.py` | HTML text extraction (BeautifulSoup) |
| `fee_crawler/pipeline/download.py` | HTTP download with retry and content hashing |
| `fee_crawler/pipeline/url_discoverer.py` | Website crawling to find fee schedule links |

---

## Patterns & Conventions

- **Server components by default.** Pages are async server components that query SQLite directly. Client components (`"use client"`) are only used for interactive elements (search inputs, sort controls, filter chips).
- **URL search params for filters.** The server component reads `searchParams` (Promise-based in Next.js 16). Client filter components update the URL via `useSearchParams` + `useRouter`.
- **No ORM.** Raw SQL via `better-sqlite3` prepared statements. Each query function opens/closes its own connection.
- **Conventional commits.** `feat(scope): description`, `fix(scope): description`.
- **Feature branches.** `feat/feature-name` branching from main.
- **Plan files.** Feature plans live in `plans/` as markdown with acceptance criteria checklists.

---

## Running the Project

### Frontend

```bash
npm install
npm run dev         # Development server at localhost:3000
npm run build       # Production build
```

Requires `data/crawler.db` to exist. Without it, admin pages will show a database error boundary.

### Data Pipeline

```bash
# Seed institutions from FDIC and NCUA
python -m fee_crawler seed_institutions --source all

# Discover fee schedule URLs
python -m fee_crawler discover_urls --limit 100

# Extract fees from documents
python -m fee_crawler crawl --limit 50

# Validate and set review statuses
python -m fee_crawler validate

# Enrich with tier/district data
python -m fee_crawler enrich

# Ingest financial data
python -m fee_crawler ingest_fdic --report-date 20240630
python -m fee_crawler ingest_ncua
python -m fee_crawler ingest_cfpb

# Run peer analysis
python -m fee_crawler analyze --all

# Create admin users
python -m fee_crawler seed_users
```

---

## Current State & Known Gaps

**Working well:**
- Full crawl-to-review pipeline
- Fee catalog with 47 categories, 9 families, charts, breakdowns
- Peer comparison with percentile rankings
- Financial data enrichment (FDIC, NCUA, CFPB)
- Admin review workflow with audit trail
- Interactive dashboard with drill-down navigation

**Not yet built:**
- Search and pagination on the Fee Extracts page (`/admin/fees`)
- Dedicated analytics/charts page (planned in `plans/feat-enhance-data-enrichment-pipeline.md`)
- Fee change alerts view
- Global search (Cmd+K)
- Trend sparklines on stat cards
- Mobile navigation (nav is hidden below md breakpoint)
- ISR caching for dashboard pages
- Excel/XLSX export (only CSV exists for catalog)
