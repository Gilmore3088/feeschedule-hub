---
phase: 27-external-intelligence-system
plan: 02
subsystem: research-tools
tags: [hamilton, tools, external-intelligence, citation]
dependency_graph:
  requires: [external_intelligence_table, tsvector_search]
  provides: [queryNationalData_external_source, hamilton_citation_instruction]
  affects: [tools-internal.ts, agents.ts, hamilton-prompts]
tech_stack:
  added: []
  patterns: [tool-source-handler, citation-field, view-as-category-filter]
key_files:
  created: []
  modified:
    - src/lib/research/tools-internal.ts
    - src/lib/research/tools-internal.test.ts
    - src/lib/research/agents.ts
decisions:
  - "Reused view param as category filter for external source rather than adding new param"
  - "Pre-formatted citation field on every result so Hamilton can paste directly"
  - "Content truncated to 500 chars for search, 300 for listing to avoid bloating tool responses"
metrics:
  duration: 206s
  completed: "2026-04-07T13:08:15Z"
  tasks_completed: 2
  tasks_total: 2
  files_created: 0
  files_modified: 3
---

# Phase 27 Plan 02: Hamilton External Intelligence Tool Integration Summary

External intelligence wired as 12th source in queryNationalData with full-text search, category filtering, and pre-formatted citation fields for inline attribution.

## What Was Done

### Task 1: Add "external" source to queryNationalData tool (TDD)

**RED:** Wrote 4 failing tests for external source: search with citation, category filter via view param, recent listing without query, and empty search results.

**GREEN:** Implemented handleExternal function and wired into queryNationalData:
- Added `searchExternalIntelligence` and `listIntelligence` imports from intelligence.ts
- Added "external" to VALID_SOURCES array (now 12 sources)
- Added `query` parameter to inputSchema for full-text search
- Updated tool description to mention external intelligence
- handleExternal: when query provided, calls searchExternalIntelligence with optional category filter (via view param); when no query, calls listIntelligence for recent entries
- Every result includes pre-formatted `citation` field: `[Source: name, date]`
- Content truncated to 500 chars (search) / 300 chars (listing) to control response size

**Commit:** `90f104d`

### Task 2: Add external intelligence citation instruction to Hamilton system prompt

- Created `EXTERNAL_INTELLIGENCE_INSTRUCTION` constant with guidance on when/how to query and cite external sources
- Added to pro and admin system prompts (NOT consumer -- external intelligence is B2B only)
- Updated dataStats to mention "admin-curated external intelligence (industry research, surveys, regulatory reports)"
- Citation format: `[Source: Name, Date]` matching the tool's citation field
- Explicit instruction to never fabricate citations -- only cite sources returned by the tool

**Commit:** `c0f4c84`

## Commits

| Hash | Message |
|------|---------|
| 90f104d | feat(27-02): add external intelligence as 12th source in queryNationalData |
| c0f4c84 | feat(27-02): add external intelligence citation instruction to Hamilton prompts |

## Deviations from Plan

None -- plan executed exactly as written.

## Self-Check: PASSED

- [x] src/lib/research/tools-internal.ts contains handleExternal (FOUND)
- [x] src/lib/research/tools-internal.test.ts has external tests (FOUND)
- [x] src/lib/research/agents.ts has EXTERNAL_INTELLIGENCE_INSTRUCTION (FOUND)
- [x] Commit 90f104d exists (FOUND)
- [x] Commit c0f4c84 exists (FOUND)
- [x] All 28 tests pass (24 existing + 4 new)
- [x] No console.log statements
