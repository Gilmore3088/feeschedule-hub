# Database access audit — 2026-08-17

Project `rmhwbbjjctzfaqjyhomu`. Read-only audit of every object in `public`, then two
restrictive migrations, then re-test.

## Roles in plain English
- `anon` — anyone holding the project's public anon key (designed to be public); reaches the
  database only through the Supabase REST API.
- `authenticated` — any logged-in Supabase Auth user, through the same API.
- `postgres` — the app's own server connection (`DATABASE_URL`); bypasses RLS. The app never
  uses the anon key or PostgREST.

## Found
- 36 legacy tables + 1 view open to `anon` with SELECT/INSERT/UPDATE/DELETE/TRUNCATE and RLS off
  (retired agent logs and pipeline state, two `backup_*_20260815` copies, `public.schema_migrations`).
- 36 further tables with anon/authenticated grants protected only by RLS (0 rows visible).
- 9 legacy functions executable by `anon`; new tables inherited grants by default.
- No current product table (`institution_sources`, fee tiers, `published_fee_catalog`, `hamilton_*`,
  claims/memberships/invitations, ledger, `users`, `leads`, …) exposed any rows.

## Fixed (applied to the linked project, no `--include-all`)
- `20270101060000_lock_legacy_public_grants.sql` — REVOKE ALL on the 37 open objects and all
  sequences; ENABLE RLS on the legacy tables; REVOKE EXECUTE on the 9 functions; clear
  `ALTER DEFAULT PRIVILEGES` for tables/sequences/functions in `public`.
- `20270101060100_revoke_remaining_public_grants.sql` — REVOKE ALL on the remaining 36 tables.

## Verified
- Catalog: 0 anon/authenticated/PUBLIC grants; RLS on every table; 0 functions callable.
- In-database: 96 attempts as `anon`/`authenticated` (select/insert/delete/rpc on 15 objects): 0 succeeded.
- REST API with the anon key: 401 `permission denied` on reads, writes and rpc.
- App: all routes 200 with live stats (connects as `postgres`).
- `supabase db push --dry-run`: remote up to date (50 local = 50 remote ledger rows).

Schema visual: see the "Fee Insight Data Schema" artifact (2026-08-17). Re-run the audit
with the read-only queries in this session's `dbaudit.mjs` pattern whenever a migration adds
tables; the schema defaults now prevent silent re-exposure.
