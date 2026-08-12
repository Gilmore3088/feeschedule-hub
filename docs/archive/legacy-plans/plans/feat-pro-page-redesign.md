# Pro Page Redesign + Daily Priorities

## Today's Priorities (from yesterday's summary)

1. **Pro page redesign** -- fix font/contrast, match brand
2. **Stripe webhook testing** -- verify end-to-end checkout
3. **Gateway page update** -- professional CTA = lead capture

---

## Problem: `/pro/page.tsx` (681 lines)

The pro landing page is a dark-themed Bloomberg-terminal style page with:
- Black background (`#060810`) inside a cream layout (`#FAF7F2`)
- Blue accents (`blue-400`, `blue-500`) instead of terra cotta (`#C44B2E`)
- Monospace/system fonts instead of Newsreader serif for headings
- Slate text colors that don't match the warm cream brand

The content is good -- live ticker, national index table, charter comparison, revenue data, coverage map. It just needs reskinning to match the brand.

## Proposed Redesign

### Keep the content, change the skin:

**Background**: Cream `#FAF7F2` (matches layout, no jarring contrast)
**Accent**: Terra cotta `#C44B2E` (replaces all blue)
**Headings**: Newsreader serif (replaces system/monospace)
**Text**: `#1A1815` primary, `#7A7062` muted, `#A69D90` labels
**Cards**: `#FFFDF9` with `#E8DFD1` borders (matches account page pattern)
**Data values**: `tabular-nums` in `#1A1815`

### Section by section:

| Section | Current | Redesign |
|---------|---------|----------|
| Ticker strip | Dark bg, blue label, slate values | Cream card, terra cotta label, dark values |
| Hero stats | Dark bg, white numbers | Cream bg, dark numbers, Newsreader heading |
| National index table | Dark table, blue hovers | Cream table, terra cotta hovers |
| Charter comparison | Dark grid, blue bars | Cream grid, terra cotta bars |
| Revenue by tier | Dark table | Cream table |
| Coverage map | Dark SVG | Cream SVG with terra cotta fill |
| CTA section | Blue button | Terra cotta button |

### Color mapping:

```
#060810 → #FAF7F2 (background)
#0c0f1a → #FFFDF9 (card background)
blue-400 → #C44B2E (accent)
blue-500 → #A83D25 (accent hover)
blue-500/10 → #FFF0ED (accent background)
blue-500/30 → #E0C9B8 (accent border)
slate-200 → #1A1815 (primary text)
slate-400 → #5A5347 (secondary text)
slate-500 → #7A7062 (muted text)
slate-600 → #A69D90 (label text)
slate-700 → #D5CBBF (border)
white/[0.04] → #E8DFD1 (divider)
white/[0.06] → #E8DFD1 (card border)
white/[0.08] → #D5CBBF (separator)
```

### Font mapping:

```
font-jetbrains/monospace headings → Newsreader serif
system-ui body → keep (matches rest of site)
```

## Approach

The page is 681 lines. Rather than rewrite from scratch, do a systematic find-and-replace of colors and fonts. This preserves all the data logic and layout while reskinning.

## Files to modify

- `src/app/pro/page.tsx` -- the entire 681-line page (reskin)

## Acceptance Criteria

- [ ] No dark backgrounds (#060810, #0c0f1a) in pro page
- [ ] No blue accents (blue-400, blue-500, blue-300) in pro page
- [ ] No monospace/JetBrains font references for headings
- [ ] All headings use Newsreader serif
- [ ] All card backgrounds use #FFFDF9 with #E8DFD1 borders
- [ ] Ticker strip matches cream brand
- [ ] Data tables match cream brand
- [ ] Page passes visual check against /account and /fees for consistency

## References

- Brand colors: cream #FAF7F2, terra cotta #C44B2E, text #1A1815
- Account page (good reference): `src/app/account/page.tsx`
- Fee catalog (good reference): `src/app/(public)/fees/page.tsx`
- Subscribe page (good reference): `src/app/subscribe/page.tsx`
