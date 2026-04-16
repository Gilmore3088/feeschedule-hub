-- Migration 023: Fix FFIEC Call Report scaling (thousands -> actual dollars)
--
-- ALL dollar-denominated columns in institution_financials for FFIEC/FDIC
-- sources arrive from FDIC BankFind API in thousands. This migration
-- multiplies existing rows up to whole dollars so the DB is the single
-- source of truth — no query-layer multiplication needed.
--
-- Each column is updated independently with its own idempotency guard
-- (value < threshold) to prevent double-application on re-run.
--
-- Phase 60.1 (2026-04-15): ingest_call_reports.py now scales at ingest
-- time via _apply_ffiec_scaling and _scale_thousands. The TS query layer
-- (financial.ts, call-reports.ts) no longer multiplies by 1000.

BEGIN;

-- Income columns
UPDATE institution_financials
SET service_charge_income = service_charge_income * 1000
WHERE source IN ('ffiec', 'fdic')
  AND service_charge_income IS NOT NULL
  AND service_charge_income < 100000000;

UPDATE institution_financials
SET other_noninterest_income = other_noninterest_income * 1000
WHERE source IN ('ffiec', 'fdic')
  AND other_noninterest_income IS NOT NULL
  AND other_noninterest_income < 100000000;

-- Balance-sheet columns
UPDATE institution_financials
SET total_assets = total_assets * 1000
WHERE source IN ('ffiec', 'fdic')
  AND total_assets IS NOT NULL
  AND total_assets < 100000000000;

UPDATE institution_financials
SET total_deposits = total_deposits * 1000
WHERE source IN ('ffiec', 'fdic')
  AND total_deposits IS NOT NULL
  AND total_deposits < 100000000000;

UPDATE institution_financials
SET total_loans = total_loans * 1000
WHERE source IN ('ffiec', 'fdic')
  AND total_loans IS NOT NULL
  AND total_loans < 100000000000;

-- Derived revenue column
UPDATE institution_financials
SET total_revenue = total_revenue * 1000
WHERE source IN ('ffiec', 'fdic')
  AND total_revenue IS NOT NULL
  AND total_revenue < 100000000;

COMMIT;
