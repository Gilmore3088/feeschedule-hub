# UI-First Pipeline Refactor

## Principle

The admin never types CLI args. Every action is a button click. Backend flags exist but the UI sets them intelligently.

## Current CLI Args → UI Actions

### Crawl
| CLI Arg | UI Action | Default |
|---------|-----------|---------|
| `--limit` | Hidden. UI sends 50 for targeted, 500 for "crawl all gaps" | 50 |
| `--state` | State dropdown on ops panel | Already done |
| `--tier` | Tier dropdown on ops panel | Need to add |
| `--skip-with-fees` | Always on. No toggle. | True (done) |
| `--new-only` | Hidden. Auto-set when "Crawl new discoveries" clicked | False |
| `--workers` | Hidden. Always 2. | 2 |
| `--dry-run` | Not in UI. Dev only. | False |
| `--include-failing` | Not in UI. Dev only. | False |
| **NEW: --target-id** | "Crawl Now" button on institution page | N/A |

### Discover
| CLI Arg | UI Action | Default |
|---------|-----------|---------|
| `--limit` | Hidden. UI sends 100. | 100 |
| `--state` | State dropdown on ops panel | Already done |
| `--source` | Charter type dropdown (banks vs CUs) | Already done |
| `--force` | Not in UI. Dev only. | False |
| `--workers` | Hidden. Always 2. | 2 |

### Run Pipeline
| CLI Arg | UI Action | Default |
|---------|-----------|---------|
| `--limit` | "Smart Pipeline" button. No limit config. | 100 |
| `--state` | State dropdown | Already done |
| `--skip-discover/crawl/categorize` | Not in UI. Full pipeline always. | False |
| `--workers` | Hidden. | 4 |

### Auto-Review
| CLI Arg | UI Action | Default |
|---------|-----------|---------|
| `--dry-run` | Not in UI. Always runs for real. | False |
| N/A | "Auto-Review" button on pipeline backlog bar | N/A |

### Refresh Data
| CLI Arg | UI Action | Default |
|---------|-----------|---------|
| `--cadence` | 4 buttons: Daily / Weekly / Quarterly / Annual | daily |
| `--only` | Not in UI. Refresh all for that cadence. | None |

### Categorize, Validate, Enrich, Outlier-Detect
| CLI Arg | UI Action | Default |
|---------|-----------|---------|
| All args | One button each: "Categorize All" / "Validate All" / "Enrich All" / "Detect Outliers" | N/A |

## New UI Actions Needed

### Institution Page (`/admin/peers/[id]`)
1. **"Update Fee Schedule URL"** -- input field + save button
2. **"Crawl Now"** -- button that crawls this specific institution
3. **"View Source"** -- link to the fee schedule URL (opens in new tab)

### Pipeline Backlog Bar (already built, needs buttons)
4. **"Discover Gaps"** -- runs discover with smart defaults (skip discovered, limit 100)
5. **"Crawl Gaps"** -- runs crawl with skip-with-fees (all 475 gaps)
6. **"Categorize All"** -- runs categorize (instant, no API)
7. **"Auto-Review"** -- runs auto-review (instant, no API)

### Pipeline Page
8. **"Add Institution"** -- form to manually add an institution with name, URL, state, charter type
9. **"Bulk Import URLs"** -- already exists, works

### Ops Panel Simplification
10. Remove --limit input for most commands (use smart defaults)
11. Remove all toggle checkboxes (bake smart defaults in)
12. Keep: State dropdown, Charter dropdown, Tier dropdown
13. Add: "Smart Pipeline" one-click button at the top

## Implementation Order

### Build Now (high impact, you're blocked without these)
1. Institution page: URL edit + "Crawl Now" button
2. `--target-id` support in crawl command (backend)
3. Pipeline backlog "Run" buttons that trigger with smart defaults

### Build Next
4. Tier dropdown in ops panel
5. "Add Institution" form on pipeline page
6. Ops panel simplification (remove unnecessary inputs)

### Defer
7. "Smart Pipeline" one-click (run-pipeline already works, just needs better defaults)
8. Cadence buttons for refresh-data (GitHub Actions handles this)
