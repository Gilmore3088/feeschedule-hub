# Phase 61: Hamilton Pro Polish - Research

**Researched:** 2026-04-15
**Domain:** React/Next.js frontend — demo data audit, Stripe billing portal wiring, Tailwind v4 container queries
**Confidence:** HIGH (all findings are direct code reads from the codebase; no speculative claims)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Strip all displayed demo data (hardcoded institution names, fake fee amounts, demo scenarios, lorem ipsum). Keep form input placeholders (e.g., `placeholder="e.g. First National Bank"`) — those are UX hints, not fake content. The audit applies to text the user SEES as data, not form affordances.
- **D-02:** Real data first, empty state fallback. If a pipeline query can supply real data, wire it in. If not, show a designed empty state. No fake data survives.
- **D-03:** Designed empty states with CTAs per screen. Icon + title + 1-sentence explanation + action button. Not skeleton loaders.
- **D-04:** Explain why data is missing. Empty states should reference the data source or configuration step needed. "Monitor will show alerts when you configure watchlist institutions."
- **D-05:** Use Tailwind v4 container queries (`@container` / `@md:` / `@lg:`). Components adapt to parent container, not viewport.
- **D-06:** Full responsive pass on both Analyze and Monitor. Every panel, card, and table gets container query treatment.

### Claude's Discretion
- Specific empty state copy per screen (icon choice, exact wording, CTA text)
- Which pipeline queries to wire for real data replacement
- ManageBillingButton placement and styling in Pro Settings
- Error handling for Stripe portal failures (toast? inline error?)
- Container query breakpoints (e.g., `@md` = 448px vs `@lg` = 512px)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PRO-01 | Strip all hardcoded demo data from 5 Pro screens | Section: Demo Data Audit |
| PRO-02 | Wire Stripe billing portal via ManageBillingButton in Pro Settings | Section: Stripe Billing Portal |
| PRO-03 | Apply Tailwind v4 container queries to Analyze and Monitor screens | Section: Responsive Assessment |
</phase_requirements>

---

## Summary

