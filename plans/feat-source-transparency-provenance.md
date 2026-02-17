# Feature: Source Transparency & Provenance

## Problem

Fees in the Bank Fee Index lack any attribution to their source. Users cannot:
- See **where** a fee was extracted from (URL, PDF, HTML page)
- View the **original document** to verify accuracy
- See the **institution's website** for context
- Know **when** the fee was last crawled

This undermines trust in the data. The user's mandate: "the most important thing about this is the accuracy of fees, and transparency of source."

Additionally, categorization and analysis currently run as separate CLI commands after crawling. They should execute **inline** when data lands in the DB.

## Current State

### What exists in the DB (but is never surfaced):
- `crawl_targets.website_url` - institution homepage
- `crawl_targets.fee_schedule_url` - fee schedule page URL
- `crawl_results.document_url` - actual URL fetched during crawl
- `crawl_results.document_path` - local file path (e.g., `data/documents/123/fee_schedule.pdf`)
- `crawl_results.content_hash` - SHA-256 hash of document content
- `crawl_results.crawled_at` - timestamp of crawl
- `extracted_fees.crawl_result_id` - FK linking each fee to its crawl result

### What the frontend currently shows:
- Fee name, amount, frequency, conditions, confidence, review status
- Institution name, state, charter type, asset size
- **No source URLs, no document links, no crawl timestamps**

### Document storage (current):
- Files saved to `data/documents/{target_id}/fee_schedule.{ext}`
- **Overwritten** on each re-crawl (no historical versions)

## Plan

### Step 1: Content-addressed document storage
- [ ] **File: `fee_crawler/pipeline/download.py`**
- Change filename from `fee_schedule.{ext}` to `{hash[:16]}{ext}` (first 16 chars of SHA-256)
- This preserves historical versions automatically (new crawl = new hash = new file)
- Old files persist on disk as audit trail
- Update `document_path` in `crawl_results` to reflect the new filename

### Step 2: Add API route to serve stored documents
- [ ] **File: `src/app/api/documents/[...path]/route.ts`** (new)
- Serve files from `data/documents/` directory
- Map URL `/api/documents/{target_id}/{filename}` to local file
- Set appropriate `Content-Type` headers (PDF, HTML)
- Require auth (reuse `requireAuth` from `src/lib/auth.ts`)
- Only serve files that exist in `crawl_results.document_path`

### Step 3: Extend DB queries to include source data
- [ ] **File: `src/lib/crawler-db.ts`**
- Add `website_url`, `fee_schedule_url` to `InstitutionDetail` interface and `getInstitutionById()` query
- Add `getLatestCrawlResult(targetId)` query: returns `document_url`, `document_path`, `crawled_at`, `content_hash` from most recent successful `crawl_results` row
- Add `getFeeSource(feeId)` query: joins `extracted_fees` -> `crawl_results` to get `document_url`, `document_path`, `crawled_at` for a specific fee
- Extend `getFeesByInstitution()` to include `crawl_result_id`

### Step 4: Add source panel to institution detail page
- [ ] **File: `src/app/admin/peers/[id]/page.tsx`**
- Add a "Source & Provenance" card below the institution header:
  - **Website**: clickable link to `website_url` (external, opens in new tab)
  - **Fee Schedule URL**: clickable link to `fee_schedule_url` (external)
  - **Cached Document**: link to `/api/documents/...` for the stored copy, with document type badge (PDF/HTML)
  - **Last Crawled**: `crawled_at` timestamp via `timeAgo()`
  - **Content Hash**: first 8 chars of `content_hash` (for audit trail)

### Step 5: Add source attribution to fee detail page
- [ ] **File: `src/app/admin/review/[id]/page.tsx`**
- Add a "Source" section to the fee details card:
  - Link to the fee schedule URL (external)
  - Link to the cached document (internal `/api/documents/...`)
  - Crawl timestamp
  - "View institution" link to `/admin/peers/{target_id}`

### Step 6: Add source column to fees list
- [ ] **File: `src/app/admin/fees/page.tsx`**
- Add a small "Source" link on each fee row that links to the cached document or original URL
- Show crawl age as a subtle timestamp

### Step 7: Inline categorization after crawl
- [ ] **File: `fee_crawler/commands/crawl.py`**
- After fees are inserted (Step 6 in `_crawl_one()`), run `normalize_fee_name()` + `get_fee_family()` on each fee and SET `fee_category`, `fee_family` directly in the INSERT
- This removes the need to run `python3 -m fee_crawler categorize` as a separate step
- The `categorize` command still exists for bulk re-runs when aliases change

### Step 8: Inline peer analysis after crawl (lightweight)
- [ ] **File: `fee_crawler/commands/crawl.py`**
- After categorization, queue a lightweight analysis for the institution
- Import and call the analysis function directly rather than requiring a separate CLI step
- Only run if the crawl was successful and extracted 3+ fees

## Files Modified

| File | Change |
|------|--------|
| `fee_crawler/pipeline/download.py` | Content-addressed filenames |
| `src/app/api/documents/[...path]/route.ts` | New API route for document serving |
| `src/lib/crawler-db.ts` | New queries + extended interfaces |
| `src/app/admin/peers/[id]/page.tsx` | Source provenance panel |
| `src/app/admin/review/[id]/page.tsx` | Source attribution on fee detail |
| `src/app/admin/fees/page.tsx` | Source column in fees list |
| `fee_crawler/commands/crawl.py` | Inline categorization + analysis |

## Verification

1. Re-crawl a few institutions: `python3 -m fee_crawler crawl --limit 3`
2. Verify content-addressed files: `ls data/documents/*/` should show hash-named files
3. Verify inline categorization: new fees should have `fee_category` set immediately
4. Visit `/admin/peers/{id}` - should show source panel with links
5. Visit `/admin/review/{id}` - should show source URL and cached document link
6. Click cached document link - should serve the PDF/HTML
7. `npx next build` - passes

## Out of Scope

- Historical document diff/comparison (future feature)
- Denormalizing `source_url` onto `extracted_fees` (the FK join is sufficient)
- Supabase/S3 storage migration (local files work for now)
- Screenshot/archive.org snapshots of HTML pages
