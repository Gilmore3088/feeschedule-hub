---
module: FeeSchedule Hub
date: 2026-02-16
problem_type: ui_bug
component: admin_hub_dark_mode
symptoms:
  - "Command palette completely invisible in dark mode (white dialog on dark background)"
  - "Status badges unreadable across review, fees, and peer pages"
  - "Form inputs (selects, search, toggles) invisible or unreadable in dark mode"
  - "20+ containers used hardcoded bg-white instead of admin-card class"
  - "Sticky table columns showed white blocks over dark backgrounds"
  - "Tooltips on charts rendered as white boxes with white text"
root_cause: incomplete_dark_mode_coverage
resolution_type: code_fix
severity: high
tags: [dark-mode, tailwind-v4, oklch, admin-card, ui-audit, design-system, accessibility]
---

# Troubleshooting: Comprehensive Dark Mode Failures Across Admin Hub

## Problem

After implementing a dark mode toggle and CSS-level overrides in `globals.css`, the admin hub appeared functional in light mode but was largely unusable in dark mode. A parallel 3-agent UI audit identified 50+ issues across all 12 admin pages. The core problem: individual components used hardcoded light-only colors (e.g., `bg-white`, `text-gray-900`, `border-gray-300`) that weren't covered by the global CSS overrides, and many containers bypassed the `.admin-card` class that had built-in dark mode support.

## Environment

- Module: FeeSchedule Hub Admin Hub
- Framework: Next.js 16.1.6, React 19.2.3, Tailwind CSS v4
- Dark mode: Class-based (`.dark` on `<html>`), oklch color space
- Affected: All 12 admin pages + 11 shared components
- Date: 2026-02-16

## Symptoms

**Critical (unusable):**
- Command palette (`Cmd+K`) rendered as invisible white dialog — search input, results, and keyboard hints all invisible
- Select dropdowns across peer filters, catalog filters, and index filters showed white text on white background

**High (unreadable):**
- Status badges (staged, flagged, pending, approved, rejected) had light-only background colors that clashed with dark backgrounds
- Severity badges on review detail pages were unreadable
- Confidence score badges showed wrong contrast
- Charter type badges (Bank/CU) invisible on peer and catalog pages

**Medium (visual inconsistency):**
- 20+ card containers used raw `bg-white rounded-lg border` instead of `.admin-card`
- Chart tooltips (fee histogram, breakdown chart) rendered as white boxes
- Collapsible section bodies showed jarring white panels
- Sticky table column backgrounds leaked through as white strips
- Filter chip active/inactive states indistinguishable

## What Didn't Work

**Global CSS overrides alone were insufficient.** The `globals.css` file had broad overrides like:
```css
.dark .admin-content .bg-white { background: oklch(0.205 0 0); }
.dark .admin-content .text-gray-900 { color: oklch(0.93 0 0); }
```

These covered basic text and backgrounds but missed:
- Colored badges (emerald, blue, orange, red, amber backgrounds)
- Interactive states (hover, focus, selected)
- Composite classes (e.g., `bg-blue-50 text-blue-600` on badges)
- Form elements (selects, inputs have browser-specific rendering)
- Dynamically applied classes (e.g., `selectedIndex === idx` conditionals)
- Tooltip components rendered inside Recharts (outside `.admin-content` scope)

## Solution

Four systematic fix categories applied across 18 files in a single commit.

### Fix 1: Command Palette Dark Mode (Critical)

**File:** `src/components/command-palette.tsx`

