-- Migration 023: Fix FFIEC Call Report scaling (thousands -> actual dollars)
-- FFIEC RIAD4080 and RIAD4107 are reported in thousands; stored raw.
-- Each column guards independently on its own current value to prevent
-- double-application when one column was already rescaled in a prior run.
--
-- Phase 60.1 (2026-04-15): contract reaffirmed. Ingest helper restored.
-- ingest_call_reports.py now also scales ASSET/DEP/LNLSNET at ingest time,
-- so historical balance-sheet fixes are NOT required for new rows.
-- See fee_crawler/commands/ingest_call_reports.py::_apply_ffiec_scaling.

BEGIN;

-- Rescale service_charge_income independently.
UPDATE institution_financials
SET service_charge_income = service_charge_income * 1000
WHERE source IN ('ffiec', 'fdic')
  AND service_charge_income IS NOT NULL
  AND service_charge_income < 100000000;

-- Rescale other_noninterest_income independently — its own guard ensures
-- it is not double-applied if service_charge_income was already rescaled
-- in a prior run (or vice versa).
UPDATE institution_financials
SET other_noninterest_income = other_noninterest_income * 1000
WHERE source IN ('ffiec', 'fdic')
  AND other_noninterest_income IS NOT NULL
  AND other_noninterest_income < 100000000;

COMMIT;
