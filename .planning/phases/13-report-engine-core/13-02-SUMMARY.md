---
phase: 13-report-engine-core
plan: "02"
subsystem: report-engine
tags: [report-engine, modal, playwright, r2, editor-review, hamilton, tdd]
dependency_graph:
  requires:
    - 13-01 (report_jobs table + ReportJob types)
    - Phase 12 Hamilton foundation (ValidatedSection, HAMILTON_RULES, HAMILTON_FORBIDDEN)
  provides:
    - generate_report Modal function (HTML → PDF → R2)
    - render_and_store() Playwright render helper
    - upload_to_r2() R2 upload helper
    - update_job_status() Supabase status writer
    - runEditorReview() second Claude pass
    - EditorReviewResult + FlaggedSection types
  affects:
    - Phase 13-03 (API routes call generate_report + runEditorReview)
    - Phase 14+ (all report templates use both render and editor)
tech_stack:
  added: []
  patterns:
    - Playwright async_playwright context manager for headless PDF render
    - boto3 S3-compatible client for Cloudflare R2 upload
    - psycopg2 open/close per DB write (not singleton — Modal worker pattern)
    - vi.mock class pattern for Anthropic SDK in vitest (constructor mock)
    - Relative imports (../hamilton/voice) instead of @/ alias for cross-lib imports in tests
key_files:
  created:
    - fee_crawler/workers/report_render.py
    - src/lib/report-engine/editor.ts
    - src/lib/report-engine/editor.test.ts
  modified:
    - fee_crawler/modal_app.py (generate_report appended)
    - src/lib/report-engine/index.ts (editor exports added)
decisions:
  - "browser_image reused for generate_report — no new Modal image created (D-02)"
  - "R2 key pattern is reports/{report_type}/{job_id}.pdf exactly (D-03)"
  - "Editor uses claude-haiku-4-20250514 — cheap pattern-match model, not Hamilton's sonnet writer (D-12)"
  - "JSON parse failure in editor defaults to approved=false with major flag (T-13-08 fail-safe)"
  - "UUID validation on job_id in update_job_status and render_and_store (T-13-05 mitigation)"
  - "Relative import ../hamilton/voice used in editor.ts — @/ alias not resolvable in vitest for non-mocked cross-lib imports"
metrics:
  duration_minutes: 18
  completed_at: "2026-04-06T15:31:46Z"
  tasks_completed: 2
  tasks_total: 2
  files_created: 3
  files_modified: 2
---

# Phase 13 Plan 02: Modal Render Worker + Editor Review Summary

**One-liner:** Playwright HTML-to-PDF render worker on Modal (browser_image, Letter format, 0.75in margins) writing to R2 under reports/{type}/{id}.pdf, plus a haiku-powered critic editor that blocks publication on unsupported claims.

## Modal Function: generate_report

```python
@app.function(secrets=secrets, timeout=300, image=browser_image, memory=2048)
async def generate_report(job_id: str, html: str, report_type: str) -> dict:
```

- Image: `browser_image` (existing — Playwright already installed, per D-02)
- Memory: 2048 MB (Playwright Chromium requires headroom)
- Timeout: 300s (generous for complex HTML with fonts/CSS)
- Flow: `update_job_status('rendering')` → `render_and_store()` → `update_job_status('complete')` → return key
- Error path: `update_job_status('failed', error=str(exc)[:500])` then re-raise

## report_render.py: Three Helpers

| Function | Purpose |
|----------|---------|
| `update_job_status(job_id, status, artifact_key, error)` | psycopg2 write to report_jobs; sets completed_at only for terminal states |
| `upload_to_r2(pdf_bytes, key)` | boto3 S3-compatible PUT to Cloudflare R2; returns key not URL |
| `render_and_store(html, job_id, report_type)` | Playwright chromium launch → set_content → pdf() → upload_to_r2 |

