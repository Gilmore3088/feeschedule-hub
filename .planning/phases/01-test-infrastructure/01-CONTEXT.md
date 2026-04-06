# Phase 1: Test Infrastructure - Context

**Gathered:** 2026-04-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the isolated test harness that all 10 subsequent pipeline stage tests depend on. This includes: pytest markers, test database isolation, geography fixtures, lock file override, R2 storage bypass, and Config override fixture. No actual pipeline stage tests in this phase.

</domain>

<decisions>
## Implementation Decisions

### DB Isolation
- **D-01:** Claude's discretion on temp file vs :memory: — choose based on whether pipeline stages spawn subprocesses that need shared DB access. The Database class already accepts Config with a `database.path` field (Pydantic `DatabaseConfig`), so override is straightforward.
- **D-02:** Claude's discretion on lock file approach — `LOCK_FILE` is hardcoded at module level in `fee_crawler/pipeline/executor.py:18`. Either monkeypatch or refactor to Config-driven.

### Test Geography
- **D-03:** Default geography is Vermont (VT) or Rhode Island (RI). Do NOT use Wyoming (WY) — user is actively working on Wyoming data.
- **D-04:** Random state selection each run — but from small states only to avoid slow large-state runs (TX=5k+ banks).
- **D-05:** Aim for 80%+ institution coverage within the selected state — statistically significant, not a token sample.
- **D-06:** Document learnings per state — create a per-state tips/tricks/instructions file that compounds across runs. (Note: full compounding loop is Milestone 2, but the file structure should be established here.)
- **D-07:** Claude's discretion on CLI override mechanism (pytest option vs env var).

### Fixture Layering
- **D-08:** FDIC/NCUA API calls are one-time per state. First run seeds from live APIs, subsequent runs re-use already-seeded data. No re-fetching unless explicitly forced.
- **D-09:** Claude's discretion on session-scoped vs function-scoped DB fixture.

### Mock Boundaries
- **D-10:** Everything runs live — real FDIC/NCUA APIs (for first seed), real website crawling, real Claude Haiku LLM extraction. This is a true e2e test, not a mock test.
- **D-11:** Claude's discretion on R2 storage — likely override `document_storage_dir` to tmp_path for test runs.
- **D-12:** Cost is accepted for real LLM calls — Haiku is cheapest. Budget guard: cap at institutions in the selected small state (typically <50 for VT/RI), with the 3-5 institution limit applied at the pipeline stage level.

### Claude's Discretion
- DB isolation approach (temp file vs :memory:) — D-01
- Lock file override strategy — D-02
- CLI geography override mechanism — D-07
- DB fixture scope — D-09
- R2 storage bypass approach — D-11

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Pipeline Infrastructure
- `fee_crawler/config.py` — Pydantic Config with DatabaseConfig.path, ExtractionConfig.document_storage_dir
- `fee_crawler/db.py` — Database class (line 479), accepts Config, init_tables flag
- `fee_crawler/pipeline/executor.py` — LOCK_FILE constant (line 18), Stage dataclass, PIPELINE_STAGES list

### Existing Test Patterns
- `fee_crawler/tests/` — Existing 60 pytest tests (fee_analysis, validation) — follow their patterns

### Research Findings
- `.planning/research/STACK.md` — Recommended pytest plugins (pytest-httpserver, vcrpy, pytest-mock)
- `.planning/research/ARCHITECTURE.md` — Four-layer test architecture, fixture scope guidance
- `.planning/research/PITFALLS.md` — 14 domain-specific pitfalls, especially DB contamination and lock file collision

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `Database` class (`fee_crawler/db.py:479`): Already accepts Config with path — test fixture just needs a Config with tmp_path
- `Config` class (`fee_crawler/config.py:98`): Pydantic BaseModel — easy to construct test instances with overrides
- `PIPELINE_STAGES` list (`fee_crawler/pipeline/executor.py:28`): Ordered stage definitions — can drive parametrized tests

### Established Patterns
- Config is Pydantic-based — construct with kwargs, no YAML needed for tests
- Database uses context manager pattern (`__enter__`/`__exit__`) — compatible with pytest fixtures
- Pipeline is linear (no DAG) — stages chain sequentially

### Integration Points
- `conftest.py` will be created at `fee_crawler/tests/conftest.py` (or project root)
- `pyproject.toml` needs `[tool.pytest.ini_options]` section for markers
- Test geography fixture feeds into seed stage tests (Phase 2)

</code_context>

<specifics>
## Specific Ideas

- Vermont and Rhode Island are preferred small test states — user knows their institution landscapes
- Wyoming is explicitly off-limits for test geography (active work there)
- Per-state learning files should be human-readable — tips, tricks, known URL patterns, extraction gotchas
- 80%+ coverage target means if VT has 40 institutions, test should process 32+
- User wants this to be a real proof that the pipeline works, not a synthetic mock test

</specifics>

<deferred>
## Deferred Ideas

- Per-state compounding intelligence (learning files that improve across runs) — Milestone 2
- VCR cassettes for offline CI (v2 requirement COV-01) — not in this phase

</deferred>

---

*Phase: 01-test-infrastructure*
*Context gathered: 2026-04-06*
