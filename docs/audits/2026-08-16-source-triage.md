# Source & Coverage Triage — 2026-08-16 (read-only)

Follow-up to the catalog data-quality audit. Where the 30→500 report-viable
coverage actually gets won, classified from live registry state.

## The funnel wall, decomposed (8,750 institutions)

| Class | Count | Fix path |
|---|---|---|
| **No fee_schedule_url at all** | **4,157** | Discovery (Atlas/Magellan): crawl website_url for fee/disclosure links. THE biggest lever — half the registry has no known document location. |
| URL on file, never fetched successfully | 654 | Fetch triage below |
| Sustained failures (5+ consecutive) | 128 | Fetch triage below |
| Active + fetched OK | ~3,900 | Extraction/verification quality work |

## Fetch-failure classes (sources with ≥1 consecutive failure)

| failure_reason | n | sustained (≥5) | Fix |
|---|---|---|---|
| (none recorded) | 866 | 96 | Instrumentation gap — Magellan should always stamp a reason; classify these first |
| dead_url | 109 | 24 | Re-discovery from website_url |
| wrong_document:* (other/tis/agreement/rate_sheet) | 58 | 6 | Rosetta doc-classification retraining / alternate link selection |
| cloudflare_blocked | 3 | 2 | Headless/browser-profile fetch |

## Document-type mix (where a URL exists)

pdf 1,384 · html 1,313 · js_rendered 775 (needs headless rendering) ·
other 389 · unknown 241. Note: `extraction_completeness_label` is populated for
0 rows — the field exists but nothing writes it; wire it up or drop it.

## Priority order for the pilot budget

1. **Provenance backfill first** (see catalog audit): re-extract the 944
   unsourced-but-published institutions whose fee_schedule_url is on file —
   turns existing catalog rows into receipt-backed rows.
2. **Discovery sweep** over the 4,157 no-URL institutions (biggest viable-count lever).
3. **Dead-URL re-discovery** (109) and the 96 unclassified sustained failures.
4. **js_rendered fetching** (775 sources) via headless fetch.

All four are agent-pipeline runs gated on the user's Anthropic API spend cap.
