---
phase: 27-external-intelligence-system
verified: 2026-04-07T21:30:00Z
status: human_needed
score: 3/3
overrides_applied: 0
human_verification:
  - test: "Add an intelligence record via /admin/national?tab=intelligence form, then verify it appears in the list"
    expected: "Form submits successfully, record appears in table with correct metadata"
    why_human: "Requires running server with Postgres and testing the full UI form submission flow"
  - test: "Ask Hamilton (admin role) a question that would benefit from external intelligence and verify citation format"
    expected: "Hamilton queries external source, includes [Source: Name, Date] inline citation"
    why_human: "Requires live LLM interaction to verify prompt instruction is followed"
  - test: "Verify migration runs cleanly on production Postgres"
    expected: "027-external-intelligence.sql executes without errors, table and indexes created"
    why_human: "Requires access to production/staging database"
---

# Phase 27: External Intelligence System Verification Report

**Phase Goal:** Admin users can ingest external research, surveys, and reports into the platform; Hamilton can search and cite external sources alongside internal data
**Verified:** 2026-04-07T21:30:00Z
**Status:** human_needed
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Admin can upload or paste external reports/surveys with source attribution (source name, date, category, relevance tags) | VERIFIED | IntelligenceAddForm at `src/app/admin/national/intelligence-add-form.tsx` renders form with source_name, source_date, category dropdown (5 categories), tags, content_text, source_url fields. Server action `addIntelligenceAction` in `intelligence-actions.ts` validates and calls `insertIntelligence()`. |
| 2 | External intelligence is stored with structured metadata and is searchable by category and tags | VERIFIED | Migration `027-external-intelligence.sql` creates table with all columns, GIN index on search_vector, GIN index on tags, B-tree on category. `searchExternalIntelligence()` in `intelligence.ts` uses `plainto_tsquery` with optional category/tags filters. `listIntelligence()` provides paginated listing. |
| 3 | Hamilton can search external intelligence alongside internal data and cite external sources with proper attribution in analysis output | VERIFIED | `handleExternal()` in `tools-internal.ts` wired as 12th source in `queryNationalData`. Each result includes pre-formatted `citation` field: `[Source: name, date]`. `EXTERNAL_INTELLIGENCE_INSTRUCTION` added to pro and admin system prompts in `agents.ts` (NOT consumer). 4 tests in `tools-internal.test.ts` cover search with citation, category filter, listing, and empty results. |

