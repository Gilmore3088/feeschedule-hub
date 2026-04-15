-- Migration 023: Fix FFIEC Call Report scaling (thousands -> actual dollars)
-- FFIEC RIAD4080 and RIAD4107 are reported in thousands; stored raw.
-- Guard: service_charge_income < 100000000 prevents double-application.
--
-- NOTE: Balance sheet columns (total_assets, total_deposits, total_loans,
-- total_revenue) are NOT currently ingested by ingest_call_reports.py,
-- so no balance sheet UPDATE is included here.
--
-- Phase 60.1 (2026-04-15): contract reaffirmed. Ingest helper restored.
-- See fee_crawler/commands/ingest_call_reports.py::_apply_ffiec_scaling.

BEGIN;

UPDATE institution_financials
SET
  service_charge_income    = service_charge_income * 1000,
  other_noninterest_income = CASE
                               WHEN other_noninterest_income IS NOT NULL
                               THEN other_noninterest_income * 1000
                               ELSE NULL
                             END
WHERE source IN ('ffiec', 'fdic')
  AND service_charge_income IS NOT NULL
  AND service_charge_income < 100000000;

COMMIT;
