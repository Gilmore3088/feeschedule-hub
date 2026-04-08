---
created: 2026-04-08T06:52:40.920Z
title: Run pending production migrations
area: database
files:
  - scripts/migrations/023-fix-ffiec-scaling.sql
  - scripts/migrations/025-beige-book-themes.sql
---

## Problem

Two SQL migrations from Phases 23 and 24 need to be executed against production Postgres before their features are live:

1. **023-fix-ffiec-scaling.sql** (Phase 23) — Backfills ~38K FFIEC Call Report rows by multiplying `service_charge_income`, `total_assets`, `total_deposits`, `total_loans` by 1000. Has idempotency guard (`service_charge_income < 100000000`). NCUA rows are untouched.

2. **025-beige-book-themes.sql** (Phase 24) — Creates `beige_book_themes` table for LLM-extracted Beige Book themes (growth, employment, prices, lending_conditions per district).

After running migrations, also run `python -m fee_crawler ingest-beige-book` with ANTHROPIC_API_KEY to populate themes.

## Solution

1. Connect to Supabase production Postgres (transaction mode pooler, port 6543)
2. Run `023-fix-ffiec-scaling.sql` — verify by querying JPMorgan SC income (should be > $1B)
3. Run `025-beige-book-themes.sql` — verify table exists with `\d beige_book_themes`
4. Run Beige Book theme extraction: `python -m fee_crawler ingest-beige-book`
5. Verify themes populated: `SELECT COUNT(*) FROM beige_book_themes`
