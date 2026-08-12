# Unified Pro Branding

## Problem

There are 4 different layouts with 4 different nav bars, and "Fee Insight" still appears in 9+ files. A paid customer clicking through the site sees different headers, fonts, and colors on different pages. This is unprofessional for a $500/mo product.

## Current Layouts

| Layout | Path | Header | Theme | Issues |
|--------|------|--------|-------|--------|
| `(public)/layout.tsx` | `/fees`, `/research/*`, `/guides` | "Fee Insight" + nav + chat widget | Cream | Says "Fee Insight", links to /admin/login |
| `pro/layout.tsx` | `/pro/*` | "Bank Fee Index" + nav | Cream | Footer says "Fee Insight Research" |
| `consumer/layout.tsx` | `/consumer` | "Fee Insight" + nav | Cream | Says "Fee Insight" everywhere |
| Root layout | `/account`, `/subscribe`, `/login`, `/register` | Inline headers per page | Cream | Each page has its own mini header |

**The fix:** One shared customer nav component used by all customer-facing pages.

## Proposed Solution

### 1. Create Shared Customer Header Component

```
src/components/customer-nav.tsx
```

Used by: `(public)/layout.tsx`, `pro/layout.tsx`, `consumer/layout.tsx`, and standalone pages (`/account`, `/subscribe`, `/login`, `/register`)

```tsx
// Consistent across all customer pages:
// Logo (bar chart + "Bank Fee Index" in Newsreader)
// Nav: Fee Benchmarks | Research | Guides | Pricing
// Right: Account (if logged in) | Sign in (if not)
```

### 2. Fix All "Fee Insight" References

| File | Line(s) | Change |
|------|---------|--------|
| `(public)/layout.tsx` | 43, 93 | "Fee Insight" → "Bank Fee Index" |
| `(public)/layout.tsx` | 66 | `/admin/login` → `/login` |
| `(public)/fees/page.tsx` | 476 | JSON-LD "Fee Insight" → "Bank Fee Index" |
| `(public)/api-docs/page.tsx` | 6 | metadata "Fee Insight" → "Bank Fee Index" |
| `consumer/layout.tsx` | 6, 49, 86 | "Fee Insight" → "Bank Fee Index" |
| `gateway-client.tsx` | 56, 60 | "Fee Insight" → "Bank Fee Index", `/admin/login` → `/login` |
| `page.tsx` | 5-7 | metadata "Fee Insight" → "Bank Fee Index" |
| `pro/layout.tsx` | 77 | footer "Fee Insight Research" → "Bank Fee Index" |
| `submit-fees/page.tsx` | 4, 5 | "Fee Insight" → "Bank Fee Index" |
| `waitlist/page.tsx` | 7 | "Fee Insight" → "Bank Fee Index" |

### 3. Redesign `/pro/page.tsx`

Currently a dark-themed page with blue accents and JetBrains mono font. Needs complete rewrite to match cream/terra cotta brand. This is the landing page for the professional product.

### 4. Fix Research Chat Component Theming

`src/app/admin/research/[agentId]/research-chat.tsx` uses dark/gray theme. When embedded in `/pro/research`, it clashes with the cream background. Options:

- **A.** Accept the dark chat as a "tool" inside the cream page (like an embedded terminal)
- **B.** Re-theme the chat to cream/terra cotta

**Recommendation:** Option A -- the dark chat actually looks professional as a contained tool. Just ensure the wrapper has clean borders.

### 5. Unify Standalone Page Headers

Pages outside route groups (`/account`, `/subscribe`, `/login`, `/register`) each have inline headers. Replace with the shared `<CustomerNav />` component.

## Acceptance Criteria

- [ ] Single `<CustomerNav />` component used on all customer pages
- [ ] Zero "Fee Insight" references in customer-facing code
- [ ] Zero `/admin/login` links from customer pages
- [ ] `/pro/page.tsx` redesigned with cream/terra cotta brand
- [ ] Consistent nav across: fees, research, guides, pro, account, subscribe, login, register
- [ ] Footer consistent across all layouts

## Files to Create

- `src/components/customer-nav.tsx` -- shared nav component
- `src/components/customer-footer.tsx` -- shared footer component

## Files to Modify

- `src/app/(public)/layout.tsx` -- use CustomerNav, fix brand
- `src/app/pro/layout.tsx` -- use CustomerNav, fix footer
- `src/app/consumer/layout.tsx` -- use CustomerNav, fix brand
- `src/app/account/page.tsx` -- use CustomerNav instead of inline header
- `src/app/account/welcome/page.tsx` -- use CustomerNav
- `src/app/subscribe/page.tsx` -- use CustomerNav
- `src/app/(auth)/login/page.tsx` -- use CustomerNav
- `src/app/(auth)/register/page.tsx` -- use CustomerNav
- `src/app/pro/page.tsx` -- complete redesign
- `src/app/page.tsx` -- fix metadata
- `src/app/gateway-client.tsx` -- fix brand, links
- `src/app/(public)/fees/page.tsx` -- fix JSON-LD
- `src/app/(public)/api-docs/page.tsx` -- fix metadata
- `src/app/submit-fees/page.tsx` -- fix brand
- `src/app/waitlist/page.tsx` -- fix brand

## What NOT to Build

- Don't touch admin pages (your internal tool, different design system)
- Don't re-theme the research chat component (dark is fine as embedded tool)
- Don't add mobile hamburger menu yet (not needed for B2B desktop users)

## References

- Brand colors: cream #FAF7F2, terra cotta #C44B2E, text #1A1815, muted #7A7062
- Brand font: Newsreader serif for headings
- Brand icon: bar chart SVG (3 ascending bars)
- Account page header (good example): `src/app/account/page.tsx`
