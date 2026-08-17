# Archived Supabase Migrations - 2026-08-16

These SQL files were removed from the active `supabase/migrations` production chain while resolving linked project drift for Supabase project `rmhwbbjjctzfaqjyhomu`.

They are archived for audit/reference only. Do not move them back into `supabase/migrations` or run them with `supabase db push --include-all`.

Why they were archived:

- Some files reuse migration versions already occupied by different remote ledger entries.
- Some files share duplicate date-only local versions.
- Some files reference retired crawler, Modal, `ops_jobs`, rollback, or compatibility runtime paths.
- Some files were superseded by the forward reconciliation migration `20270101050000_production_current_schema_reconciliation.sql`.

If any archived SQL effect is needed again, create a new forward migration after the current remote head with only the reviewed current effect.