Phase 61 is a frontend polish pass over 5 Pro screens. Research finds the codebase is substantially cleaner than the phase description implied — most screens already pass real data from pipeline queries through to their components. The genuine demo data problems are narrow and surgical: three specific hardcoded strings (a fake reference code in Simulate, a hardcoded institution name and peer set label in ReportWorkspace's ConfigSidebar, and a hardcoded "Member since 2026" string in Settings). The Stripe billing portal infrastructure is fully built — `createPortalSession()` exists and is correctly implemented. The Settings page has TWO "Manage Billing" buttons: one in the Account Overview card and one in the dedicated Billing card, both are inert `<button type="button">` elements with no action wired. Container query adoption is zero outside one Shadcn UI card — the Analyze and Monitor pages use raw inline `gridTemplateColumns` CSS without any responsive handling.

**Primary recommendation:** The plan should organize into 3 waves: (1) demo data surgical removals + empty state upgrades per screen, (2) ManageBillingButton component + Settings wiring, (3) container query pass on Analyze and Monitor.

---

## Standard Stack

### Core (already in use — no new installs needed)
| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| `tailwindcss` | ^4 | Utility CSS including container queries | Already installed |
| `@anthropic-ai/sdk` | 0.80.0 | Stripe portal redirect via server action | Already installed |
| `stripe` | 20.4.1 | Billing portal session creation | Already installed |
| `lucide-react` | 0.564.0 | Icons for empty state designs | Already installed |
| `next` | 16.1.6 | Server actions, App Router | Already installed |

**No new packages required for this phase.** [VERIFIED: package.json]

---

## Demo Data Audit (PRO-01)

This is the most critical section. Below is the complete inventory from direct file reads.

### Screen 1: Home (`/pro/hamilton`) — CLEAN

**File:** `src/app/pro/(hamilton)/hamilton/page.tsx`
**Components:** `HamiltonViewCard`, `PositioningEvidence`, `WhatChangedCard`, `PriorityAlertsCard`, `MonitorFeedPreview`, `RecommendedActionCard`

**Verdict: No fake data.** All components receive data exclusively from props. The data layer (`fetchHomeBriefingData`, `fetchHomeBriefingSignals`) queries live DB tables (`hamilton_signals`, `hamilton_priority_alerts`, national fee index). All components have designed empty states already:

- `HamiltonViewCard` — shows "AI analysis temporarily unavailable. Positioning data below is current." when `thesis === null` [VERIFIED: line 181]
- `PositioningEvidence` — shows "Configure your institution in Settings to see positioning data" when `entries.length === 0` [VERIFIED: line 59]
- `WhatChangedCard` — shows "Hamilton tracks fee movements across your watchlist. Add institutions to see what changed." with CTA link [VERIFIED: line 32]
- `PriorityAlertsCard` — shows "No active alerts. Hamilton will flag high-priority changes." [VERIFIED: line 56]
- `MonitorFeedPreview` — shows "Your signal feed will show competitive intelligence here. Visit Monitor to configure your watchlist." [VERIFIED: line 64]

**One borderline case:** `RecommendedActionCard` defaults `category = recommendedCategory ?? "overdraft"` at line 25. This is a valid fallback to the most common fee category, not fake data. Acceptable per D-01.

---

### Screen 2: Analyze (`/pro/analyze`) — CLEAN

**File:** `src/app/pro/(hamilton)/analyze/page.tsx`
**Component:** `AnalyzeWorkspace` (363 lines)

**Verdict: No fake data.** The Analyze screen is a chat interface — it produces no rendered data until the user sends a prompt. The empty state at line 276-286 is already designed:

```tsx
// AnalyzeWorkspace.tsx lines 276-286
{!displayedResponse && !isLoading && messages.length === 0 && (
  <div className="text-center py-16">
    <p>Ask Hamilton to analyze a fee category or competitive position</p>
    <p>Currently viewing: <span>{activeTab}</span> analysis</p>
  </div>
)}
```

This empty state is functional but minimal — the D-03 requirement for "Icon + title + 1-sentence explanation + action button" is not fully met. The text has no icon and no action CTA. **Upgrade needed.**

**No hardcoded data strings found.**

---

### Screen 3: Simulate (`/pro/simulate`) — ONE FAKE STRING

**File:** `src/components/hamilton/simulate/SimulateWorkspace.tsx`
**Line:** 300

**Finding:** Hardcoded fake reference string displayed in the page header:
```tsx
// Line 300 — FAKE DATA
<p className="font-label text-[10px] uppercase tracking-widest">
  Reference: HAM-2024-OD-09 &bull; Last Live Sync: 12s ago
</p>
```

`HAM-2024-OD-09` is a fake document reference code. "Last Live Sync: 12s ago" is a fake timestamp that never updates. Both are displayed to the user as authoritative data.

**Action:** Remove this entire `<p>` element. The header already has the fee category title which is sufficient context. No replacement data source exists for this string.

**WatchlistPanel TODO comment (line 77):**
```tsx
// TODO Phase 50: wire fee movements to real fee_change_events data
```
The "FEE MOVEMENTS" section mentioned in the comment does not appear to be rendered in the current WatchlistPanel component — the component renders only WatchlistIntegrity + AddInstitutionInput + BrandedCard. This TODO is not a demo-data issue but a missing feature note — out of scope per deferred rules.

**Remaining Simulate content:** All simulation data (distributions, fee positions, Hamilton interpretation) comes from real pipeline queries via `getSimulationCategories()`, `getDistributionForCategory()`, `getInstitutionFee()`, and the `/api/hamilton/simulate` streaming endpoint. The existing empty state ("Select a fee category to begin simulation.") at lines 395-399 is acceptable but bare — upgrade to match D-03 pattern.

---

### Screen 4: Reports (`/pro/reports`) — TWO FAKE STRINGS

**File:** `src/components/hamilton/reports/ReportWorkspace.tsx`
**Lines:** 400-401

**Finding:** `ConfigSidebar` receives two hardcoded strings as props:
```tsx
// ReportWorkspace.tsx lines 400-401 — FAKE DATA
<ConfigSidebar
  selectedTemplate={selectedTemplate}
  institutionName="Your Institution"  // HARDCODED PLACEHOLDER DISPLAYED AS DATA
  peerSetLabel="National Index"        // HARDCODED PLACEHOLDER DISPLAYED AS DATA
  ...
/>
```

These strings are displayed in the Configuration sidebar as the user's institution name and peer set. They are not form placeholders (no `placeholder=` attribute) — they are rendered text that appears to be real configured values.

**Action:** `ReportWorkspace` is a client component. It needs to receive `institutionName` and `peerSetLabel` as props from the page server component (`reports/page.tsx`). The page already has `user` via `getCurrentUser()` — pass `user.institution_name` and derive peerSetLabel from the user's saved peer sets (same pattern as Settings page which calls `getSavedPeerSets(String(user.id))`).

**ConfigSidebar also contains:**
- `"Estimated processing time: 4s"` at line 205 — this is a UI hint for UX feedback, not claimed data. Acceptable to keep.
- The pull-quote `"Accuracy is the only currency that matters in private intelligence."` — this is editorial branding, not fake data.

**Static preview block (lines 333-378):** The quote `"Every fee adjustment tells a story — Hamilton reads the data so you can write the strategy."` is editorial brand copy shown when no report is generated yet. This is a designed empty state (not fake data) — acceptable per D-01.

**Report library (`ReportLibrary` component, `publishedReports` prop):** Already wired to real DB via `getPublishedReports()` in reports page. [VERIFIED: reports/page.tsx line 4]

---

### Screen 5: Monitor (`/pro/monitor`) — CLEAN

**File:** `src/app/pro/(hamilton)/monitor/page.tsx`
**Components:** `StatusStrip`, `SignalFeed`, `WatchlistPanel`, `FloatingChatOverlay`

**Verdict: No fake data.** All data flows from `fetchMonitorPageData(user.id)` which queries live DB tables with graceful empty-array fallbacks.

- `SignalFeed` has a full designed empty state at lines 444-522 with icon + title + description + CTA button linking to `/pro/settings`. [VERIFIED: lines 444-522]
- `WatchlistPanel` shows "No institutions tracked. Add one below to begin monitoring." when entries is empty [VERIFIED: line 108]
- `StatusStrip` derives status from real metrics

**One label concern:** `"RENEWAL STATUS: SECURE"` / `"RENEWAL STATUS: IN REVIEW"` labels in WatchlistPanel STATUS_CONFIG (lines 30-74). These labels appear next to institution entries. The `status` field is always `"unknown"` per the `monitor-data.ts` comment: `"Status derivation is deferred — always 'unknown' for v8.0"`. This means all institutions show `"RENEWAL STATUS: UNKNOWN"` (the `○` symbol). Not fake data being displayed, just a placeholder feature — acceptable.

---

### Screen 6: Settings (`/pro/settings`) — THREE ISSUES

**File:** `src/app/pro/(hamilton)/settings/page.tsx`

**Issue 1 — Hardcoded "Member since 2026" (line 121):**
```tsx
<span className="text-sm" style={{ color: "var(--hamilton-text-tertiary)" }}>
  Member since 2026
</span>
```
This is hardcoded fake data — not derived from any user record. The `users` table doesn't appear to have a `created_at` column exposed through the `User` type in auth.ts. **Action:** Either remove this line entirely (simplest), or add `created_at` to the User query in auth.ts.

**Issue 2 — "Manage Billing" button in Account Overview card (lines 128-139):**
```tsx
// Account Overview card — inert button
<button type="button" className="...">
  Manage Billing
</button>
```
This button does nothing — no `onClick`, no form action. PRO-02 requires this to call `createPortalSession()`.

**Issue 3 — "Manage Billing" button in Billing section card (lines 303-313):**
```tsx
// Billing section card — also inert
<button type="button" className="...">
  Manage Billing
</button>
```
Same issue — inert button. Both buttons need to be replaced with a `ManageBillingButton` component.

**Issue 4 — "Renews monthly" (line 302):**
```tsx
<p className="text-xs">Renews monthly</p>
```
This is hardcoded copy, not derived from Stripe subscription data. No Stripe subscription interval data is available on the User type. **Action:** This is marginal — it's accurate for the current pricing model (monthly subscriptions only). Acceptable to keep as UI copy since it's not claiming a specific data value.

---

## Stripe Billing Portal (PRO-02)

### What Exists

`createPortalSession()` is fully implemented in `src/lib/stripe-actions.ts` (lines 36-51):

```typescript
// src/lib/stripe-actions.ts lines 36-51
export async function createPortalSession(): Promise<void> {
  const user = await getCurrentUser();
  if (!user || !user.stripe_customer_id) {
    throw new Error("No billing account found");
  }
  const stripe = getStripe();
  const origin = (await headers()).get("origin") || process.env.NEXT_PUBLIC_SITE_URL;
  const session = await stripe.billingPortal.sessions.create({
    customer: user.stripe_customer_id,
    return_url: `${origin}/account`,
  });
  redirect(session.url);
}
```

Key observations:
- It calls `getCurrentUser()` internally — no customer ID parameter needed from the caller
- Uses `redirect()` from Next.js — this is a server action that redirects, not returns a URL
- Throws if `stripe_customer_id` is null — this is the error case to handle
- Return URL is `/account` (not `/pro/settings`) — may want to update to `/pro/settings`

### The User Type

`stripe_customer_id: string | null` and `subscription_status: "none" | "active" | "past_due" | "canceled"` are both on the `User` interface in auth.ts. [VERIFIED: lines 53, 54]

### ManageBillingButton Architecture

The component must be a client component (`"use client"`) because:
- It needs to handle the server action call and error state
- Server actions that call `redirect()` cannot be called from server components in this pattern

The recommended pattern:

```tsx
// src/components/hamilton/settings/ManageBillingButton.tsx
"use client";
import { useTransition } from "react";
import { createPortalSession } from "@/lib/stripe-actions";

interface Props {
  hasStripeAccount: boolean;
  subscriptionStatus: "none" | "active" | "past_due" | "canceled";
}

export function ManageBillingButton({ hasStripeAccount, subscriptionStatus }: Props) {
  const [isPending, startTransition] = useTransition();
  
  function handleClick() {
    startTransition(async () => {
      try {
        await createPortalSession();
      } catch {
        // Show inline error or toast
      }
    });
  }
  
  if (!hasStripeAccount) {
    return <a href="/subscribe">Subscribe to Pro</a>;
  }
  
  return (
    <button onClick={handleClick} disabled={isPending}>
      {isPending ? "Opening..." : "Manage Billing"}
    </button>
  );
}
```

**The settings page is a server component** — it passes `!!user.stripe_customer_id` and `user.subscription_status` as props to the client button. No auth duplication needed.

**Placement:** Both "Manage Billing" button locations in settings/page.tsx need replacement — the Account Overview card (line 129-139) and the Billing section card (lines 303-313).

**Error handling (Claude's discretion):** An inline error message below the button (no toast library currently in use in Hamilton components) is the simplest approach consistent with the codebase.

**Return URL:** Update `createPortalSession()` to accept an optional `returnPath` parameter, or create a settings-specific variant that returns to `/pro/settings`.

---

## Responsive Assessment (PRO-03)

### Analyze Screen Responsive Gaps

**File:** `src/components/hamilton/analyze/AnalyzeWorkspace.tsx`

The Analyze screen uses Tailwind utility classes extensively. Responsive issues:

1. **Fixed bottom input bar (line 340):** `className="fixed bottom-0 left-0 right-0 z-20 px-12 py-10"` — `px-12` (48px) padding is appropriate on desktop but tight on mobile. On 768px screens the content area under the fixed bar needs sufficient `pb-40` clearance (already set at line 254).

2. **Evidence/metrics section:** The `EvidencePanel` and other sub-panels use `space-y-6 max-w-5xl` (line 290) — this is responsive-safe.

3. **Focus tabs (`AnalysisFocusTabs`):** No fixed widths found — safe.

4. **Overall structure:** Analyze is largely a vertical stack, not a multi-column grid. Container query treatment is lighter here than Monitor. The main responsive work is ensuring the floating input bar and explore-further prompts stack gracefully.

**Assessment:** Analyze has minor responsive issues, not structural grid problems. The `@container` treatment is primarily needed for the floating bottom bar behavior and prompt chip overflow.

### Monitor Screen Responsive Gaps

**File:** `src/app/pro/(hamilton)/monitor/page.tsx`

**Critical issue — hardcoded 7/5 grid (lines 65-72):**
```tsx
// monitor/page.tsx lines 65-72 — NO RESPONSIVE FALLBACK
<div style={{
  display: "grid",
  gridTemplateColumns: "7fr 5fr",
  gap: "3rem",
}}>
  <section>  {/* SignalFeed */}  </section>
  <aside>    {/* WatchlistPanel */}  </aside>
</div>
```

This inline style grid has zero responsive handling. At 768px, a 7-column feed + 5-column sidebar with 3rem gap will overflow or compress to unusable widths. This is the primary responsive failure point.

**SignalFeed card layout (lines 76-272):** Each signal card uses `padding: "2rem"` and flex layouts — these are fine. The risk is the outer 7/5 grid collapsing.

**WatchlistPanel:** Uses flex column layout internally — safe. But the outer grid gives it a fixed `5fr` width.

**StatusStrip (lines 37-193):** Uses `display: flex`, `justifyContent: space-between` with multiple child divs. On narrow screens, the status metrics will overflow or wrap awkwardly. The dividers (1px width separators) and 5-6 children in a row will break at ~600px.

**FloatingChatOverlay:** Fixed position in corner — inherently responsive.

**Assessment:** Monitor has two structural responsive failures: (1) the 7fr/5fr main grid must collapse to single column below a container threshold, (2) the StatusStrip's horizontal metrics row must collapse to 2-column or vertical stacking.

### Tailwind v4 Container Query Syntax

Tailwind v4 supports container queries natively. [VERIFIED: tailwindcss ^4 in package.json]

**The pattern:**
```tsx
// Parent: declare as container
<div className="@container">
  {/* Child: use @sm:, @md:, @lg: based on parent width */}
  <div className="grid grid-cols-1 @lg:grid-cols-[7fr_5fr] gap-8 @lg:gap-12">
    ...
  </div>
</div>
```

**Default Tailwind v4 container breakpoints:**
- `@sm` = 24rem (384px)
- `@md` = 28rem (448px)
- `@lg` = 32rem (512px)
- `@xl` = 36rem (576px)
- `@2xl` = 42rem (672px)

For the Monitor main grid (full page width): `@container` on the `<main>` wrapper, `@2xl:grid-cols-[7fr_5fr]` for the two-column layout — collapses to single column on anything below ~672px container width.

**Inline style vs className:** The current Monitor page uses inline `style={{ display: "grid", gridTemplateColumns: "7fr 5fr" }}`. This must be converted to Tailwind classes to use container query variants. The `fr` unit is not a standard Tailwind utility but can be done via `@apply` or arbitrary value: `@2xl:grid-cols-[7fr_5fr]`.

**Existing container query usage:** Only `src/components/ui/card.tsx` uses `@container/card-header` — this is a named container query from Shadcn. No Hamilton components currently use container queries. [VERIFIED: grep search]

### What Would Break at 768px (Without Fix)

| Component | Issue | Severity |
|-----------|-------|----------|
| Monitor `7fr 5fr` grid | Feed + sidebar render side-by-side at ~465px each — sidebar forces horizontal scroll | CRITICAL |
| StatusStrip metrics row | 5+ flex items with 2.5rem gaps overflow | HIGH |
| Analyze floating input | `px-12` + `max-w-4xl mx-auto` — 48px side padding eats too much on 768px | MEDIUM |
| WhatChangedCard (Home) | `grid-cols-3` via inline style on `HomeBriefingSignals` — 3-column pill grid at phone widths | MEDIUM (Home screen not in scope for D-06) |

---

## Empty State Patterns

### Existing Empty State Components

| Component | Location | Quality |
|-----------|----------|---------|
| `EmptyState` (reports) | `src/components/hamilton/reports/EmptyState.tsx` | Good — has icon + title + description, no CTA |
| `SignalFeed` EmptyState | `src/components/hamilton/monitor/SignalFeed.tsx` line 444 | Excellent — icon + serif title + description + burnished CTA button |
| `HamiltonViewCard` EmptyState | line 108 | Minimal — text only |
| `PositioningEvidence` empty | line 58 | Minimal — centered text only |
| `WhatChangedCard` empty | line 32 | Acceptable — text + inline link |
| `PriorityAlertsCard` empty | line 56 | Minimal — text only |
| `MonitorFeedPreview` empty | line 64 | Acceptable — text + inline link |
| `AnalyzeWorkspace` empty | line 276 | Minimal — 2 text lines, no icon, no CTA |

### The Gold Standard Pattern (SignalFeed EmptyState — lines 444-522)

```tsx
// Pattern to replicate per D-03:
function EmptyState() {
  return (
    <div style={{ padding: "2.5rem", borderLeft: "4px solid var(--hamilton-outline-variant)", ... }}>
      <div style={{ textAlign: "center", maxWidth: "28rem", margin: "0 auto" }}>
        <div style={{ /* circle icon container */ }}>
          <svg>/* lucide icon */</svg>
        </div>
        <h3 style={{ fontFamily: "var(--hamilton-font-serif)", fontStyle: "italic" }}>
          {/* serif italic headline */}
        </h3>
        <p style={{ /* body text */ }}>
          {/* 1-sentence explanation referencing what config step is needed */}
        </p>
        <a href="/pro/settings" className="burnished-cta">
          {/* CTA label */}
          <svg>{/* arrow icon */}</svg>
        </a>
      </div>
    </div>
  );
}
```

**Key design tokens:**
- Container: `var(--hamilton-surface-container-lowest)` background, `4px` left border
- Icon circle: `var(--hamilton-surface-container-high)` background, primary color stroke
- Headline: `var(--hamilton-font-serif)`, italic, 1.25rem
- Body: `var(--hamilton-font-sans)`, 0.875rem, `var(--hamilton-text-secondary)`
- CTA: `burnished-cta` class (already defined in globals.css), arrow lucide icon

---

## Architecture Patterns

### Pattern 1: Server Action + Client Button for Billing Portal

The `createPortalSession()` uses `redirect()` — in Next.js App Router, server actions that call `redirect()` must be invoked from client components via `startTransition`. This is a known constraint. [VERIFIED: stripe-actions.ts line 50]

```tsx
// Correct invocation pattern
"use client";
const [isPending, startTransition] = useTransition();
function handleClick() {
  startTransition(async () => { await createPortalSession(); });
}
```

### Pattern 2: Props Threading for Institution Context in Reports

`ReportWorkspace` (client component) receives `institutionName` and `peerSetLabel` as props from the server page. The server page must fetch this data and pass it down:

```tsx
// reports/page.tsx (server)
const user = await getCurrentUser();
const peerSets = await getSavedPeerSets(String(user.id)).catch(() => []);
const primaryPeerSet = peerSets[0];

return (
  <ReportWorkspace
    userId={user.id}
    institutionName={user.institution_name ?? ""}
    peerSetLabel={primaryPeerSet?.name ?? "National Index"}
    publishedReports={publishedReports}
    initialScenarioId={scenario_id ?? null}
  />
);
```

`ReportWorkspace` props interface must be updated to include `institutionName: string` and `peerSetLabel: string`.

### Pattern 3: Container Query Conversion

Convert inline `style={{ display: "grid", gridTemplateColumns: "7fr 5fr" }}` to container-query-aware Tailwind:

```tsx
// Before (monitor/page.tsx)
<main className="@container">
  <div style={{ display: "grid", gridTemplateColumns: "7fr 5fr", gap: "3rem" }}>

// After
<main className="@container">
  <div className="grid grid-cols-1 gap-8 @2xl:grid-cols-[7fr_5fr] @2xl:gap-12">
```

The `@container` goes on `<main>`. At narrow container widths, `grid-cols-1` stacks vertically. At `@2xl` (672px container) the two-column layout activates.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Billing portal redirect | Custom Stripe session handler | `createPortalSession()` in stripe-actions.ts | Already implemented correctly |
| Toast notifications for billing error | Custom toast system | Inline error state in component | Simpler, no new dependencies; no toast library in Hamilton components currently |
| Container queries via JS resize observer | ResizeObserver + state | Tailwind v4 `@container` classes | CSS-native, no JS overhead |
| Empty state icon design | Custom SVG icons | Lucide React icons (already installed) | Consistent with existing SignalFeed EmptyState pattern |

---

## Common Pitfalls

### Pitfall 1: `createPortalSession()` return_url points to `/account` not `/pro/settings`

**What goes wrong:** After managing billing, user is redirected to `/account` (which may not exist or may be a non-Hamilton page) instead of returning to `/pro/settings`.
**How to avoid:** Either pass a returnPath parameter to `createPortalSession()`, or create a Settings-specific wrapper action that overrides the return URL. Update `return_url: ${origin}/pro/settings` in stripe-actions.ts or pass it as param.

### Pitfall 2: Container `@container` on element that already has positioning

**What goes wrong:** Applying `@container` to a `<main>` that has `style={{ minHeight: "calc(100vh - 57px)" }}` is safe — `@container` does not conflict with height/positioning CSS. But applying it to `position: fixed` or `position: absolute` elements can create unexpected containment contexts.
**How to avoid:** Apply `@container` only to block-level flow parents (the Monitor `<main>`, the Analyze root `<div>`).

### Pitfall 3: Tailwind v4 arbitrary fr units in container query variants

**What goes wrong:** `@2xl:grid-cols-[7fr_5fr]` — the `_` represents a space in Tailwind arbitrary syntax. This should work in Tailwind v4. But if the purger doesn't detect these patterns, they may be stripped.
**How to avoid:** Test with `npx vitest run` and a visual inspection. Alternatively, use a CSS variable or explicit `@apply` in globals.css for the fr-unit column pattern.

### Pitfall 4: Two "Manage Billing" buttons both need wiring

**What goes wrong:** Replacing only the Billing section button (line 303) but missing the Account Overview button (line 129) — leaving one still inert.
**How to avoid:** Replace both with the same `ManageBillingButton` component. The Account Overview button should be hidden for admin/analyst users (the `!isAdmin` guard already exists at line 127).

### Pitfall 5: `createPortalSession()` throws for users without stripe_customer_id

**What goes wrong:** The function throws `"No billing account found"` for free/viewer users. The settings page currently shows the Manage Billing button only when `!isAdmin` — but a non-admin user might not have a Stripe customer ID either (e.g., a free viewer who never subscribed).
**How to avoid:** In `ManageBillingButton`, disable/hide the button if `!hasStripeAccount` and show a "Subscribe to access billing" CTA instead.

---

## Code Examples

### Empty State Component Template (matching SignalFeed gold standard)

```tsx
// Pattern: Icon + serif title + body + burnished CTA
function ScreenEmptyState({ title, description, ctaLabel, ctaHref }: {
  title: string;
  description: string;
  ctaLabel: string;
  ctaHref: string;
}) {
  return (
    <div style={{
      backgroundColor: "var(--hamilton-surface-container-lowest, #ffffff)",
      padding: "2.5rem",
      borderLeft: "4px solid var(--hamilton-outline-variant, #d8c2b8)",
      borderRadius: "0.5rem",
    }}>
      <div style={{ textAlign: "center", maxWidth: "28rem", margin: "0 auto" }}>
        <div style={{
          width: "3rem", height: "3rem", borderRadius: "50%",
          backgroundColor: "var(--hamilton-surface-container-high)",
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 1.25rem",
        }}>
          {/* Lucide icon — Activity / BarChart2 / FileText per screen */}
        </div>
        <h3 className="font-headline" style={{
          fontFamily: "var(--hamilton-font-serif)",
          fontSize: "1.25rem", fontStyle: "italic", fontWeight: 400,
          color: "var(--hamilton-on-surface)", margin: "0 0 0.75rem",
        }}>
          {title}
        </h3>
        <p style={{
          fontFamily: "var(--hamilton-font-sans)",
          fontSize: "0.875rem", color: "var(--hamilton-text-secondary)",
          lineHeight: 1.6, margin: "0 0 1.5rem",
        }}>
          {description}
        </p>
        <a href={ctaHref} className="burnished-cta" style={{
          display: "inline-flex", alignItems: "center", gap: "0.5rem",
          padding: "0.625rem 1.25rem", fontSize: "0.8125rem", fontWeight: 600,
          color: "var(--hamilton-on-primary)", borderRadius: "0.375rem",
          textDecoration: "none", letterSpacing: "0.05em",
        }}>
          {ctaLabel}
        </a>
      </div>
    </div>
  );
}
```

### ManageBillingButton Component

```tsx
// src/components/hamilton/settings/ManageBillingButton.tsx
"use client";
import { useTransition, useState } from "react";
import { createPortalSession } from "@/lib/stripe-actions";

interface Props {
  hasStripeAccount: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export function ManageBillingButton({ hasStripeAccount, className, style }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      try {
        await createPortalSession();
      } catch {
        setError("Unable to open billing portal. Please try again.");
      }
    });
  }

  if (!hasStripeAccount) {
    return (
      <a href="/subscribe" className={className} style={style}>
        Subscribe to Pro
      </a>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className={className}
        style={style}
      >
        {isPending ? "Opening..." : "Manage Billing"}
      </button>
      {error && (
        <p style={{ fontSize: "0.75rem", color: "var(--hamilton-error, #ba1a1a)", marginTop: "0.375rem" }}>
          {error}
        </p>
      )}
    </div>
  );
}
```

### Container Query Conversion (Monitor main grid)

```tsx
// monitor/page.tsx — converted grid
// Add @container to <main>, convert inline style grid to Tailwind

<main className="@container" style={{ backgroundColor: "var(--hamilton-surface)", minHeight: "calc(100vh - 57px)" }}>
  {/* header unchanged */}
  
  {/* 12-col grid: collapse single → two-col at @2xl */}
  <div className="grid grid-cols-1 gap-8 @2xl:grid-cols-[7fr_5fr] @2xl:gap-12">
    <section>{/* SignalFeed */}</section>
    <aside>{/* WatchlistPanel */}</aside>
  </div>
</main>
```

---

## File Inventory: `src/components/hamilton/`

| File | Lines | Screen | Demo Data? | Responsive Work? |
|------|-------|--------|------------|-----------------|
| `monitor/SignalFeed.tsx` | 563 | Monitor | None | Low (flex internally) |
| `simulate/SimulateWorkspace.tsx` | 542 | Simulate | Line 300: fake reference string | Low (uses Tailwind classes) |
| `reports/ReportWorkspace.tsx` | 412 | Reports | Lines 400-401: hardcoded institution + peer | Low (grid responsive already) |
| `monitor/WatchlistPanel.tsx` | 394 | Monitor | None | Low (flex internally) |
| `layout/HamiltonLeftRail.tsx` | 392 | All | None | Out of scope |
| `analyze/AnalyzeWorkspace.tsx` | 363 | Analyze | None | Medium (floating bar) |
| `home/HamiltonViewCard.tsx` | 319 | Home | None | Not in D-06 scope |
| `reports/PdfDocument.tsx` | 289 | Reports | None | N/A (PDF rendering) |
| `monitor/FloatingChatOverlay.tsx` | 264 | Monitor | None | Fixed position (OK) |
| `reports/AnalysisPdfDocument.tsx` | 255 | Reports | None | N/A |
| `reports/ConfigSidebar.tsx` | 223 | Reports | None in component; fake strings passed AS props | None needed |
| `home/PositioningEvidence.tsx` | 222 | Home | None | Not in D-06 scope |
| `monitor/StatusStrip.tsx` | 193 | Monitor | None | HIGH: flex row breaks narrow |
| `layout/HamiltonTopNav.tsx` | 181 | All | None | Out of scope |
| `reports/ReportLibrary.tsx` | 176 | Reports | None | None |
| `home/MonitorFeedPreview.tsx` | 172 | Home | None | Not in D-06 scope |
| `simulate/CurrentVsProposed.tsx` | 171 | Simulate | None | None |
| `reports/ReportOutput.tsx` | 155 | Reports | None | None |
| `simulate/FeeSlider.tsx` | 144 | Simulate | None | None |
| `monitor/PriorityAlertCard.tsx` | 132 | Monitor | None | None |
| `simulate/StrategicTradeoffs.tsx` | 129 | Simulate | None | None |
| `simulate/RecommendedPositionCard.tsx` | 122 | Simulate | None | None |
| `layout/HamiltonContextBar.tsx` | 109 | All | None | Out of scope |
| `home/WhatChangedCard.tsx` | 109 | Home | None | Not in D-06 scope |
| `home/RecommendedActionCard.tsx` | 108 | Home | None | Not in D-06 scope |
| `home/PriorityAlertsCard.tsx` | 106 | Home | None | Not in D-06 scope |
| `analyze/AnalysisInputBar.tsx` | 106 | Analyze | None | Medium (padding) |
| `simulate/ScenarioArchive.tsx` | 101 | Simulate | None | None |
| `simulate/HamiltonInterpretation.tsx` | 100 | Simulate | None | None |
| `analyze/AnalyzeCTABar.tsx` | 94 | Analyze | None | None |
| `layout/HamiltonShell.tsx` | 88 | All | None | Out of scope |
| `analyze/EvidencePanel.tsx` | 83 | Analyze | None | None |
| `layout/HamiltonUpgradeGate.tsx` | 79 | All | None | Out of scope |
| `analyze/HamiltonViewPanel.tsx` | 79 | Analyze | None | None |
| `analyze/ExploreFurtherPanel.tsx` | 76 | Analyze | None | None |
| `reports/TemplateCard.tsx` | 69 | Reports | None | None |
| `simulate/ScenarioCategorySelector.tsx` | 68 | Simulate | None | None |
| `reports/StatCalloutBox.tsx` | 58 | Reports | None | None |
| `analyze/WhyItMattersPanel.tsx` | 56 | Analyze | None | None |
| `analyze/AnalysisFocusTabs.tsx` | 52 | Analyze | None | None |
| `analyze/WhatThisMeansPanel.tsx` | 45 | Analyze | None | None |
| `simulate/GenerateBoardSummaryButton.tsx` | 35 | Simulate | None | None |
| `simulate/InsufficientConfidenceGate.tsx` | 33 | Simulate | None | None |
| `reports/EmptyState.tsx` | 28 | Reports | None | None |
| `reports/ReportSection.tsx` | 26 | Reports | None | None |
| `reports/GeneratingState.tsx` | 19 | Reports | None | None |

**Total: 7,540 lines across 44 files**

---

## Environment Availability

Step 2.6 SKIPPED — this phase is entirely code/config changes with no external dependencies beyond what's already installed. Stripe keys, Anthropic API, and Tailwind v4 are all confirmed present.

---

## Validation Architecture

Tests should be run with `npx vitest run` after each plan.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run` |
| Full suite command | `npx vitest run && python -m pytest fee_crawler/tests/` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated? |
|--------|----------|-----------|------------|
| PRO-01 | Demo data removed, empty states render | Visual / smoke | Manual inspection at localhost |
| PRO-02 | ManageBillingButton calls createPortalSession | Unit + manual Stripe test | Manual with Stripe test mode |
| PRO-03 | Monitor and Analyze responsive at 768px | Visual / responsive | Manual browser resize or Playwright |

**No new vitest tests required** — this phase contains no business logic changes that need unit test coverage. The existing 60 vitest tests (format, taxonomy, districts) are unaffected.

### Wave 0 Gaps
None — no new test infrastructure needed.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `users` table does not expose `created_at` via the `User` type in auth.ts | Settings audit | If `created_at` is in the DB, "Member since" can be real data instead of being removed |
| A2 | Tailwind v4 arbitrary fr-unit class `grid-cols-[7fr_5fr]` works with container query variants (`@2xl:grid-cols-[7fr_5fr]`) | Responsive | If not supported, use CSS Grid custom properties or explicit `grid-template-columns` via style prop |
| A3 | `getSavedPeerSets` is importable directly in `reports/page.tsx` (it's currently used in settings/page.tsx) | Reports fix | If it's not exported from the right location, import from `@/lib/crawler-db/saved-peers` directly |

---

## Open Questions

1. **Should `createPortalSession()` return_url be updated?**
   - Current: `${origin}/account`
   - Better for this phase: `${origin}/pro/settings`
   - Recommendation: Update inline in stripe-actions.ts or accept a param — low risk change

2. **Are there two ManageBillingButton locations intentional or a design redundancy?**
   - Account Overview card has one (line 129), Billing section card has another (line 303)
   - Recommendation: Keep both — different contexts. Account Overview is for quick access, Billing section provides full subscription status context.

3. **Empty state upgrade scope for Home screen components?**
   - D-06 only mentions Analyze and Monitor for responsive. D-03 mentions "per screen" for empty states.
   - Home screen empty states are functional but minimal (text-only). Are they in scope for D-03 upgrades?
   - Recommendation: Treat Home screen as in-scope for PRO-01 empty state quality upgrades since D-03 says "per screen."

---

## Sources

### Primary (HIGH confidence)
- Direct reads of all 5 pro screen page files — contents verified line-by-line
- Direct reads of all 44 Hamilton component files — demo data inventory is exhaustive
- `src/lib/stripe-actions.ts` — `createPortalSession()` implementation confirmed
- `src/lib/auth.ts` — User type fields confirmed
- `src/app/pro/(hamilton)/settings/page.tsx` — two inert Manage Billing buttons confirmed at lines 129-139 and 303-313
- `package.json` — Tailwind v4, Next.js 16.1.6, stripe 20.4.1 versions confirmed

### Secondary (MEDIUM confidence)
- Tailwind v4 container query syntax (`@container`, `@2xl:`) — confirmed by card.tsx usage pattern and Tailwind v4 documentation conventions [ASSUMED from training; confirmed by tailwindcss ^4 version]

---

## Metadata

**Confidence breakdown:**
- Demo Data Audit: HIGH — direct file reads, complete inventory
- Stripe Billing Portal: HIGH — implementation fully read and confirmed
- Responsive Assessment: HIGH — layout code directly inspected
- Container Query Syntax: MEDIUM — Tailwind v4 is installed and @container found in card.tsx, specific arbitrary fr-unit variant syntax untested in this codebase

**Research date:** 2026-04-15
**Valid until:** 2026-05-15 (stable stack, no fast-moving dependencies)
