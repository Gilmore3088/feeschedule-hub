# Runbook: `rollback-publish` — fees_published rollback insurance

Roadmap item #6. Soft-delete-by-batch for `fees_published`, the Tier-3
Hamilton-consumable fee table. Designed for the scenario where a Knox/Darwin
publish run turns out to be bad (wrong classification, systemic extraction
error, contaminated source) after tens of thousands of rows have landed.

## When to use it

Use this command when:

- A single publish batch (e.g. a Knox drain run, a Darwin promotion sweep) is
  suspected to contain systemically bad data, AND
- You can identify the batch by its `batch_id` value, AND
- You accept that the rollback is **soft** — rows remain in the table with
  `rolled_back_at` set, not physically deleted.

Do **not** use this command to clean up one-off extraction errors. For
individual-row corrections, file a challenge message (agent_messages) and let
the adversarial loop re-verify.

## What it does

1. Validates `--batch-id` is non-empty and not a sentinel (`null`, `none`, etc.).
2. In a single transaction:
   - Counts live rows (`batch_id = X AND rolled_back_at IS NULL`).
   - Prints affected count, breakdown by `canonical_fee_key`, and a sample of
     up to 10 rows.
   - If `--execute` is passed: `UPDATE fees_published SET rolled_back_at=NOW(),
     rolled_back_by_batch_id=<token>, rolled_back_reason=<reason>`.
   - Writes an audit row to `fees_published_rollback_log` in the same
     transaction (dry-run and execute both log).
3. Prints a `rollback_token` that can be used to reverse the rollback.

Live queries against `fees_published` **must** filter `rolled_back_at IS NULL`
to see the post-rollback state. The partial index `fees_published_live_idx`
keeps this fast.

## How to use

### Dry-run (always first)

```bash
python -m fee_crawler rollback-publish --batch-id knox-run-2026-04-19-001
```

This prints the affected count, category breakdown, and 10 sample rows without
mutating `fees_published`. An audit row with `dry_run=TRUE` is recorded.

### Execute

```bash
python -m fee_crawler rollback-publish \
    --batch-id knox-run-2026-04-19-001 \
    --execute \
    --reason "classification drift: 8k atm_network fees tagged as atm_non_network" \
    --operator james
```

After a successful execute, the command prints the `rollback_token` (a UUID).
Write it down — you need it to reverse the rollback.

## Rollback-of-rollback

If the execute was a mistake, reverse by clearing the soft-delete columns for
the token printed at execute time:

```sql
BEGIN;
  UPDATE fees_published
     SET rolled_back_at          = NULL,
         rolled_back_by_batch_id = NULL,
         rolled_back_reason      = NULL
   WHERE rolled_back_by_batch_id = '<rollback_token>';
COMMIT;
```

This is safe because:
- The original `batch_id` is unchanged, so the rows are still identifiable as
  belonging to that publish run.
- The adversarial handshake event (`published_by_adversarial_event_id`) is
  preserved.
- `fees_published_rollback_log` retains the audit trail of both the original
  rollback and any subsequent reversal you record manually.

## Safety rails (enforced by the CLI)

- `--batch-id` is required; empty or `null`-like values exit code 2.
- Dry-run is the default; `--execute` must be explicit.
- One batch per invocation — no bulk `--after-date` or multi-batch flags.
- Affected row count is printed **before** any write.
- All writes occur in a single transaction.
- Exit code 3 indicates zero matching live rows (nothing done).

## Known limitations / backfill caveat

The migration adds `batch_id` as **nullable**. Rows published before
`20260419_fees_published_rollback.sql` applied have `batch_id = NULL` and
cannot be rolled back via this tool. Backfill is up to the publisher:

- Knox/Darwin promote pathways must start passing `batch_id` on each publish
  run (follow-up work — pair the next drain run with this patch).
- For historical rows you want to be able to roll back, update `batch_id` in a
  one-off backfill SQL as soon as you can identify the logical batch.

Until publishers set `batch_id`, the command is an **insurance policy only
for new writes**.

## Tables touched

- `fees_published` — adds `batch_id`, `rolled_back_at`, `rolled_back_by_batch_id`,
  `rolled_back_reason`. Two indexes: `fees_published_batch_idx` and
  `fees_published_live_idx`.
- `fees_published_rollback_log` — new audit table. One row per CLI invocation
  (dry-run and execute both logged).

## Related

- Migration: `supabase/migrations/20260419_fees_published_rollback.sql`
- CLI code: `fee_crawler/commands/rollback_publish.py`
- Tests: `fee_crawler/tests/test_rollback_publish.py`
- Upstream publisher: `fee_crawler/agent_tools/tools_fees.py` (`promote_fee_to_tier3`)