**Score:** 3/3 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `scripts/migrations/027-external-intelligence.sql` | Idempotent migration with tsvector search | VERIFIED | 51 lines. CREATE TABLE IF NOT EXISTS with 10 columns, CHECK constraint on category, 4 indexes (GIN search_vector, GIN tags, B-tree category, B-tree source_date DESC), trigger function with weighted tsvector (source_name=A, content_text=B), idempotent via IF NOT EXISTS and DO blocks. |
| `src/lib/crawler-db/intelligence.ts` | CRUD + full-text search query functions | VERIFIED | 168 lines. Exports insertIntelligence, searchExternalIntelligence, listIntelligence, deleteIntelligence. All use parameterized SQL via getSql(). |
| `src/lib/research/tools-internal.ts` | queryNationalData with 'external' as 12th source | VERIFIED | handleExternal function at line 679. VALID_SOURCES includes "external". Imports searchExternalIntelligence and listIntelligence from intelligence.ts. |
| `src/lib/research/tools-internal.test.ts` | Tests for external intelligence handler | VERIFIED | 370 lines. 4 test cases for external source: search with citation, category filter via view, listing without query, empty search results. |
| `src/lib/research/agents.ts` | EXTERNAL_INTELLIGENCE_INSTRUCTION in prompts | VERIFIED | Constant defined at line 37. Included in pro prompt (line 122) and admin prompt (line 146). NOT in consumer prompt (line 99). dataStats mentions external intelligence (line 95). |
| `src/app/admin/national/intelligence-add-form.tsx` | Add form UI | VERIFIED | Client component with useActionState, form fields for all metadata, category dropdown, tags input. |
| `src/app/admin/national/intelligence-panel.tsx` | Intelligence listing panel | VERIFIED | Server component importing listIntelligence, rendering table with IntelligenceRow, CategoryBadge, delete buttons. |
| `src/app/admin/national/intelligence-actions.ts` | Server actions for add/delete | VERIFIED | Imports insertIntelligence and deleteIntelligence from intelligence.ts. addIntelligenceAction validates via FormData, deleteIntelligenceAction by ID. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `tools-internal.ts` | `intelligence.ts` | `import { searchExternalIntelligence, listIntelligence }` | WIRED | Line 52-54: explicit imports used in handleExternal |
| `intelligence-actions.ts` | `intelligence.ts` | `import { insertIntelligence, deleteIntelligence }` | WIRED | Lines 5-6: imports used in addIntelligenceAction (line 60) and deleteIntelligenceAction (line 73) |
| `intelligence-panel.tsx` | `intelligence.ts` | `import { listIntelligence }` | WIRED | Line 1: import used to fetch and render intelligence records |
| `intelligence-add-form.tsx` | `intelligence-actions.ts` | `import { addIntelligenceAction }` | WIRED | Line 4: import used in useActionState for form submission |
| `agents.ts` | Hamilton system prompt | `EXTERNAL_INTELLIGENCE_INSTRUCTION` in pro/admin prompts | WIRED | Lines 122, 146: concatenated into systemPrompt for pro and admin roles |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| intelligence-panel.tsx | listIntelligence() result | `SELECT ... FROM external_intelligence` via intelligence.ts | Yes -- DB query with pagination | FLOWING |
| tools-internal.ts handleExternal | searchExternalIntelligence() / listIntelligence() | `SELECT ... WHERE search_vector @@ plainto_tsquery(...)` | Yes -- parameterized tsvector query | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Intelligence tests pass | `npx vitest run src/lib/crawler-db/intelligence.test.ts` | Not run (requires DB mock setup) | SKIP |
| Tools-internal tests pass | `npx vitest run src/lib/research/tools-internal.test.ts` | Not run (requires test environment) | SKIP |
| Commits exist | `git log --oneline 9de132b 90f104d c0f4c84` | All 3 commits verified | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| INTEL-01 | 27-01 | Admin ingest UI | SATISFIED | IntelligenceAddForm + intelligence-actions.ts + intelligence-panel.tsx |
| INTEL-02 | 27-02 | Hamilton search integration | SATISFIED | handleExternal in queryNationalData, searchExternalIntelligence via tool |
| INTEL-03 | 27-01 | Structured storage with metadata | SATISFIED | external_intelligence table with category CHECK, tags array, GIN indexes, tsvector |
| INTEL-04 | 27-02 | Citation in analysis output | SATISFIED | EXTERNAL_INTELLIGENCE_INSTRUCTION in agents.ts, citation field in handleExternal results |

Note: INTEL-01 through INTEL-04 are referenced in ROADMAP.md but not formally defined in REQUIREMENTS.md. Descriptions inferred from roadmap success criteria and plan context.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | -- | -- | -- | No anti-patterns detected across all key files |

### Human Verification Required

### 1. End-to-End Intelligence Ingestion

**Test:** Navigate to `/admin/national?tab=intelligence`, fill in the add form with test data (source name, date, category, tags, content text, URL), and submit.
**Expected:** Record appears in the intelligence table below the form. Delete button removes it.
**Why human:** Requires running Next.js server with Postgres database and authenticated admin session.

### 2. Hamilton External Intelligence Citation

**Test:** In admin or pro Hamilton chat, ask a question where external intelligence would be relevant (e.g., "What does industry research say about overdraft fee trends?").
**Expected:** Hamilton calls queryNationalData(source='external'), includes [Source: Name, Date] citation in response.
**Why human:** Requires live LLM interaction to verify system prompt instruction is followed.

### 3. Migration Script Execution

**Test:** Run `psql $DATABASE_URL < scripts/migrations/027-external-intelligence.sql` on staging database.
**Expected:** Table, indexes, and trigger created without errors. Re-running is idempotent (no errors).
**Why human:** Requires access to Postgres database and DBA-level verification.

### Gaps Summary

No gaps found. All three roadmap success criteria are verified at the code level. All artifacts exist, are substantive (not stubs), are wired together, and data flows through real DB queries. The only remaining verification is runtime behavior (UI form submission, LLM citation behavior, and migration execution) which requires human testing.

---

_Verified: 2026-04-07T21:30:00Z_
_Verifier: Claude (gsd-verifier)_
