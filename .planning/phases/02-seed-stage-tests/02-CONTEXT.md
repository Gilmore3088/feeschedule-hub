# Phase 2: Seed Stage Tests - Context

**Gathered:** 2026-04-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Test that `seed_fdic()` and `seed_ncua()` correctly populate `crawl_targets` in the isolated test DB for a given geography. Uses the Phase 1 test infrastructure (session-scoped DB, geography fixture, markers).

</domain>

<decisions>
## Implementation Decisions

### Seed Scope
- **D-01:** Use the `limit` parameter on `seed_fdic()` and `seed_ncua()` to cap seeding at a small number (e.g., 5 per source) for speed. The 80%+ coverage target (D-05 from Phase 1) applies to the full pipeline e2e test in Phase 9, not individual stage tests.
- **D-02:** Test both sources separately (one test for FDIC, one for NCUA) plus a combined test that seeds both and verifies mixed charter types.

### Data Validation
- **D-03:** Assert all required fields are non-null: `institution_name`, `charter_type`, `website_url` (for FDIC — NCUA may lack URLs), `asset_size`, `fed_district`, `source`, `cert_number`.
- **D-04:** Validate field values where possible: `charter_type` in (`bank`, `credit_union`), `source` in (`fdic`, `ncua`), `fed_district` is 1-12, `asset_size` > 0.
- **D-05:** Use structural assertions (non-null, valid ranges) not exact values — institution data changes.

### NCUA URL Gap
- **D-06:** Accept that NCUA-seeded institutions may have null `website_url` — assert this is expected behavior. The URL backfill is a separate pipeline step tested in Phase 3 (discovery).
- **D-07:** For FDIC-seeded institutions, assert `website_url` IS populated (FDIC includes WEBADDR).

### Claude's Discretion
- Test file organization (single file vs split per source)
- Whether to use `@pytest.mark.e2e` and/or `@pytest.mark.llm` on seed tests (seed doesn't use LLM, so just `e2e`)
- Fixture design for pre-seeded DB state that later phases can build on

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Seed Implementation
- `fee_crawler/commands/seed_institutions.py` — `seed_fdic()` (line 28) and `seed_ncua()` (line 120), both accept `db: Database, config: Config, limit: int | None`
- `fee_crawler/config.py` — `FDICConfig` and `NCUAConfig` with API URLs

### Test Infrastructure (Phase 1)
- `fee_crawler/tests/e2e/conftest.py` — `test_db`, `test_config`, `test_db_path` fixtures
- `conftest.py` (root) — `geography` fixture with `--geography` CLI option
- `pyproject.toml` — pytest markers (e2e, llm, slow)

### Database Schema
- `fee_crawler/db.py` — `Database` class, `crawl_targets` table schema (line ~100-200)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `test_db` fixture (session-scoped): provides isolated Database instance with init_tables=True
- `test_config` fixture: provides Config with temp paths for DB, documents, lock file
- `geography` fixture: returns selected state code for parametrized tests

### Established Patterns
- `seed_fdic(db, config, limit=N)` returns count of seeded institutions
- `seed_ncua(db, config, limit=N)` returns count of seeded institutions
- Both accept Database and Config — directly compatible with Phase 1 fixtures

### Integration Points
- Seed tests produce populated `crawl_targets` rows — Phase 3 (discovery) will query these
- Consider a `seeded_db` fixture that later phases can reuse

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. Phase 1 decisions (live APIs, VT/RI geography, one-time seed) carry forward.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-seed-stage-tests*
*Context gathered: 2026-04-06*
