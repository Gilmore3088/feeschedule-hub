# Phase 58: FFIEC Pipeline & Institution Data - Validation

**Created:** 2026-04-10
**Source:** RESEARCH.md Validation Architecture section

---

## Wave 0 Test Stubs

These test files must be created before implementation tasks execute.

### Python Tests (fee_crawler pipeline)

#### `fee_crawler/tests/test_ingest_call_reports.py`

```python
"""Tests for FFIEC CDR ingestion — Postgres port."""

import pytest
from unittest.mock import MagicMock, patch


class TestIngestCallReports:
    """Test FFIEC CDR ingestion with mocked psycopg2."""

    def test_run_connects_to_postgres_via_database_url(self):
        """Verify psycopg2.connect is called with DATABASE_URL."""
        pytest.skip("Wave 0 stub — implement in 58-01")

    def test_upsert_uses_on_conflict(self):
        """Verify INSERT uses ON CONFLICT (crawl_target_id, report_date, source) DO UPDATE."""
        pytest.skip("Wave 0 stub — implement in 58-01")

    def test_matching_by_cert_number_first(self):
        """Verify institution matching prioritizes cert_number lookup."""
        pytest.skip("Wave 0 stub — implement in 58-01")

    def test_unmatched_institutions_inserted_with_null_crawl_target_id(self):
        """Verify unmatched rows are inserted with crawl_target_id = NULL (per D-10)."""
        pytest.skip("Wave 0 stub — implement in 58-01")

    def test_backfill_iterates_quarters_from_year(self):
        """Verify --backfill --from-year 2010 iterates Q1-Q4 from 2010 to present."""
        pytest.skip("Wave 0 stub — implement in 58-01")

    def test_retry_on_download_failure(self):
        """Verify 3 retries with exponential backoff on HTTP failure."""
        pytest.skip("Wave 0 stub — implement in 58-01")

    def test_commit_after_each_quarter(self):
        """Verify conn.commit() is called after each quarter to avoid losing progress."""
        pytest.skip("Wave 0 stub — implement in 58-01")

    def test_summary_report_printed(self):
        """Verify summary report with quarters processed, rows upserted, rows skipped."""
        pytest.skip("Wave 0 stub — implement in 58-01")
```

#### `fee_crawler/tests/test_ingest_ncua.py`

```python
"""Tests for NCUA 5300 ingestion — Postgres port."""

import pytest
from unittest.mock import MagicMock, patch


class TestIngestNcua:
    """Test NCUA 5300 ingestion with mocked psycopg2."""

    def test_run_connects_to_postgres_via_database_url(self):
        """Verify psycopg2.connect is called with DATABASE_URL."""
        pytest.skip("Wave 0 stub — implement in 58-01")

    def test_upsert_uses_on_conflict(self):
        """Verify INSERT uses ON CONFLICT DO UPDATE pattern."""
        pytest.skip("Wave 0 stub — implement in 58-01")

    def test_matching_by_charter_number(self):
        """Verify CU matching uses charter_number + charter_type = credit_union."""
        pytest.skip("Wave 0 stub — implement in 58-01")

    def test_unmatched_credit_unions_inserted_with_null_crawl_target_id(self):
        """Verify unmatched rows are inserted with crawl_target_id = NULL (per D-10)."""
        pytest.skip("Wave 0 stub — implement in 58-01")

    def test_backfill_iterates_quarterly_months(self):
        """Verify --backfill iterates months 3, 6, 9, 12 for each year."""
        pytest.skip("Wave 0 stub — implement in 58-01")

    def test_retry_on_zip_download_failure(self):
        """Verify 3 retries with exponential backoff on ZIP download failure."""
        pytest.skip("Wave 0 stub — implement in 58-01")

    def test_fs220_field_mapping_preserved(self):
        """Verify FS220_FIELDS and FS220A_FIELDS mappings are unchanged from SQLite version."""
        pytest.skip("Wave 0 stub — implement in 58-01")
```

### TypeScript Tests (query layer + UI)

#### `src/lib/crawler-db/financial.test.ts`

```typescript
// Tests for getFinancialsByInstitution hero card data shape
// Wave 0 stub — implement alongside 58-02

import { describe, it, expect } from 'vitest';

describe('getFinancialsByInstitution', () => {
  it.skip('returns rows ordered by report_date DESC (newest first)', () => {
    // Verify query ORDER BY report_date DESC
  });

  it.skip('returns all required fields for hero cards', () => {
    // Verify InstitutionFinancial interface fields present
  });

  it.skip('returns empty array for institution with no financial data', () => {
    // Verify graceful empty state
  });
});
```

---

## Req ID to Test Map

| Req ID | Behavior | Test File | Automated Command |
|--------|----------|-----------|-------------------|
| COV-03 | FFIEC ingestion populates institution_financials | `fee_crawler/tests/test_ingest_call_reports.py` | `python -m pytest fee_crawler/tests/test_ingest_call_reports.py -x` |
| COV-03 | NCUA ingestion populates institution_financials | `fee_crawler/tests/test_ingest_ncua.py` | `python -m pytest fee_crawler/tests/test_ingest_ncua.py -x` |
| ADM-05 | Hero cards render correct financial data | `src/lib/crawler-db/financial.test.ts` | `npx vitest run src/lib/crawler-db/financial.test.ts` |

## Sampling Rate

- **Per task commit:** `npx vitest run src/lib/crawler-db/call-reports.test.ts`
- **Per wave merge:** `npx vitest run && python -m pytest fee_crawler/tests/ -x`
- **Phase gate:** Full suite green before `/gsd-verify-work`