```tsx
// DialogContent — was completely unstyled for dark
<DialogContent className="sm:max-w-lg p-0 gap-0 overflow-hidden
  dark:bg-[oklch(0.205_0_0)] dark:border-white/[0.08]">

// Search input — invisible text
<input className="... dark:bg-transparent dark:text-gray-100
  dark:placeholder:text-gray-500" />

// Result items — no hover/selected states
<button className={`... hover:bg-gray-50 dark:hover:bg-white/[0.06]
  ${selected ? "bg-blue-50 text-blue-700
    dark:bg-blue-900/30 dark:text-blue-300" : "dark:text-gray-200"}`} />

// Footer kbd hints
<kbd className="... dark:bg-white/[0.08] dark:text-gray-400" />
```

### Fix 2: Status Badges Dark Mode Pattern

**Files:** `review/page.tsx`, `review/[id]/page.tsx`, `fees/page.tsx`, `peers/[id]/page.tsx`, `fees/catalog/[category]/page.tsx`

Established a consistent badge pattern across all pages:

```typescript
// Before (light only):
const STATUS_COLORS: Record<string, string> = {
  staged: "bg-blue-50 text-blue-600",
  approved: "bg-emerald-50 text-emerald-600",
  rejected: "bg-red-50 text-red-600",
};

// After (light + dark):
const STATUS_COLORS: Record<string, string> = {
  staged: "bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
  approved: "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400",
  rejected: "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400",
};
```

Severity badges on review detail page used a border variant:
```typescript
// Severity with border accent:
high: "bg-red-50 text-red-700 border border-red-200
  dark:bg-red-900/20 dark:text-red-400 dark:border-red-800/40",
```

### Fix 3: Container Standardization (admin-card)

**Files:** 8 page/component files, ~20 instances

Bulk-replaced raw container patterns with the `.admin-card` class:

```tsx
// Before (no dark mode):
<div className="bg-white rounded-lg border shadow-sm overflow-hidden">

// After (inherits dark mode from CSS):
<div className="admin-card overflow-hidden">
```

The `.admin-card` class in `globals.css` provides:
```css
.admin-card {
  background: white;
  border: 1px solid oklch(0 0 0 / 8%);
  border-radius: 0.5rem;
  box-shadow: var(--shadow-xs);
}
.dark .admin-card {
  background: oklch(0.205 0 0);
  border-color: oklch(1 0 0 / 8%);
}
```

Also fixed section headers within cards:
```tsx
// Card header sections:
<div className="px-4 py-3 border-b bg-gray-50 dark:bg-white/[0.03]">
```

### Fix 4: Form Inputs Dark Mode

**Files:** `peer-filters-bar.tsx`, `catalog-filters.tsx`, `review/fee-search.tsx`, `review/category-select.tsx`, `index/peer-index-filters.tsx`, `fees/page.tsx`, `institution-table.tsx`

Established input pattern:
```tsx
// Select dropdowns:
<select className="rounded-md border border-gray-300 px-2.5 py-1.5 text-sm
  dark:bg-[oklch(0.18_0_0)] dark:border-white/[0.12] dark:text-gray-100">

// Search inputs:
<input className="rounded-md border border-gray-300 px-3 py-1.5 text-sm
  dark:bg-[oklch(0.18_0_0)] dark:border-white/[0.12] dark:text-gray-100
  dark:placeholder:text-gray-500" />

// Toggle chips (active):
<button className="... bg-gray-900 text-white
  dark:bg-white/[0.15] dark:border-white/[0.15]">

// Toggle chips (inactive):
<button className="... border-gray-200 text-gray-600
  dark:bg-white/[0.04] dark:border-white/[0.1] dark:text-gray-400">

// Reset buttons:
<button className="... border-gray-300 text-gray-600 hover:bg-gray-50
  dark:border-white/[0.12] dark:text-gray-400 dark:hover:bg-white/[0.06]">
```

### Additional Fixes

**Chart tooltips** (`fee-histogram.tsx`, `breakdown-chart.tsx`):
```tsx
<div className="rounded-lg border bg-white px-3 py-2 text-xs shadow-md
  dark:bg-[oklch(0.24_0_0)] dark:border-white/[0.1]">
```

**Sticky table columns** (`institution-table.tsx`):
```tsx
<td className="sticky left-0 bg-white dark:bg-[oklch(0.205_0_0)]">
```

**Collapsible sections** (`collapsible-section.tsx`):
```tsx
<div className="bg-white dark:bg-[oklch(0.205_0_0)] rounded-lg border
  dark:border-white/[0.08]">
```

**Color normalization:** All `green-*` classes changed to `emerald-*` for consistency with the design system.

## Why This Works

1. **CSS-level vs inline dark mode:** The `.admin-card` class handles the most common pattern (white card containers) at the CSS level, reducing per-component dark mode code. This covers ~60% of dark mode needs automatically.

2. **oklch color space:** Using `oklch(lightness chroma hue)` provides perceptually uniform colors. Dark backgrounds use lightness 0.18-0.24, and white-based overlays use `oklch(1 0 0 / X%)` for consistent transparency.

3. **Badge pattern consistency:** The `dark:bg-{color}-900/30 dark:text-{color}-400` pattern works because:
   - `900/30` (30% opacity of the darkest shade) provides subtle background tint
   - `400` text shade has sufficient contrast on dark backgrounds (WCAG AA)
   - The `/30` opacity prevents badges from being too saturated in dark mode

4. **Input isolation:** Form inputs use `oklch(0.18 0 0)` (slightly darker than card backgrounds at 0.205) to create visual depth, with `white/[0.12]` borders for subtle definition.

5. **Scope limitation:** Fixes are scoped to `.admin-content` via globals.css, preventing dark mode styles from leaking into the public-facing pages.

## Prevention

### Design System Patterns (copy-paste reference)

| Element | Dark Mode Pattern |
|---------|-------------------|
| Card container | Use `.admin-card` class (never raw `bg-white rounded-lg border`) |
| Badge (colored) | `dark:bg-{color}-900/30 dark:text-{color}-400` |
| Badge (with border) | Add `dark:border-{color}-800/40` |
| Select/input | `dark:bg-[oklch(0.18_0_0)] dark:border-white/[0.12] dark:text-gray-100` |
| Placeholder text | `dark:placeholder:text-gray-500` |
| Button (reset/secondary) | `dark:border-white/[0.12] dark:text-gray-400 dark:hover:bg-white/[0.06]` |
| Toggle active | `dark:bg-white/[0.15] dark:border-white/[0.15]` |
| Toggle inactive | `dark:bg-white/[0.04] dark:border-white/[0.1] dark:text-gray-400` |
| Tooltip | `dark:bg-[oklch(0.24_0_0)] dark:border-white/[0.1]` |
| Selected row/item | `dark:bg-blue-900/30 dark:text-blue-300` |
| Hover state | `dark:hover:bg-white/[0.06]` |
| Section header bg | `dark:bg-white/[0.03]` |
| Sticky column bg | `dark:bg-[oklch(0.205_0_0)]` |

### Process Recommendations

- Run a dark mode audit after adding any new admin page or component. Toggle dark mode and visually check every element.
- New components should use `.admin-card` for containers instead of raw `bg-white` classes.
- When adding colored badges, always include both light and dark variants in the same string.
- Test form inputs in dark mode specifically — browser-rendered `<select>` elements need explicit dark backgrounds.
- Add dark mode to the build verification checklist: `Toggle dark mode > Check all pages > Verify badges, inputs, cards, tooltips`.

## Files Modified (18 total)

| File | Changes |
|------|---------|
| `src/components/command-palette.tsx` | Dialog, input, results, kbd hints, trigger button |
| `src/components/peer-filters-bar.tsx` | 4 selects, reset button |
| `src/components/catalog-filters.tsx` | Toggle, search, 2 selects, columns toggle |
| `src/components/fee-histogram.tsx` | Container to admin-card, tooltip, header |
| `src/components/breakdown-chart.tsx` | Container to admin-card, tooltip, header |
| `src/components/collapsible-section.tsx` | Body panel dark bg and border |
| `src/app/admin/review/page.tsx` | STATUS_COLORS, confidence badge, flag badges |
| `src/app/admin/review/[id]/page.tsx` | STATUS_COLORS, SEVERITY_COLORS, 3 containers |
| `src/app/admin/review/review-actions.tsx` | BulkApprove green to emerald + dark |
| `src/app/admin/review/fee-search.tsx` | Fee type chips, search input, button |
| `src/app/admin/review/category-select.tsx` | Select states (pending, has-category, no-category) |
| `src/app/admin/fees/page.tsx` | STATUS_COLORS, confidence badge, search, container |
| `src/app/admin/fees/catalog/[category]/page.tsx` | 4 containers, stat cards, charter bars, badges |
| `src/app/admin/fees/catalog/[category]/institution-table.tsx` | Container, sticky cols, amount colors, badges |
| `src/app/admin/institution-table.tsx` | Container, search, filter buttons, badges |
| `src/app/admin/peers/[id]/page.tsx` | 7 containers, charter/highlight/rank badges |
| `src/app/admin/peers/explore/page.tsx` | Container, charter badge |
| `src/app/admin/index/peer-index-filters.tsx` | 3 selects, reset button |

## Related Issues

- Related to the existing dark mode infrastructure in `src/app/globals.css` (shadow depth system, admin-card class, scoped overrides)
- `src/components/dark-mode-toggle.tsx` provides the toggle mechanism (localStorage key: `bfi-theme`)
- See also: `nanmo-ago-fed-content-dates-FeeScheduleHub-20260216.md` for another UI bug fix in this codebase
