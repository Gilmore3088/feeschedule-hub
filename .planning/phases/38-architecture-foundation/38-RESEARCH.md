# Phase 38: Architecture Foundation - Research

**Researched:** 2026-04-08
**Domain:** TypeScript type contracts, CSS isolation (Tailwind v4), mode behavior config, navigation source of truth
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** 5 HTML prototype screenshots are the visual target. Warm parchment palette (#fbf9f4 base), Newsreader serif headlines, Inter sans body, tonal layering (no 1px borders for sectioning), burnished gradient CTAs.
- **D-02:** CSS isolation uses `.hamilton-shell` scoping class (mirrors `.admin-content` pattern). Hamilton styles MUST NOT bleed into admin portal or consumer pages.
- **D-03:** Design tokens as CSS custom properties within `.hamilton-shell` scope. Use Tailwind v4 utility classes where they express the intent; add custom tokens only for values the editorial aesthetic requires. Elevating the core system is acceptable.
- **D-04:** Dark mode follows existing `.admin-content` dark mode override pattern in globals.css. Dark parchment tones apply the same tonal layering principle.
- **D-05:** NO "Sovereign Intelligence" branding anywhere in code or UI.
- **D-06:** Brand hierarchy: FeeInsight.com > Bank Fee Index > Hamilton. Hamilton is a premium feature, not a standalone product.
- **D-07:** Hamilton nav logo says "Hamilton".
- **D-08:** Consistent label language: "Hamilton's View", "What Changed", "What This Means", "Why It Matters", "Recommended Position", "Priority Alert", "Signal Feed", "Analysis Focus".
- **D-09:** Backend already exists (voice v3.1, thesis engine, 12-source intelligence, 17 tools, editor v2). This milestone is frontend only.
- **D-10:** New 5-screen Hamilton UI replaces current chat-only Hamilton for BOTH pro and admin users. Admin retains admin tools separately.
- **D-11:** Hamilton reporting lives in Report Builder screen (Phase 45). Admin pipeline tools are NOT part of this milestone.
- **D-12:** Quality bar is "award-winning $5,000/yr consulting tool".
- **D-13:** Screen-specific DTOs extend existing `src/lib/hamilton/types.ts`. New types are additive — do not break existing report/thesis types.
- **D-14:** `HamiltonMode` type and `MODE_BEHAVIOR` config are new additions. `HamiltonRole` in agents.ts remains unchanged. Mode and role are orthogonal.
- **D-15:** Screen ownership enforced at type level where practical. Simulate owns `recommendedPosition`, Report owns `exportControls`, Analyze response type has no recommendation fields. Runtime validation is acceptable as fallback where compile-time enforcement is impractical.
- **D-16:** Hamilton top nav locked to: Home | Analyze | Simulate | Reports | Monitor | Admin. Single source of truth in a `navigation.ts` file.
- **D-17:** Navigation source file also defines left rail structure per screen and CTA hierarchy per screen.

### Claude's Discretion

- CSS custom property naming convention (`--hamilton-surface` vs `--h-surface`)
- Whether to use a separate CSS file (`hamilton.css`) or extend `globals.css` with `.hamilton-shell` block
- Exact Tailwind v4 integration approach for custom tokens (CSS variables in `@theme` layer vs inline)

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.

</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ARCH-01 | Hamilton shell CSS isolation boundary (`.hamilton-shell` scoping) prevents style contamination with admin portal | CSS scoping pattern documented; `.admin-content` model is the direct precedent |
| ARCH-02 | Screen-specific TypeScript DTOs (AnalyzeResponse, SimulationResponse, ReportSummaryResponse, MonitorResponse) enforce typed API contracts | Stub DTOs verified in canonical refs; richer versions in 06-api-and-agent-contracts.md |
| ARCH-03 | Mode enum and MODE_BEHAVIOR config define per-screen capabilities (canRecommend, canExport, canSimulate) | Ready-to-use stub verified in Hamilton-Design/stub/modes.ts |
| ARCH-04 | Navigation source file defines Hamilton top nav labels (Home, Analyze, Simulate, Reports, Monitor, Admin) | Ready-to-use stub verified in Hamilton-Design/stub/navigation.ts |
| ARCH-05 | Screen ownership rules enforced at type level (Simulate owns recommendation, Report owns export, Analyze cannot recommend) | TypeScript branded types / never pattern documented in research |

</phase_requirements>

---

## Summary

Phase 38 is a pure contracts-and-tokens phase: no screen UI is built. The deliverables are four TypeScript files (`types.ts` additions, `modes.ts`, `navigation.ts`) and one CSS block in globals.css (or a new `hamilton.css`). Everything downstream — the shell layout (Phase 40), all five screens (Phases 42-46) — imports from these files.

The technical risk in this phase is low because all four deliverables have working stubs in `Hamilton-Design/hamilton_revamp_package/stub/`. The canonical API contracts in `06-api-and-agent-contracts.md` are richer than the stubs and are the source of truth for DTO field shapes. The planner must reconcile the two: stubs are starting points, the doc defines the full contract.

The CSS work is the highest-judgment call: the `.hamilton-shell` scope must be isolated from `.admin-content` while both coexist in the same `globals.css`. The existing admin dark-mode override pattern (scoped class prefixing like `.dark .admin-content .text-gray-900`) is the exact model to follow.

**Primary recommendation:** Copy stubs to their final locations, upgrade DTOs to match `06-api-and-agent-contracts.md`, add `.hamilton-shell` CSS block to globals.css, write type-level tests using the `satisfies` operator pattern already established in `src/lib/hamilton/types.test.ts`.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | 5 (strict) | Type contracts, compile-time enforcement | Project standard; tsconfig strict=true [VERIFIED: tsconfig.json] |
| Tailwind CSS | v4 | CSS utilities within `.hamilton-shell` scope | Project standard; v4 PostCSS pipeline already configured [VERIFIED: package.json] |
| Next.js App Router | 16.1.6 | Route group for Hamilton screens (Phase 40+) | Project standard [VERIFIED: package.json] |
| Newsreader (Google Fonts) | via next/font/google | Serif editorial headlines | Already loaded in layout.tsx with CSS variable `--font-newsreader` [VERIFIED: src/app/layout.tsx] |
| vitest | 4.1.3 | Type-level contract tests | Already installed, tests exist for hamilton types [VERIFIED: package.json, src/lib/hamilton/types.test.ts] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `as const` satisfies | TypeScript built-in | Lock `MODE_BEHAVIOR` shape as readonly literal | `modes.ts` — prevents accidental mutation |
| CSS `@layer` | CSS standard | Ensure `.hamilton-shell` tokens don't fight Tailwind base layer | Wrap Hamilton tokens in a named layer to control cascade order |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| CSS scoping via `.hamilton-shell` class | CSS Modules per component | Class scoping is simpler and matches existing `.admin-content` pattern; CSS Modules would require file-level isolation at every component |
| globals.css extension | Separate hamilton.css import | Separate file is cleaner but requires another `@import` in globals.css; either works — Claude's discretion per D-03 |
| Tailwind v4 `@theme` layer for tokens | Inline CSS vars in `.hamilton-shell` | `@theme` exposes tokens globally and breaks isolation; scoped CSS vars inside `.hamilton-shell` are correct for isolation |

**Installation:** No new packages required. All tools already present.

---

## Architecture Patterns

### Recommended Project Structure (for this phase's outputs)

```
src/
├── lib/
│   └── hamilton/
│       ├── types.ts          # EXTEND: add AnalyzeResponse, SimulationResponse,
│       │                     #   ReportSummaryResponse, MonitorResponse (ARCH-02)
│       ├── modes.ts          # NEW: HamiltonMode, MODE_BEHAVIOR (ARCH-03)
│       ├── navigation.ts     # NEW: HAMILTON_NAV, left rail, CTA config (ARCH-04)
│       └── types.test.ts     # EXTEND: add satisfies tests for new DTOs (ARCH-02, ARCH-05)
└── app/
    └── globals.css           # EXTEND: add .hamilton-shell block (ARCH-01)
```

### Pattern 1: CSS Isolation via Scoping Class

**What:** All Hamilton editorial styles live inside `.hamilton-shell { ... }`. Global Tailwind utilities remain available but are overridden by scoped vars where needed.
**When to use:** Any element that belongs to the Hamilton experience wraps with `className="hamilton-shell"`.
**Example:**
```css
/* In globals.css — mirrors the .admin-content dark mode pattern [VERIFIED: src/app/globals.css lines 377-398] */
.hamilton-shell {
  /* Design tokens */
  --hamilton-surface: #fbf9f4;
  --hamilton-surface-elevated: #f5f1e8;
  --hamilton-text-primary: #1c1917;
  --hamilton-text-secondary: #78716c;
  --hamilton-accent: oklch(0.55 0.18 35);    /* burnished terracotta */
  --hamilton-font-serif: var(--font-newsreader), Georgia, serif;
  --hamilton-font-sans: var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif;

  /* Apply base tokens */
  background: var(--hamilton-surface);
  color: var(--hamilton-text-primary);
  font-family: var(--hamilton-font-sans);
}

/* Dark mode: same tonal-layering principle with dark parchment */
.dark .hamilton-shell {
  --hamilton-surface: #1c1917;
  --hamilton-surface-elevated: #292524;
  --hamilton-text-primary: oklch(0.93 0.01 60);
  --hamilton-text-secondary: oklch(0.65 0.01 60);
}
```

### Pattern 2: Screen-Specific DTOs with No Cross-Contamination

**What:** Each screen has its own response interface. The Analyze interface explicitly omits `recommendedPosition`. The Simulate interface is the only one that includes it.
**When to use:** Any API endpoint returning Hamilton screen data must return exactly its screen's DTO.
**Example:**
```typescript
// Source: Hamilton-Design/hamilton_revamp_package/06-api-and-agent-contracts.md
// ARCH-02 + ARCH-05 enforcement

export interface AnalyzeResponse {
  title: string;
  confidence: {
    level: "high" | "medium" | "low";
    basis: string[];
  };
  hamiltonView: string;
  whatThisMeans: string;
  whyItMatters: string[];
  evidence: {
    metrics: Array<{ label: string; value: string; note?: string }>;
    chart?: unknown;
  };
  exploreFurther: string[];
  // NOTE: NO recommendedPosition field — enforced by absence [ARCH-05]
}

export interface SimulationResponse {
  scenarioSetup: {
    feeCategory: string;
    currentFee: number;
    proposedFee: number;
    min?: number;
    max?: number;
  };
  currentState: {
    percentile: number;
    medianGap: number;
    riskProfile: string;
  };
  proposedState: {
    percentile: number;
    medianGap: number;
    riskProfile: string;
  };
  deltas: {
    percentileChange: number;
    medianGapChange: number;
    riskShift: string;
  };
  interpretation: string;
  tradeoffs: Array<{ label: string; value: string; note?: string }>;
  recommendedPosition: string;  // ONLY SimulationResponse has this [ARCH-05]
}

export interface ReportSummaryResponse {
  title: string;
  executiveSummary: string[];
  snapshot: Array<{ label: string; current: string; proposed: string }>;
  strategicRationale: string;
  tradeoffs: Array<{ label: string; value: string }>;
  recommendation: string;
  implementationNotes: string[];
  exportControls: {              // ONLY ReportSummaryResponse has this
    pdfEnabled: boolean;
    shareEnabled: boolean;
  };
}
```

### Pattern 3: MODE_BEHAVIOR as const — capability gating

**What:** Immutable per-mode capability flags. TypeScript `as const` prevents mutation. Components check `MODE_BEHAVIOR[mode].canRecommend` before rendering recommendation UI.
**When to use:** Any component that conditionally renders recommendation/export/simulation features.
**Example:**
```typescript
// Source: Hamilton-Design/hamilton_revamp_package/stub/modes.ts [VERIFIED]
export type HamiltonMode = "home" | "analyze" | "simulate" | "report" | "monitor";

export const MODE_BEHAVIOR = {
  home:     { canRecommend: false, canExport: false, canSimulate: true  },
  analyze:  { canRecommend: false, canExport: false, canSimulate: true  },
  simulate: { canRecommend: true,  canExport: true,  canSimulate: true  },
  report:   { canRecommend: true,  canExport: true,  canSimulate: false },
  monitor:  { canRecommend: false, canExport: false, canSimulate: true  },
} as const;

export type ModeBehavior = typeof MODE_BEHAVIOR[HamiltonMode];
```

### Pattern 4: Navigation as single source of truth

**What:** One `HAMILTON_NAV` array drives the rendered top nav and any programmatic routing. No nav label is hardcoded in components.
**Example:**
```typescript
// Source: Hamilton-Design/hamilton_revamp_package/stub/navigation.ts [VERIFIED]
export const HAMILTON_NAV = [
  { label: "Home",     href: "/pro/home"     },
  { label: "Analyze",  href: "/pro/analyze"  },
  { label: "Simulate", href: "/pro/simulate" },
  { label: "Reports",  href: "/pro/reports"  },
  { label: "Monitor",  href: "/pro/monitor"  },
  { label: "Admin",    href: "/admin"        },
] as const;

// Left rail per-screen config (same file, per D-17)
export type HamiltonScreen = typeof HAMILTON_NAV[number]["label"];

export const LEFT_RAIL_CONFIG: Record<HamiltonScreen, {
  primaryCta: string;
  sections: string[];
}> = {
  Home:     { primaryCta: "Simulate Change",          sections: ["Saved Analyses", "Recent Work"] },
  Analyze:  { primaryCta: "Simulate a Change",        sections: ["Saved Analyses", "Recent Work", "Pinned Institutions"] },
  Simulate: { primaryCta: "Generate Board Summary",   sections: ["Scenarios", "Saved Analyses"] },
  Reports:  { primaryCta: "Export PDF",               sections: ["Report History", "Templates"] },
  Monitor:  { primaryCta: "Review Pricing",           sections: ["Watchlist", "Signal Feed"] },
  Admin:    { primaryCta: "",                         sections: [] },
};
```

**Note on hrefs:** The stub uses bare paths (`/home`, `/analyze`). The project's pro section lives at `/pro/*` [VERIFIED: src/app/pro/]. Hrefs must be updated to `/pro/home`, `/pro/analyze`, etc. — or the Hamilton (hamilton) route group (Phase 40) will define its own structure. The nav file should express the final canonical paths. This is a planner decision; the stub hrefs are placeholders.

### Pattern 5: Type-level ownership enforcement via branded types

**What:** TypeScript prevents a caller from passing `SimulationResponse` where `AnalyzeResponse` is expected — and vice versa — because the types have distinct shapes. For ARCH-05, the absence of `recommendedPosition` in `AnalyzeResponse` is itself the compile-time guard.
**When to use:** Any function that processes screen output should declare its parameter type as the specific screen DTO, not a union.

```typescript
// ARCH-05: The TypeScript compiler rejects this at compile time
function renderAnalyzeOutput(response: AnalyzeResponse) {
  // response.recommendedPosition  <-- TS error: Property does not exist
}

// Satisfies test (matches types.test.ts pattern [VERIFIED: src/lib/hamilton/types.test.ts])
import { describe, it, expect } from "vitest";

describe("AnalyzeResponse screen boundary", () => {
  it("does not expose recommendedPosition", () => {
    const r: AnalyzeResponse = {
      title: "Test",
      confidence: { level: "high", basis: [] },
      hamiltonView: "...",
      whatThisMeans: "...",
      whyItMatters: [],
      evidence: { metrics: [] },
      exploreFurther: [],
    };
    // @ts-expect-error — verifies recommendedPosition is absent at compile time
    void r.recommendedPosition;
    expect(r.hamiltonView).toBeTruthy();
  });
});
```

### Anti-Patterns to Avoid

- **Generic Hamilton response envelope:** Do not create `HamiltonResponse<T>` wrappers that allow any screen to receive any payload. One interface per screen.
- **Tailwind `@theme` for Hamilton tokens:** The `@theme` layer in Tailwind v4 is global. Putting Hamilton palette tokens there would make `--hamilton-surface` available on every page, defeating isolation. Scope them inside `.hamilton-shell { }` only.
- **Hardcoded nav labels in components:** Any string like `"Analyze"` in a nav component instead of `HAMILTON_NAV[1].label` breaks the single source of truth contract.
- **Modifying existing HamiltonRole type:** `HamiltonRole` in `agents.ts` is orthogonal to `HamiltonMode`. Do not merge them or add screen modes to the role union.
- **Dark mode token overrides that target `.admin-content`:** Hamilton dark mode selectors must be `.dark .hamilton-shell`, not `.dark .admin-content`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Font loading for Newsreader | Custom `<link>` tag or @import | `next/font/google` | Already configured in layout.tsx with CSS variable; adding a second load creates FOUT [VERIFIED: src/app/layout.tsx] |
| Type-level tests | Jest + complex mocks | vitest `satisfies` operator pattern | Already used in `types.test.ts`; `satisfies` catches shape mismatches at compile time without runtime overhead |
| CSS variable token system | Tailwind plugin or CSS-in-JS | Plain CSS custom properties inside `.hamilton-shell` | Matches `.admin-content` pattern; zero dependencies |
| Mode capability checks | Runtime switch statements throughout components | `MODE_BEHAVIOR[mode].canX` lookup | Single source removes duplication and is tree-shaken |

**Key insight:** This phase is 90% moving known-good stubs into their canonical locations and writing tests to verify them. The complexity is in precision (correct paths, correct types, correct CSS specificity) not in invention.

---

## Common Pitfalls

### Pitfall 1: Tailwind v4 @theme vs scoped CSS vars

**What goes wrong:** Hamilton palette tokens declared in `@theme inline { }` block become global Tailwind CSS variables, accessible to admin and consumer pages.
**Why it happens:** Tailwind v4's `@theme` block generates CSS variables on `:root`, which cascade everywhere.
**How to avoid:** All `--hamilton-*` custom properties MUST be declared inside `.hamilton-shell { }`, not in `@theme`. Use Tailwind utility classes only where the value is already a Tailwind token (e.g., `stone-50`); use raw CSS variables for custom editorial values.
**Warning signs:** If `--hamilton-surface` appears in the browser's `:root` computed styles rather than on `.hamilton-shell` elements, the token has leaked.

### Pitfall 2: CSS specificity collision between .hamilton-shell and Tailwind utilities

**What goes wrong:** Tailwind utilities like `bg-white` applied inside `.hamilton-shell` override the scoped `background: var(--hamilton-surface)` because Tailwind utilities have equal or higher specificity.
**Why it happens:** Tailwind v4 generates utilities at the same cascade layer as scoped CSS.
**How to avoid:** Use `@layer` to give `.hamilton-shell` scoped styles appropriate cascade priority. Alternatively, design Hamilton components to use `style` prop with CSS vars directly, or always use Tailwind `bg-[--hamilton-surface]` syntax inside the shell.
**Warning signs:** Components inside `.hamilton-shell` show white backgrounds instead of parchment `#fbf9f4`.

### Pitfall 3: Href paths in navigation.ts won't match Phase 40 route group

**What goes wrong:** The stub navigation.ts uses bare paths (`/home`, `/analyze`). The project uses `/pro/*` currently. Phase 40 will create a `(hamilton)` route group. If the hrefs don't match the actual routes, nav links will 404.
**Why it happens:** Stub was written independently of the actual Next.js routing structure.
**How to avoid:** In this phase, choose a canonical base path for Hamilton routes (e.g., `/pro/hamilton/home` or `/pro/home`) that Phase 40 will implement. Document it in navigation.ts as a comment. Do not hard-code assumptions the shell layout hasn't been built yet.
**Warning signs:** Nav links render but produce 404s or redirect to login.

### Pitfall 4: Breaking existing types.ts exports

**What goes wrong:** Adding new interfaces to `types.ts` accidentally changes existing exports (e.g., re-exporting `SectionType` under a new name, or adding a conflicting `SectionOutput` override).
**Why it happens:** The file is imported in at least 3+ places (`generate.ts`, `validate.ts`, test files). Any type name collision will cause compile errors throughout.
**How to avoid:** Add new types at the bottom of the file with a clear section comment. Never rename or change the signature of existing types. Run `npx tsc --noEmit` after changes.
**Warning signs:** `npx tsc --noEmit` fails with errors in files that were previously clean.

### Pitfall 5: MODE_BEHAVIOR not `as const` — losing literal type narrowing

**What goes wrong:** If `MODE_BEHAVIOR` is declared without `as const`, TypeScript infers `{ canRecommend: boolean }` instead of `{ canRecommend: false }`. Narrowing checks like `if (behavior.canRecommend)` stop providing type guarantees.
**Why it happens:** Forgetting `as const` is easy; TypeScript doesn't warn you.
**How to avoid:** Always declare `MODE_BEHAVIOR` with `as const`. Write a type test that verifies the literal type: `type _Check = typeof MODE_BEHAVIOR["analyze"]["canRecommend"] extends false ? true : never`.
**Warning signs:** TypeScript reports `canRecommend` as `boolean` in hover tooltips instead of `true` or `false`.

---

## Code Examples

### Verified MODE_BEHAVIOR pattern
```typescript
// Source: Hamilton-Design/hamilton_revamp_package/stub/modes.ts [VERIFIED]
export type HamiltonMode = "home" | "analyze" | "simulate" | "report" | "monitor";

export const MODE_BEHAVIOR = {
  home:     { canRecommend: false, canExport: false, canSimulate: true  },
  analyze:  { canRecommend: false, canExport: false, canSimulate: true  },
  simulate: { canRecommend: true,  canExport: true,  canSimulate: true  },
  report:   { canRecommend: true,  canExport: true,  canSimulate: false },
  monitor:  { canRecommend: false, canExport: false, canSimulate: true  },
} as const;
```

### Verified HAMILTON_NAV pattern
```typescript
// Source: Hamilton-Design/hamilton_revamp_package/stub/navigation.ts [VERIFIED]
// NOTE: hrefs updated from stub to match /pro/* project structure
export const HAMILTON_NAV = [
  { label: "Home",     href: "/pro/home"     },
  { label: "Analyze",  href: "/pro/analyze"  },
  { label: "Simulate", href: "/pro/simulate" },
  { label: "Reports",  href: "/pro/reports"  },
  { label: "Monitor",  href: "/pro/monitor"  },
  { label: "Admin",    href: "/admin"        },
] as const;
```

### Existing .admin-content dark mode override pattern (CSS model to follow)
```css
/* Source: src/app/globals.css lines 377-398 [VERIFIED] */
.dark .admin-content .text-gray-900 { color: oklch(0.93 0 0); }
.dark .admin-content .bg-white,
.dark .bg-white { background: oklch(0.205 0 0); }

/* Hamilton follows the same scoping discipline: */
.dark .hamilton-shell .bg-white { background: var(--hamilton-surface-dark); }
```

### Additive extension of types.ts (correct approach)
```typescript
// Appended to src/lib/hamilton/types.ts — no existing exports modified
// ─── Screen DTOs (Phase 38) ─────────────────────────────────────────────────

export interface AnalyzeResponse {
  // ... fields from 06-api-and-agent-contracts.md
  // NOTE: no recommendedPosition — ARCH-05
}

export interface SimulationResponse {
  // ... fields from 06-api-and-agent-contracts.md
  recommendedPosition: string;  // Simulate screen ONLY
}

export interface ReportSummaryResponse {
  // ... fields from 06-api-and-agent-contracts.md
  exportControls: { pdfEnabled: boolean; shareEnabled: boolean };  // Report screen ONLY
}

export interface MonitorResponse {
  // ... fields from 06-api-and-agent-contracts.md
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| CSS Modules for component isolation | Scoping class + CSS custom properties | This project's established pattern (see `.admin-content`) | No build-step isolation needed; class-based scoping is portable |
| Google Fonts via `<link>` | `next/font/google` with CSS variable | Next.js 13+ | Font is already CSS variable `--font-newsreader` in layout [VERIFIED] |
| Tailwind `theme()` function | Tailwind v4 CSS variable references (`--color-*`) | Tailwind v4 | `theme()` is deprecated in v4; use CSS vars directly [ASSUMED - verify if needed] |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Tailwind v4 `@theme` puts tokens on `:root` globally, so Hamilton tokens must NOT go there | Pitfall 1, Standard Stack | Low — the CSS isolation design doesn't depend on this; `.hamilton-shell` scoping works regardless |
| A2 | The final Hamilton route base will be `/pro/*` (e.g., `/pro/home`) since Hamilton screens replace current `/pro/research` | Navigation Pattern, Pitfall 3 | Medium — if Phase 40 uses a different path, nav hrefs need updating; document in navigation.ts |
| A3 | `theme()` function is deprecated in Tailwind v4 | State of the Art | Low — this phase doesn't use `theme()`; it's informational |

---

## Open Questions

1. **What is the canonical base path for Hamilton routes?**
   - What we know: Current pro layout is at `/pro/`. The stub uses bare `/home`, `/analyze`.
   - What's unclear: Will Phase 40 create `src/app/pro/(hamilton)/` (keeping `/pro/home`) or `src/app/(hamilton)/` (standalone)?
   - Recommendation: In navigation.ts, define a `HAMILTON_BASE = "/pro"` constant and construct hrefs as `${HAMILTON_BASE}/home` etc. This is easy to change in one place when Phase 40 establishes the route group.

2. **Separate hamilton.css file vs extending globals.css?**
   - What we know: Claude's discretion (D-03). Both work.
   - What's unclear: Whether adding a new `@import` to globals.css will affect Tailwind v4's PostCSS scan order.
   - Recommendation: Extend globals.css with a clearly delimited `.hamilton-shell` block. This is the same approach as `.admin-content` and requires no import changes.

---

## Environment Availability

Step 2.6: SKIPPED — this phase is pure code and config changes with no external service dependencies. No network calls, no new packages, no CLI tools beyond TypeScript compiler and vitest.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.3 |
| Config file | none — runs via `npx vitest run` with vite-tsconfig-paths [VERIFIED: devDependencies] |
| Quick run command | `npx vitest run src/lib/hamilton/` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ARCH-01 | `.hamilton-shell` scoped tokens do not appear on `:root` | manual/visual | Browser DevTools inspect | N/A — CSS, not testable with vitest |
| ARCH-02 | AnalyzeResponse, SimulationResponse, ReportSummaryResponse, MonitorResponse compile correctly | unit (type) | `npx vitest run src/lib/hamilton/types.test.ts` | ❌ Wave 0 |
| ARCH-03 | MODE_BEHAVIOR has correct literal types for all 5 modes | unit (type) | `npx vitest run src/lib/hamilton/types.test.ts` | ❌ Wave 0 |
| ARCH-04 | HAMILTON_NAV contains exactly 6 entries with correct labels | unit | `npx vitest run src/lib/hamilton/types.test.ts` | ❌ Wave 0 |
| ARCH-05 | TypeScript compiler rejects recommendedPosition access on AnalyzeResponse | unit (type + @ts-expect-error) | `npx tsc --noEmit && npx vitest run src/lib/hamilton/types.test.ts` | ❌ Wave 0 |

**ARCH-01 note:** CSS isolation is verified visually (apply class to a div, confirm admin card styles don't leak in). A Playwright smoke test could check for the absence of class bleed, but that is out of scope for this phase.

### Sampling Rate
- **Per task commit:** `npx tsc --noEmit`
- **Per wave merge:** `npx vitest run src/lib/hamilton/`
- **Phase gate:** `npx tsc --noEmit && npx vitest run` full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `src/lib/hamilton/types.test.ts` — extend with `satisfies` tests for ARCH-02 AnalyzeResponse, SimulationResponse, ReportSummaryResponse, MonitorResponse
- [ ] `src/lib/hamilton/types.test.ts` — add `@ts-expect-error` test for ARCH-05 (recommendedPosition absent from AnalyzeResponse)
- [ ] `src/lib/hamilton/modes.test.ts` — new file: covers ARCH-03 literal type narrowing on MODE_BEHAVIOR
- [ ] `src/lib/hamilton/navigation.test.ts` — new file: covers ARCH-04 nav label count and shape

*(Existing `types.test.ts` covers thesis types only; Hamilton screen DTO tests are new additions.)*

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Type contracts only; no auth logic in this phase |
| V3 Session Management | no | No session changes |
| V4 Access Control | no | Mode/role gating is configured here but enforced in Phase 40 shell layout |
| V5 Input Validation | no | No API inputs; DTOs are output shapes |
| V6 Cryptography | no | No cryptographic operations |

**Security note:** Phase 38 establishes the `HamiltonMode` type and `MODE_BEHAVIOR` config. The actual enforcement of role-based access (pro paywall, admin capability check) occurs in Phase 40's layout server component using existing `getCurrentUser()` and `canAccessPremium()`. This phase creates the contracts; Phase 40 enforces them.

---

## Sources

### Primary (HIGH confidence)
- `Hamilton-Design/hamilton_revamp_package/stub/modes.ts` — HamiltonMode type and MODE_BEHAVIOR verified
- `Hamilton-Design/hamilton_revamp_package/stub/navigation.ts` — HAMILTON_NAV structure verified
- `Hamilton-Design/hamilton_revamp_package/stub/types-revamp.ts` — starter DTO shapes verified
- `Hamilton-Design/hamilton_revamp_package/06-api-and-agent-contracts.md` — full richer DTO field definitions verified
- `Hamilton-Design/hamilton_revamp_package/01-product-architecture.md` — screen ownership rules and non-negotiable boundaries verified
- `Hamilton-Design/hamilton_revamp_package/02-navigation-and-information-architecture.md` — nav structure and left rail verified
- `Hamilton-Design/hamilton_revamp_package/09-copy-and-ux-rules.md` — CTA hierarchy and label rules verified
- `src/lib/hamilton/types.ts` — existing 190-line type file structure verified; new DTOs must not break it
- `src/lib/hamilton/types.test.ts` — `satisfies` test pattern verified; established template for new tests
- `src/app/globals.css` — `.admin-content` CSS scoping and dark mode override pattern verified
- `src/app/layout.tsx` — Newsreader font already loaded as `--font-newsreader` CSS variable; verified
- `tsconfig.json` — strict mode confirmed; `@/*` path alias confirmed
- `package.json` — vitest 4.1.3, Tailwind v4, Next.js 16.1.6 confirmed

### Secondary (MEDIUM confidence)
- None required for this phase — all critical patterns are in-repo

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages verified in package.json and in active use
- Architecture: HIGH — patterns are directly derived from existing `.admin-content` implementation and canonical reference docs in repo
- Pitfalls: HIGH — derived from Tailwind v4 CSS cascade behavior (documented) and project-specific patterns observed in globals.css
- Type enforcement: HIGH — `satisfies` pattern confirmed working in types.test.ts; `@ts-expect-error` is standard TypeScript

**Research date:** 2026-04-08
**Valid until:** 2026-06-01 (stable stack; Next.js 16/Tailwind v4 not in rapid flux)