**R2 key pattern:** `reports/{report_type}/{job_id}.pdf` (D-03 — exact match)

**Playwright settings:** `format="Letter"`, `print_background=True`, margins `0.75in` all sides (per ARCHITECTURE.md)

**UUID validation:** Both `update_job_status` and `render_and_store` call `_validate_job_id()` — raises ValueError on invalid UUID (T-13-05 mitigation).

## Editor Review Module (editor.ts)

**Model:** `claude-haiku-4-20250514` — chosen for cost efficiency (pattern-match critic task, not generative writing)

**System prompt identity:** Editorial director, not Hamilton writer (D-12). Reviews for:
1. Unsupported claims (major severity — blocks publication)
2. Voice drift against HAMILTON_RULES (minor severity)
3. Forbidden phrases from HAMILTON_FORBIDDEN (minor severity)

**Approve/reject logic:**

| Condition | approved |
|-----------|---------|
| No flagged sections | `true` |
| Only minor flags | `true` |
| Any major flag | `false` |
| JSON parse failure | `false` (T-13-08 fail-safe, synthetic major flag injected) |

**User message:** Sends each ValidatedSection's type, title, narrative, and source data for grounded review.

## Test Results

3 vitest tests, all passing:
- major flag → `approved=false`
- empty flaggedSections → `approved=true`
- all-minor flags → `approved=true`

## Commits

| Hash | Description |
|------|-------------|
| 661861b | feat(13-02): add report_render worker + generate_report Modal function |
| 299d4f6 | feat(13-02): add editor review module with 3 vitest tests |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Worktree missing 13-01 commits**
- **Found during:** Pre-task setup
- **Issue:** Worktree branch was 13 commits behind main; `src/lib/report-engine/` directory did not exist
- **Fix:** Rebased worktree-agent-aa09c61c onto 348a4c5 (main HEAD after 13-01 completed)
- **Files modified:** None (rebase only)
- **Commit:** N/A (rebase, not a new commit)

**2. [Rule 1 - Bug] @/ alias not resolvable for non-mocked cross-lib imports in vitest**
- **Found during:** Task 2 GREEN phase
- **Issue:** `import { HAMILTON_RULES } from "@/lib/hamilton/voice"` in editor.ts caused "Cannot find package" in vitest. The @/ alias works for mocked modules (vi.mock intercepts before resolution) but not for live imports across lib boundaries
- **Fix:** Changed to relative import `../hamilton/voice` and `../hamilton/types` in editor.ts
- **Files modified:** src/lib/report-engine/editor.ts
- **Commit:** Included in 299d4f6

**3. [Rule 1 - Bug] vi.mock class pattern needed for Anthropic constructor**
- **Found during:** Task 2 GREEN phase — first test run showed "is not a constructor"
- **Issue:** `vi.fn().mockImplementation(() => ({...}))` doesn't satisfy `new Anthropic()` — vitest requires the mock default export to be a class or constructor function
- **Fix:** Changed mock to `class MockAnthropic { messages = { create: mockCreate }; }` with module-scope `mockCreate` vi.fn()
- **Files modified:** src/lib/report-engine/editor.test.ts
- **Commit:** Included in 299d4f6

## Known Stubs

None — render_and_store uses real Playwright (no stub), upload_to_r2 uses real boto3 (no stub), update_job_status uses real psycopg2 (no stub). Editor calls real Anthropic SDK (tested via mock; real in production).

## Threat Flags

None — no new network endpoints or auth paths introduced. generate_report is a Modal function called only by authenticated Next.js API routes (Phase 13-03). R2 keys stored as opaque paths, not URLs (D-03/T-13-06 accepted).

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| fee_crawler/workers/report_render.py | FOUND |
| src/lib/report-engine/editor.ts | FOUND |
| src/lib/report-engine/editor.test.ts | FOUND |
| Commit 661861b | FOUND |
| Commit 299d4f6 | FOUND |
