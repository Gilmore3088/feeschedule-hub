# 62B-14 — Lineage Demo Seed

## Why this exists

UAT Test 6 (Lineage tab valid ID) could not be verified because `fees_published`
had 0 rows. The real pipeline (Darwin → Knox → Hamilton) has not yet promoted
any `fees_raw` (102,965 rows) to `fees_verified`, let alone `fees_published`.
That's Phase 63/64 work — this seed is a narrow UAT unblock, not a pipeline
patch.

## What it does

Inserts 10 full-lineage chains:
- 10 rows in `fees_raw` marked with `outlier_flags @> '["demo_62b_14"]'`
- 10 rows in `fees_verified` with `canonical_fee_key = '__demo_62b_14__'`
- 10 rows in `fees_published` with the same canonical_fee_key + `fee_name` prefix `DEMO: `

Every row uses the sentinel UUID `00000000-0000-0000-0000-dead62b14aaa` for
`agent_event_id`, `verified_by_agent_event_id`, and
`published_by_adversarial_event_id` — easy to spot, easy to query.

## How to run

```bash
# from repo root, with DATABASE_URL set in .env
node scripts/seed-62b-lineage-demo.mjs
```

Output:
```
Inserted (this run): raw=10 verified=10 published=10
Total present:       raw=10 verified=10 published=10
Reverse with:        node scripts/unseed-62b-lineage-demo.mjs
```

Re-running is idempotent — it detects existing sentinels and no-ops.

## How to reverse

```bash
node scripts/unseed-62b-lineage-demo.mjs
```

Deletes rows in reverse FK order (published → verified → raw) matching the
sentinels. Safe to run even if seed was never applied — prints
"Nothing to remove".

## When to delete

**Delete as soon as Phase 63 or 64 produces real `fees_published` rows.**

Demo rows are clearly marked (`DEMO: ` prefix, `__demo_62b_14__` canonical
key) but still risk polluting:
- Hamilton queries that filter by canonical_fee_key
- Admin /market / /national index pages that aggregate fees_published
- Any downstream consumer that treats fees_published as authoritative

The seed is temporary scaffolding for Lineage UAT. It is not a substitute
for pipeline promotion.

## Invariants

- Every seeded `fees_published` row resolves cleanly through
  `lineage_graph(id)` — no `tier_1_missing` or `tier_2_missing` errors
- Every FK chain is intact: published.lineage_ref → verified.fee_verified_id → raw.fee_raw_id
- `institution_id` values 1..10 are used; migration comment notes the FK is
  not enforced so these need not exist in `institutions`
- `source` is set to `'manual_import'` because the `fees_raw.source` CHECK
  constraint only allows `('knox','migration_v10','manual_import')`

## Related

- UAT gap: `.planning/phases/62B-agent-foundation-runtime-layer/62B-UAT.md` Test 6
- Lineage UX fix: Plan 62B-13 (RecentPicker + JSON leak fix)
- Real pipeline: Phase 63 (Knox), Phase 64 (Darwin)
