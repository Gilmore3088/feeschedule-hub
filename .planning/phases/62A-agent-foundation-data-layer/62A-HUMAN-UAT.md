---
status: partial
phase: 62a-agent-foundation-data-layer
source: [62A-VERIFICATION.md]
started: 2026-04-16T22:45Z
updated: 2026-04-16T22:45Z
---

## Current Test

[awaiting human verification]

## Tests

### 1. Extracted_fees freeze trigger — consumer impact check
expected: No production code path attempts to write to `extracted_fees` after the freeze trigger lands. Existing reads continue to work.
how_to_verify:
- Trigger a manual crawl: `/admin/pipeline` → "Run Crawl" (or any admin action that historically wrote to extracted_fees)
- Confirm no `bfi.allow_legacy_writes` kill-switch exceptions fire
- Check Modal cron logs for any INSERT/UPDATE/DELETE on extracted_fees
- Confirm `/admin/index` (and all reader surfaces) still return data
result: [pending]

### 2. pg_cron partition maintenance registered
expected: `SELECT jobname, schedule FROM cron.job WHERE jobname LIKE '%agent_events%' OR jobname LIKE '%agent_auth_log%'` returns 2 rows (one per partition parent).
how_to_verify:
- Connect to live DB via Supabase SQL editor or psql
- Run the query above
- Confirm schedule shows "0 0 1 * *" (monthly on the 1st) or similar
result: [pending]

### 3. MCP external client discoverability
expected: An MCP-compatible client (Claude Desktop, claude CLI, or another) can connect to the deployed MCP server and list 4 read tools (get_national_index, get_institution_dossier, get_call_report_snapshot, trace_published_fee).
how_to_verify:
- If MCP server not yet deployed to Modal: defer to that deployment phase
- If deployed: connect from a local client, list tools, confirm all 4 appear
result: [pending — deferred until MCP server is deployed to Modal]

### 4. Full SC suite run against connected DB
expected: `DATABASE_URL_TEST=postgres://postgres:postgres@localhost:5433/bfi_test pytest fee_crawler/tests/test_sc*.py -v` reports all 15 SC tests as PASS (zero skipped).
how_to_verify:
- `docker compose up -d postgres` (local service from Plan 01)
- Wait for healthcheck
- Export DATABASE_URL_TEST to the local Postgres
- Run the pytest command
- Confirm 15 passed / 0 failed / 0 skipped
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
