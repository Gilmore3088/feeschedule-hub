# Rebuild Admin Portal for Postgres

## Why

The admin portal was built for SQLite. We migrated the database to Postgres but tried to patch the admin UI instead of rebuilding it. Result: 21+ runtime crashes from type mismatches (Date objects, JSONB parsing, prepared statements, connection pooling). Patching is a losing game — the foundation needs to match the new backend.

## Approach

Delete all admin pages. Rebuild each one from scratch using:
- `postgres.js` with `prepare: false` and proper pool sizing
- `pg-helpers.ts` for all Date/JSONB handling
- Proper TypeScript types that match Postgres return types
- Server components with error boundaries
- One page at a time, tested before moving to next

## Pages to Rebuild (priority order)

1. `/admin` — Dashboard (stats, recent activity, coverage)
2. `/admin/pipeline` — Pipeline status (crawl runs, jobs, coverage)
3. `/admin/review` — Fee review queue (staged, flagged, approve/reject)
4. `/admin/fees` — Fee catalog
5. `/admin/data-quality` — Integrity checks
6. `/admin/districts` — Fed district view
7. `/admin/index` — National fee index
8. `/admin/market` — Market explorer
9. `/admin/peers` — Peer analysis
10. `/admin/ops` — Operations/jobs
11. `/admin/institutions` — Institution browser
12. `/admin/research` — Research agents (already works)

## Architecture Rules

- Every DB query goes through a dedicated async function in `crawler-db/`
- Every function returns properly typed results with Number() on counts
- Every Date field gets toDateStr() or toISO() before rendering
- Every JSONB field gets safeJsonb() before access
- Connection: max 10, prepare false, ssl require
- Error boundaries on every page — show error message, not white screen
- Each page tested on live Vercel before starting the next

## Data Each Page Needs

### Dashboard (`/admin`)
- Total institutions, with fees, coverage %
- Review queue counts (staged, flagged, pending)
- Recent crawl runs (last 10)
- Recent reviews (last 10)
- Top coverage gaps by state

### Pipeline (`/admin/pipeline`)
- Pipeline stats (total, with URL, with fees)
- Recent crawl runs with status
- Discovery queue status
- Job queue status (pending/running/completed/failed)

### Review (`/admin/review`)
- Fees by status with pagination
- Search by institution or fee name
- Bulk approve/reject actions
- Outlier flagged fees

### Data Quality (`/admin/data-quality`)
- Integrity score
- Check results table
- Coverage funnel
- Uncategorized fees
- Quick actions
