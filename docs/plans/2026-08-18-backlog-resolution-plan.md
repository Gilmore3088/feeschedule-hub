# Fee Insight Backlog Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve all 20 items in the prioritised backlog of the 100-visitor audit (artifact "Fee Insight 100 Visitors", 2026-08-17) — 6 P0 revenue blockers, 10 P1 breadth/credibility fixes, 4 P2 polish items — so that every conversion path completes, every headline number agrees, institution profiles are reachable and honest, and the walkers' flags are gone.

**Architecture:** Three phases. **Phase A (P0)** unblocks revenue: production env, email, emergency stop, mobile drawer, directory search, Stripe back-trap. **Phase B (P1)** fixes credibility and reach: one canonical benchmark source with a small-n/outlier policy, profile↔directory reconciliation, institution reachability, guides content, studies, consumer next-steps, contact routing + password reset, city pages, payment/Pro polish. **Phase C (P2)** is hygiene: real 404s + canonicals, hydration/RSC errors, mobile tables, `/fees` skeleton and cold starts. Tasks are ordered so later tasks consume interfaces defined earlier (Task 7's `getCanonicalBenchmarks` and Task 8's `sample-policy` are used by Tasks 9–13, 15).

**Tech Stack:** Next.js 16 App Router (React 19, RSC, server actions), TypeScript, Tailwind, `postgres` (postgres.js) via `src/lib/data-store`, Supabase Postgres (`published_fee_catalog` is the only product read surface), Stripe (`stripe` v20), Resend over plain HTTPS (`src/lib/email/resend.ts`), Vitest 4 + jsdom + `@testing-library/react`, Playwright (already in `node_modules`) for the acceptance checks, Vercel CLI for env/deploys.

**Spec:** the two audit artifacts —
- https://claude.ai/code/artifact/1d97ce4b-9e12-4bcf-8b5c-99a3c2fd0cea (100 visitors; "Prioritised backlog" section is the source of the 20 items)
- https://claude.ai/code/artifact/79097931-79b1-4118-a7c0-0af255fe1ad7 (dead-end map; register D01–D37)
- Local raw material: `/private/tmp/claude-501/-Users-jgmbp/33cbed90-fe09-4e35-a3c1-6746e99adb6c/scratchpad/` (`sim/results/summary.json`, `reviews/*/review.json`, `journeys/*/journey.json`).

## Global Constraints

- Brand: **Fee Insight** is the site/company; **Bank Fee Index** is the product; **Hamilton** is the Pro workspace. Never name the site as the product. `scripts/ci-guards.sh brand-kill` enforces it. Contact stays `hello@bankfeeindex.com` (`CONTACT_EMAIL` in `src/lib/constants.ts`).
- Report offer copy: **"Competitive Fee Position Report — $300, delivered in 48 hours."** (`REPORT_OFFER` constant.) Pro: **$499.99/mo per seat** or **$5,000/yr per seat**.
- Product / report / research / public API reads use **`published_fee_catalog`** only. Never read `extracted_fees`, `fees_raw`, `fees_verified`, `fees_published`, or historical source tables from app code (`fee-read-model-kill`, `source-read-model-kill`, `catalog-contract-kill` guards). Counting provisional fees is allowed only through the existing `SEARCH_QUALITY_CTE` pattern (`src/lib/data-store/search.ts:68-115`) which reads the tier **views** `verified_fee_observations` / `raw_fee_observations` for counts — reuse it, do not widen it.
- No one-off scripts, no Modal, no Supabase Edge Functions, no `ops_jobs`. Background work must be a typed agent module with run-ledger visibility (`src/lib/agents/*`, `run-store.ts`).
- Public status vocabulary: **Verified / Under review / No published schedule found.** "Rows" → "fees".
- One numbers source: no hand-typed counts on any public surface (`getPublicStatsSummary()`; this plan adds `getCanonicalBenchmarks()` for medians).
- Every public number formats with `"en-US"` locale (Task 18).
- Coding style (`~/.claude/rules`): files under 300 lines where practical, named constants, no `console.log` in production code, conventional commits, run `npx vitest run <file>` and `npm run lint` before each commit; `npm run guard:legacy` before pushing.
- Never commit secrets. Env changes go through `vercel env` (values piped from stdin, never echoed).
- Do not send outreach emails; do not complete live-mode Stripe payments.

---

## Phase A — P0 revenue blockers

### Task 1: Registration works in production (Stripe key hygiene + honest error state)

**Files:**
- Modify: `src/lib/stripe.ts:5-14`
- Modify: `src/app/(auth)/register/actions.ts:62-72, 120-123`
- Modify: `src/app/(auth)/register/register-form.tsx:76-80`
- Create: `src/lib/stripe.test.ts`
- Create: `src/app/(auth)/register/register-error.ts`, `src/app/(auth)/register/register-error.test.ts`
- Ops: Vercel production env `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `BFI_APP_URL`

**Interfaces:**
- Produces: `normalizeStripeKey(raw: string | undefined): string` (trims whitespace/newlines; throws `Error("STRIPE_SECRET_KEY is not configured")` when empty) in `src/lib/stripe.ts`.
- Produces: `registerErrorMessage(kind: "stripe" | "db" | "duplicate"): string` in `register-error.ts` — used by `actions.ts` and rendered by `register-form.tsx`.

- [ ] **Step 1: Ops — re-set the three prod env vars without the trailing newline and redeploy** (values are read from `.env.production.local`, stripped, piped; nothing is printed):

```bash
cd ~/code/active/feeschedule-hub
for K in STRIPE_SECRET_KEY NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY BFI_APP_URL; do
  V=$(grep "^$K=" .env.production.local | sed -E 's/^[^=]+=//; s/^"//; s/\\n"?$//; s/"$//' | tr -d '\r\n')
  vercel env rm "$K" production -y && printf '%s' "$V" | vercel env add "$K" production
done
vercel redeploy "$(vercel ls --prod 2>/dev/null | grep -o 'https://[^ ]*' | head -1)"
```
Expected: `vercel env ls production` shows the three vars updated "just now"; deployment Ready.

- [ ] **Step 2: Write the failing test for key normalization**

```ts
// src/lib/stripe.test.ts
import { describe, expect, it } from "vitest";
import { normalizeStripeKey } from "./stripe";

describe("normalizeStripeKey", () => {
  it("should_strip_trailing_newline_and_whitespace", () => {
    expect(normalizeStripeKey("sk_test_abc\n")).toBe("sk_test_abc");
    expect(normalizeStripeKey("  sk_test_abc \r\n")).toBe("sk_test_abc");
  });
  it("should_throw_when_missing_or_blank", () => {
    expect(() => normalizeStripeKey(undefined)).toThrow("STRIPE_SECRET_KEY is not configured");
    expect(() => normalizeStripeKey(" \n")).toThrow("STRIPE_SECRET_KEY is not configured");
  });
});
```

- [ ] **Step 3: Run it — expect FAIL** `npx vitest run src/lib/stripe.test.ts` → "normalizeStripeKey is not a function".

- [ ] **Step 4: Implement**

```ts
// src/lib/stripe.ts (replace lines 5-14)
export function normalizeStripeKey(raw: string | undefined): string {
  const key = (raw ?? "").trim();
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  return key;
}

export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(normalizeStripeKey(process.env.STRIPE_SECRET_KEY), { typescript: true });
  }
  return _stripe;
}
```

- [ ] **Step 5: Write the failing test for error copy**

```ts
// src/app/(auth)/register/register-error.test.ts
import { describe, expect, it } from "vitest";
import { registerErrorMessage, REGISTER_FALLBACK_CTA } from "./register-error";

describe("registerErrorMessage", () => {
  it("should_name_the_failing_step_without_leaking_internals", () => {
    expect(registerErrorMessage("stripe")).toMatch(/billing account/i);
    expect(registerErrorMessage("db")).toMatch(/save your account/i);
    expect(registerErrorMessage("duplicate")).toBe("An account with this email already exists.");
  });
  it("should_offer_a_human_fallback", () => {
    expect(REGISTER_FALLBACK_CTA.href).toBe("/contact?type=pro");
    expect(REGISTER_FALLBACK_CTA.label).toMatch(/set up your seat/i);
  });
});
```

- [ ] **Step 6: Run — expect FAIL**, then implement:

```ts
// src/app/(auth)/register/register-error.ts
export type RegisterErrorKind = "stripe" | "db" | "duplicate";
export const REGISTER_FALLBACK_CTA = {
  href: "/contact?type=pro",
  label: "Email us and we'll set up your seat by hand",
} as const;
export function registerErrorMessage(kind: RegisterErrorKind): string {
  switch (kind) {
    case "stripe": return "We couldn't create your billing account just now. Nothing was charged.";
    case "db": return "We couldn't save your account. Please try again in a minute.";
    case "duplicate": return "An account with this email already exists.";
  }
}
```

In `actions.ts`: replace the two `"Registration failed. Please try again."` returns with `registerErrorMessage("stripe")` (line 71) and `registerErrorMessage("db")` (line 122); the duplicate branch (line 104) with `registerErrorMessage("duplicate")`. In `register-form.tsx:76-80` render, under the error text, `<a href={REGISTER_FALLBACK_CTA.href} className="underline">{REGISTER_FALLBACK_CTA.label}</a>`.

- [ ] **Step 7: Run tests + lint** `npx vitest run src/lib/stripe.test.ts "src/app/(auth)/register/register-error.test.ts" && npm run lint` → PASS.

- [ ] **Step 8: Acceptance on prod (after Step 1 deploy):** Playwright: `/subscribe` → Start monthly → fill `jlgilmore2+feeinsight-reg-check@gmail.com` → Create account → expect landing on `/subscribe?plan=monthly&checkout=1` then `checkout.stripe.com` (do **not** pay; press Stripe's back arrow). Then delete that user row.

- [ ] **Step 9: Commit** `git commit -m "fix(auth): normalize Stripe key and give registration a specific error with a human fallback"`

---

### Task 2: Lead / report / contact emails actually send

**Files:**
- Ops: Vercel prod env `RESEND_API_KEY`, `REPORT_REQUEST_EMAIL_FROM` (verified sender on bankfeeindex.com — check `mcp__resend__list-domains`; if not verified, `create-domain` + DNS first)
- Create: `src/lib/email/config.ts`, `src/lib/email/config.test.ts`
- Modify: `src/app/for-institutions/page.tsx` (pass `emailConfigured` to the form), `src/app/for-institutions/request-report-form.tsx:225-228`
- Modify: `src/app/api/leads/lead-notifications.ts:65-71` (notify for `newsletter` and `notify` sources too — confirmation only)

**Interfaces:**
- Produces: `isLeadEmailConfigured(env = process.env): boolean` — true iff `RESEND_API_KEY` and a From address (`REPORT_REQUEST_EMAIL_FROM || WORKSPACE_INVITE_EMAIL_FROM || TRANSACTIONAL_EMAIL_FROM || EMAIL_FROM`) are non-blank.
- `RequestReportForm` gains prop `emailConfigured: boolean`.

- [ ] **Step 1: Failing test**

```ts
// src/lib/email/config.test.ts
import { describe, expect, it } from "vitest";
import { isLeadEmailConfigured } from "./config";
describe("isLeadEmailConfigured", () => {
  it("should_require_key_and_from", () => {
    expect(isLeadEmailConfigured({})).toBe(false);
    expect(isLeadEmailConfigured({ RESEND_API_KEY: "re_x" })).toBe(false);
    expect(isLeadEmailConfigured({ RESEND_API_KEY: "re_x", EMAIL_FROM: "Fee Insight <hello@bankfeeindex.com>" })).toBe(true);
    expect(isLeadEmailConfigured({ RESEND_API_KEY: " ", REPORT_REQUEST_EMAIL_FROM: "x@y" })).toBe(false);
  });
});
```

- [ ] **Step 2: Run — FAIL.** Implement:

```ts
// src/lib/email/config.ts
type Env = Record<string, string | undefined>;
const FROM_KEYS = ["REPORT_REQUEST_EMAIL_FROM", "WORKSPACE_INVITE_EMAIL_FROM", "TRANSACTIONAL_EMAIL_FROM", "EMAIL_FROM"] as const;
export function isLeadEmailConfigured(env: Env = process.env): boolean {
  const key = (env.RESEND_API_KEY ?? "").trim();
  const from = FROM_KEYS.map((k) => (env[k] ?? "").trim()).find(Boolean);
  return Boolean(key && from);
}
```

- [ ] **Step 3: Conditional promise.** In `for-institutions/page.tsx` compute `const emailConfigured = isLeadEmailConfigured();` and pass `<RequestReportForm emailConfigured={emailConfigured} … />`. In `request-report-form.tsx:225-228` replace the paragraph with:

```tsx
<p className="text-xs leading-relaxed text-[#6B6255]">
  No payment is taken at this step. {emailConfigured
    ? "You get a confirmation email right away; we confirm your peer set by email before any work starts."
    : `We confirm your peer set by email from ${contactEmail} before any work starts.`}
  {" "}The $300 is invoiced after you confirm the peer set; pay by card link or purchase order.
</p>
```
(That last sentence resolves D06 "payment never explained".)

- [ ] **Step 4: Confirmation for newsletter/notify.** In `lead-notifications.ts` `shouldNotify` (65-71): return `true` for `source === "newsletter"` and `source === "notify"` as well, but pass `{ notifyTeam: false }` so only the requester confirmation is sent (extend `notifyForLead` to accept and forward `notifyTeam`; in `sendContactRequestNotifications` skip the `CONTACT_EMAIL` message when `notifyTeam === false`). Add a test in `src/app/api/leads/route.test.ts` (exists) asserting the response for `source: "newsletter"` now contains `notifications.confirmation`.

- [ ] **Step 5: Ops.** `printf '%s' "$RESEND_KEY" | vercel env add RESEND_API_KEY production` and `printf '%s' "Fee Insight <hello@bankfeeindex.com>" | vercel env add REPORT_REQUEST_EMAIL_FROM production`; redeploy. Verify: submit the report form once with `Journey Audit TEST` data → response `notifications.notification === "sent"` and mail arrives at `hello@bankfeeindex.com` and the requester.

- [ ] **Step 6: Run tests + lint; commit** `git commit -m "feat(leads): gate email promises on configuration, confirm newsletter/notify, explain how the report is paid"`

---

### Task 3: Hamilton delivers value again (emergency stop, customer-safe errors, no empty analyses)

**Files:**
- Ops: Anthropic credit top-up; then admin `/admin` → "Resume automation" (`src/app/admin/atlas-actions.ts:120-132`); or SQL `UPDATE automation_control SET enabled = TRUE, reason = 'credit restored', changed_by = 'james', changed_at = NOW(), revision = revision + 1 WHERE control_key = 'global'` (resume is blocked for 24 h after a credit failure by `assertNoRecentProviderCreditFailure`, `src/lib/automation-control.ts:86-104` — the SQL path bypasses that only after credit is actually restored).
- Create: `src/lib/hamilton/customer-error.ts`, `src/lib/hamilton/customer-error.test.ts`
- Modify: `src/app/pro/(hamilton)/reports/actions.ts:644-647`, `src/app/api/research/hamilton/route.ts:364-370`
- Modify: `src/components/hamilton/analyze/AnalyzeWorkspace.tsx:174-201` (add `onError`, skip save when parsed response is empty)
- Modify: `src/lib/hamilton/home-data.ts:164-181` (return `thesisStatus`), `src/app/pro/(hamilton)/hamilton/page.tsx:19-23,177` (do not cache a failed thesis; show status banner)

**Interfaces:**
- Produces: `toCustomerFacingError(err: unknown): { message: string; code: "paused" | "budget" | "rate_limit" | "provider" | "unknown" }` — maps `EmergencyStopActiveError`/"Emergency stop" → `paused` with copy "Hamilton analysis is paused for maintenance. Your data is safe; try again shortly or email hello@bankfeeindex.com."; never includes provider text.
- `home-data.ts` `getHamiltonHomeData` returns `thesisStatus: "current" | "paused" | "unavailable"`.

- [ ] **Step 1: Failing test**

```ts
// src/lib/hamilton/customer-error.test.ts
import { describe, expect, it } from "vitest";
import { toCustomerFacingError } from "./customer-error";
describe("toCustomerFacingError", () => {
  it("should_map_emergency_stop_to_paused_without_leaking_reason", () => {
    const r = toCustomerFacingError(new Error("Emergency stop is active; hamilton generate_report_section is blocked: Anthropic API credit balance is too low"));
    expect(r.code).toBe("paused");
    expect(r.message).not.toMatch(/Anthropic|credit|extractor/i);
    expect(r.message).toMatch(/paused/i);
  });
  it("should_map_unknown_errors_generically", () => {
    expect(toCustomerFacingError(new Error("boom")).code).toBe("unknown");
  });
});
```

- [ ] **Step 2: Run — FAIL.** Implement:

```ts
// src/lib/hamilton/customer-error.ts
import { CONTACT_EMAIL } from "@/lib/constants";
export type CustomerErrorCode = "paused" | "budget" | "rate_limit" | "provider" | "unknown";
const PAUSED = `Hamilton analysis is paused for maintenance. Your data is safe — try again shortly or email ${CONTACT_EMAIL}.`;
export function toCustomerFacingError(err: unknown): { message: string; code: CustomerErrorCode } {
  const raw = err instanceof Error ? err.message : String(err);
  if (/Emergency stop/i.test(raw)) return { code: "paused", message: PAUSED };
  if (/budget|blocked/i.test(raw)) return { code: "budget", message: PAUSED };
  if (/rate limit|429/i.test(raw)) return { code: "rate_limit", message: "Hamilton is busy right now. Please retry in a minute." };
  if (/provider|anthropic|api_error/i.test(raw)) return { code: "provider", message: "Hamilton couldn't reach its analysis engine. Please retry." };
  return { code: "unknown", message: "Something went wrong generating this. Please retry." };
}
```

- [ ] **Step 3: Wire it.** `reports/actions.ts:644-647` → `return { success: false, error: toCustomerFacingError(err).message };`. `api/research/hamilton/route.ts:364-370` → `return Response.json({ error: toCustomerFacingError(err).message, code: toCustomerFacingError(err).code }, { status: 423 })`.

- [ ] **Step 4: AnalyzeWorkspace.** Add to the `useChat` options an `onError: (e) => { setChatError(toCustomerFacingError(e).message); }` with `const [chatError, setChatError] = useState<string | null>(null)`; render `{chatError && <div role="alert" className="hamilton-error">{chatError} <button onClick={() => reload()}>Retry</button></div>}` above the "Hamilton's View" card. In `onFinish`, guard the save: `if (!parsed.hamiltonView.trim() && parsed.whyItMatters.length === 0) { setChatError("Hamilton returned an empty analysis; nothing was saved."); return; }` before `saveAnalysis`.

- [ ] **Step 5: Home thesis.** In `home-data.ts` catch block set `thesisStatus = /Emergency stop/i.test(errorMessage) ? "paused" : "unavailable"` and include it in the returned object (`thesisStatus: thesis ? "current" : thesisStatus`). In `hamilton/page.tsx` split the cache: keep `unstable_cache` for the numeric summary but call the thesis outside the cache (or wrap thesis in its own `unstable_cache` with `revalidate: 300` and skip caching when `thesis === null` by returning early before the cache write). Replace line 177 label with `{data.thesisStatus === "current" ? "Analysis current" : data.thesisStatus === "paused" ? "Analysis paused for maintenance" : "Analysis unavailable"}` and add a banner `<HamiltonStatusBanner status={data.thesisStatus} />` (new small component in `src/components/hamilton/home/HamiltonStatusBanner.tsx`, renders nothing when `current`).

- [ ] **Step 6: Tests + lint** `npx vitest run src/lib/hamilton/customer-error.test.ts src/app/api/research/hamilton/route.gate.test.ts && npm run lint`.

- [ ] **Step 7: Acceptance (local, test Stripe, logged in as the audit Pro user):** with the flag still off, `/pro/reports` Generate shows the paused copy (no "Anthropic"); `/pro/analyze` shows the alert and does not add a saved analysis; after resuming automation, Generate produces a report.

- [ ] **Step 8: Commit** `git commit -m "fix(hamilton): customer-safe provider errors, no empty saved analyses, honest thesis status"`

---

### Task 4: Mobile navigation drawer

**Files:**
- Modify: `src/components/consumer-mobile-nav.tsx:36-72,131`
- Create: `src/components/consumer-mobile-nav.test.tsx`
- (Optional) Modify: `src/components/consumer-nav.tsx:45` — drop `backdrop-blur-sm` (keep `bg-[#FAF7F2]/95`) as belt-and-braces.

**Interfaces:** none new; drawer is portaled to `document.body` and gains `role="dialog" aria-modal="true" aria-label="Menu"`, Escape closes.

- [ ] **Step 1: Failing test**

```tsx
// src/components/consumer-mobile-nav.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
import { ConsumerMobileNav } from "./consumer-mobile-nav";

describe("ConsumerMobileNav", () => {
  it("should_portal_the_drawer_to_body_so_header_backdrop_filter_cannot_clip_it", () => {
    const { container } = render(<header style={{ backdropFilter: "blur(2px)" }}><ConsumerMobileNav isLoggedIn={false} isPro={false} /></header>);
    fireEvent.click(screen.getByRole("button", { name: /open menu/i }));
    const dialog = screen.getByRole("dialog", { name: /menu/i });
    expect(container.contains(dialog)).toBe(false);          // not inside the header
    expect(document.body.contains(dialog)).toBe(true);
  });
  it("should_close_on_escape_and_backdrop_click", () => {
    render(<ConsumerMobileNav isLoggedIn={false} isPro={false} />);
    fireEvent.click(screen.getByRole("button", { name: /open menu/i }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
```

- [ ] **Step 2: Run — FAIL** (`getByRole('dialog')` not found / inside header).

- [ ] **Step 3: Implement.** In `consumer-mobile-nav.tsx`: `import { createPortal } from "react-dom";` add `const [mounted, setMounted] = useState(false); useEffect(() => setMounted(true), []);` and an Escape handler `useEffect(() => { if (!open) return; const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false); document.addEventListener("keydown", onKey); return () => document.removeEventListener("keydown", onKey); }, [open]);`. Wrap the existing backdrop + drawer JSX (lines 66-147) in `const overlay = open ? (<>…</>) : null;` and render `{mounted && overlay ? createPortal(overlay, document.body) : null}` after the toggle button. Add `role="dialog" aria-modal="true" aria-label="Menu"` to the drawer div (line 72). Ensure the toggle button has `aria-label={open ? "Close menu" : "Open menu"}`.

- [ ] **Step 4: Run tests — PASS.** Manual: Playwright 390×844 on `/`, `/fees/overdraft`, `/guides` → drawer is full height, opaque, closes on X / backdrop / Escape; screenshot to compare with `journeys/consumer/52-m-nav-open.png`.

- [ ] **Step 5: Commit** `git commit -m "fix(nav): portal the mobile drawer out of the blurred header, add dialog semantics and Escape"`

---

### Task 5: Directory search — visible dropdown, keyboard, mobile access

**Files:**
- Modify: `src/app/(public)/institutions/search-bar.tsx:91-165`
- Modify: `src/app/(public)/institutions/state-directory-map.tsx:96`
- Modify: `src/app/(public)/institutions/page.tsx:128-132` (accept `?q=` and pass as `initialQuery`; render results for it via `searchInstitutions({ q })` — the loader already takes a query? if not add `q` to `loadResults`)
- Modify: `src/components/consumer-nav.tsx` (show a search icon button on mobile that opens `SearchModal` — it is mounted at layout root `src/app/(public)/layout.tsx:37`; the trigger uses the same `open` event the ⌘K button dispatches)
- Create: `src/app/(public)/institutions/search-bar.test.tsx`

**Interfaces:** `InstitutionSearchBar` gains `onSubmitQuery?: (q: string) => void` (default: `router.push('/institutions?q=' + encodeURIComponent(q))`) and ARIA combobox roles.

- [ ] **Step 1: Failing test**

```tsx
// src/app/(public)/institutions/search-bar.test.tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
import { InstitutionSearchBar } from "./search-bar";

describe("InstitutionSearchBar", () => {
  it("should_expose_listbox_and_navigate_on_arrow_enter", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ([{ id: 22, institution_name: "The Huntington National Bank", city: "Columbus", state_code: "OH", charter_type: "bank", fee_count: 13, published_fee_count: 0, provisional_fee_count: 13 }]) }) as never;
    render(<InstitutionSearchBar />);
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "Hunt" } });
    await waitFor(() => expect(screen.getByRole("listbox")).toBeInTheDocument());
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(push).toHaveBeenCalledWith("/institution/22");
  });
  it("should_submit_free_text_on_enter_with_no_selection", async () => {
    render(<InstitutionSearchBar />);
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "Ohio" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(push).toHaveBeenCalledWith("/institutions?q=Ohio");
  });
});
```

- [ ] **Step 2: Run — FAIL.** Implement in `search-bar.tsx`: `const [active, setActive] = useState(-1)`; on input `role="combobox" aria-expanded={open} aria-controls="inst-search-listbox" aria-activedescendant={active >= 0 ? \`inst-opt-${active}\` : undefined}`; `onKeyDown`: ArrowDown/ArrowUp move `active` within results, Enter → if `active >= 0` `router.push(\`/institution/${results[active].id}\`)` else `onSubmitQuery(value)`, Escape closes. Dropdown `<ul id="inst-search-listbox" role="listbox">` with `<li id={\`inst-opt-${i}\`} role="option" aria-selected={i === active}>`. Change wrapper (line 91) to `className="relative z-30 w-full max-w-xl"` and add `relative z-0` to the state section wrapper (`state-directory-map.tsx:96`).

- [ ] **Step 3: `?q=` results.** In `institutions/page.tsx` read `params.q`; when present call `searchInstitutions({ q, pageSize: 50 })` (confirm `searchInstitutions` accepts `q` — `search.ts:176`; if the param is named differently, use that) and render the same `InstitutionResults` list under an h2 "Results for “{q}”"; pass `initialQuery={q}` to the bar.

- [ ] **Step 4: Mobile search trigger.** In `consumer-nav.tsx` add, next to the hamburger and visible only `md:hidden`, `<button aria-label="Search" onClick={() => document.dispatchEvent(new CustomEvent("fi:open-search"))}>` and in `search-modal.tsx` add `useEffect(() => { const h = () => setOpen(true); document.addEventListener("fi:open-search", h); return () => document.removeEventListener("fi:open-search", h); }, [])`.

- [ ] **Step 5: Tests + lint PASS.** Playwright acceptance: `/institutions` type "Huntington" → 6 suggestions visible above the map; ArrowDown×6 + Enter → `/institution/22`; mobile header shows the search icon and opens the modal.

- [ ] **Step 6: Commit** `git commit -m "fix(search): raise directory suggestions above the map, add keyboard/ARIA, q= results and a mobile search trigger"`

---

### Task 6: Stripe checkout hand-off without the back trap

**Files:**
- Modify: `src/app/subscribe/subscribe-button.tsx:34-67`
- Modify: `src/lib/stripe-actions.ts:27-31` (cancel_url adds `checkout=canceled`)
- Modify: `src/app/subscribe/page.tsx:69-77` (read `checkout=canceled` → notice; treat missing price id as an error, not a spinner)
- Create: `src/app/subscribe/checkout-url.ts`, `src/app/subscribe/checkout-url.test.ts`

**Interfaces:** `stripCheckoutParam(href: string): string` — removes `checkout` from the query, keeps others; `checkoutNotice(params): "canceled" | null`.

- [ ] **Step 1: Failing test**

```ts
// src/app/subscribe/checkout-url.test.ts
import { describe, expect, it } from "vitest";
import { stripCheckoutParam, checkoutNotice } from "./checkout-url";
describe("checkout url helpers", () => {
  it("should_remove_only_the_checkout_param", () => {
    expect(stripCheckoutParam("/subscribe?plan=monthly&checkout=1&from=%2Fpro")).toBe("/subscribe?plan=monthly&from=%2Fpro");
    expect(stripCheckoutParam("/subscribe?checkout=1")).toBe("/subscribe");
  });
  it("should_detect_cancel_return", () => {
    expect(checkoutNotice({ checkout: "canceled" })).toBe("canceled");
    expect(checkoutNotice({ checkout: "1" })).toBeNull();
  });
});
```

- [ ] **Step 2: Run — FAIL.** Implement:

```ts
// src/app/subscribe/checkout-url.ts
export function stripCheckoutParam(href: string): string {
  const u = new URL(href, "https://internal.invalid");
  u.searchParams.delete("checkout");
  const q = u.searchParams.toString();
  return `${u.pathname}${q ? `?${q}` : ""}`;
}
export function checkoutNotice(params: Record<string, string | string[] | undefined>): "canceled" | null {
  return params.checkout === "canceled" ? "canceled" : null;
}
```

- [ ] **Step 3: Use it.** In `subscribe-button.tsx` `startCheckout`, before `window.location.href = url;` add `window.history.replaceState(null, "", stripCheckoutParam(window.location.pathname + window.location.search));` and use `window.location.assign(url)`. In the auto-start `useEffect`, if `autoStart && !priceId` call `setError("Checkout is not available right now. Email hello@bankfeeindex.com and we'll set up your seat.")` and `setPending(false)`. In `stripe-actions.ts` build `cancel_url` as `${origin}${cancelPath}${cancelPath.includes("?") ? "&" : "?"}checkout=canceled`. In `subscribe/page.tsx` when `checkoutNotice(params) === "canceled"` render a quiet notice above the plan cards: "Checkout cancelled — nothing was charged. Pick a plan whenever you're ready."

- [ ] **Step 4: Tests + lint PASS.** Acceptance (local, test Stripe): register via Start monthly → Stripe → browser Back → lands on `/subscribe?plan=monthly` with **no** auto-redirect; Stripe's back arrow → `/subscribe?...&checkout=canceled` shows the notice.

- [ ] **Step 5: Commit** `git commit -m "fix(checkout): replace history before Stripe redirect, cancel notice, no infinite spinner when price id missing"`

---

## Phase B — P1 credibility and reach

### Task 7: One canonical benchmark table for every headline number

**Files:**
- Create: `src/lib/benchmarks/canonical.ts`, `src/lib/benchmarks/canonical.test.ts`
- Create: `src/lib/format.ts` (`formatNumber(n: number): string`, `formatMoney(n: number): string`, `formatDate(d: Date | string): string` — all pinned to `"en-US"`), `src/lib/format.test.ts` (`formatNumber(1234.5) === "1,234.5"`, `formatMoney(5) === "$5.00"`, `formatDate("2026-08-12") === "Aug 12, 2026"`)
- Modify: `src/lib/data-store/fee-index.ts:322-360` (`getNationalIndexCached` → live compute with in-process TTL; stop reading `fee_index_cache`), `:5` comment
- Modify: `src/lib/data-store/fees.ts:84-138` (`getFeeCategorySummaries` delegates to canonical), `src/app/(public)/fees/[category]/page.tsx:113-122,172-174,413,428`
- Modify: `src/app/(public)/research/national-fee-index/page.tsx:24,163-206,382`
- Modify: `src/app/(public)/research/state/[code]/page.tsx:80-98`, `src/app/(public)/research/district/[id]/page.tsx:83-103` (national column from canonical)
- Modify: `src/app/(public)/guides/[slug]/page.tsx:44-47,115,204`
- Modify hard-coded "49": `src/lib/access.ts:10` (+ `getVisibleCategoryCount`), `src/app/(public)/guides/[slug]/page.tsx:297`, `src/app/(public)/guides/page.tsx:299`, `src/app/api/v1/openapi.json/route.ts:11,210`, `src/app/account/page.tsx:212`, `src/app/admin/index/page.tsx:51`, `research/national-fee-index/page.tsx:24` — replace with `TAXONOMY_COUNT` (65) or `summary.categories` (live) as appropriate; families count from `Object.keys(FEE_FAMILIES).length` (14) at `national-fee-index/page.tsx:382`.

**Interfaces:**
```ts
// src/lib/benchmarks/canonical.ts
export type CanonicalBenchmark = {
  fee_category: string; median: number | null; p25: number | null; p75: number | null; min: number | null; max: number | null;
  institution_count: number;   // distinct institutions with a priced (>0) approved fee in this category
  observation_count: number;   // deduped priced observations (same dedupe key as getPublicStats)
  as_of: string | null;        // ISO date of freshness
};
export function computeBenchmark(rows: { institution_id: number; amount: number | null }[]): Omit<CanonicalBenchmark, "fee_category" | "as_of">;
export async function getCanonicalBenchmarks(): Promise<Record<string, CanonicalBenchmark>>;   // cached 1h in-process, one SQL over published_fee_catalog
export async function getCanonicalBenchmark(category: string): Promise<CanonicalBenchmark | null>;
```
Definition (the one rule everyone uses): **priced = amount > 0; institution_count = distinct institution_id among priced rows; observation_count = distinct (institution_id, fee_name, amount, frequency, variant_type) among priced rows; percentiles = linear interpolation over each institution's *minimum* priced amount** (so tiered rows do not multiply an institution). Document this in `/methodology`.

- [ ] **Step 1: Failing unit test for `computeBenchmark`**

```ts
// src/lib/benchmarks/canonical.test.ts
import { describe, expect, it } from "vitest";
import { computeBenchmark } from "./canonical";
describe("computeBenchmark", () => {
  it("should_use_one_amount_per_institution_and_count_distinct_institutions", () => {
    const b = computeBenchmark([
      { institution_id: 1, amount: 30 }, { institution_id: 1, amount: 35 },   // tiered: min 30
      { institution_id: 2, amount: 20 }, { institution_id: 3, amount: 0 }, { institution_id: 4, amount: null },
    ]);
    expect(b.institution_count).toBe(2);
    expect(b.observation_count).toBe(3);
    expect(b.median).toBe(25);
    expect(b.min).toBe(20); expect(b.max).toBe(30);
  });
  it("should_return_nulls_when_no_priced_rows", () => {
    expect(computeBenchmark([{ institution_id: 1, amount: 0 }]).median).toBeNull();
  });
});
```

- [ ] **Step 2: Run — FAIL.** Implement `computeBenchmark` (reuse `computePercentile` from `fees.ts:52-82` — export it) and `getCanonicalBenchmarks()`:

```ts
const rows = await sql<{ fee_category: string; institution_id: number; fee_name: string; amount: number | null; frequency: string | null; variant_type: string | null }[]>`
  SELECT ef.fee_category, ef.institution_id, ef.fee_name, ef.amount, ef.frequency, ef.variant_type
  FROM published_fee_catalog ef
  WHERE ef.review_status = 'approved' AND ef.fee_category IS NOT NULL`;
```
group by category → `computeBenchmark`; `as_of` from `getDataFreshness()`; memoise in a module-level `{ at, value }` with `TTL_MS = 60 * 60 * 1000` and in-flight promise dedupe (copy the pattern at `fee-index.ts:320-340`).

- [ ] **Step 3: Rewire consumers.** `getNationalIndexCached()` → returns `Object.values(await getCanonicalBenchmarks())` mapped to the existing `NationalIndexEntry` shape (`median_amount`, `p25`, `p75`, `institution_count`, `observation_count`); delete the `fee_index_cache` read (`readNationalIndexCached`) — keep the function name so callers compile. `getFeeCategorySummaries()` → derived from canonical (keep return type). Category page: `verifiedFeeCount = bench.observation_count`, `institutionCount = bench.institution_count`, stats from `bench` (n-line 172-174, methodology 413, JSON-LD 428). National index cards: `allIndex.length` stays; observations sum stays but now matches `/fees`. State/district "National Median" column ← canonical (`getPeerIndex` stays live for the geo column; both now use the same n definition — align `getPeerIndex` to min-per-institution too, `fee-index.ts:48`). Guides byline (`:115`) ← `getPublicStatsSummary().institutionsLabel` (not `getStats()`); histogram n-line (`:204`) says "observations".

- [ ] **Step 4: Replace hard-coded 49s** as listed in Files (grep `49` in those files; each becomes `TAXONOMY_COUNT` or `summary.categoriesLabel`). `access.ts getVisibleCategoryCount` → return `TAXONOMY_COUNT` for premium; for free `getSpotlightCategories().length`.

- [ ] **Step 5: Tests** `npx vitest run src/lib/benchmarks/canonical.test.ts` and existing `src/lib/data-store/*.test.ts` if any; `npm run lint`; `scripts/ci-guards.sh catalog-contract-kill`.

- [ ] **Step 6: Acceptance:** Playwright reads OD median on `/fees`, `/fees/overdraft`, `/research/national-fee-index`, `/research/state/OH` national column → all equal; monthly maintenance equal; category count shows one live number on `/fees` and NFI ("57" today), 65 only where the taxonomy is meant.

- [ ] **Step 7: Commit** `git commit -m "feat(data): canonical benchmark table drives every public median and count"`

---

### Task 8: Small-n and outlier policy

**Files:**
- Create: `src/lib/benchmarks/sample-policy.ts`, `src/lib/benchmarks/sample-policy.test.ts`
- Modify: `src/components/public/distribution-chart.tsx:19-55` (P5–P95 window, median reference line, min-n message)
- Modify: `src/app/(public)/fees/[category]/page.tsx` (insufficient → no percentile cards, "insufficient data" panel, `robots: { index: false }`, no `UpgradeGate` count claim), `research/state/[code]/page.tsx:91`, `research/district/[id]/page.tsx:103`, `guides/[slug]/page.tsx:61-66,195` (dedupe per institution, min-n on lists)
- Modify: `src/lib/benchmarks/canonical.ts` (attach `sample: SampleClass` and `outlier_flagged: number`)

**Interfaces:**
```ts
export const MIN_N_PUBLISH = 5;      // below: "insufficient data" — no median/percentiles, noindex
export const MIN_N_EARLY = 10;       // 5–9: "early data" badge
export const MIN_ROW_N = 3;          // state/district table rows below this are suppressed
export type SampleClass = "insufficient" | "early" | "established";
export function classifySample(n: number): SampleClass;
export function trimOutliers(values: number[]): { kept: number[]; flagged: number[] };  // drop values > max(10 × p75, p99)
export function histogramWindow(values: number[]): { lo: number; hi: number };           // p5..p95 clamp
export function dedupePerInstitution<T extends { institution_id: number; amount: number }>(rows: T[], pick?: "min" | "max"): T[];
```

- [ ] **Step 1: Failing tests**

```ts
// src/lib/benchmarks/sample-policy.test.ts
import { describe, expect, it } from "vitest";
import { classifySample, trimOutliers, histogramWindow, dedupePerInstitution, MIN_N_PUBLISH } from "./sample-policy";
describe("sample policy", () => {
  it("should_classify_by_thresholds", () => {
    expect(classifySample(4)).toBe("insufficient"); expect(classifySample(MIN_N_PUBLISH)).toBe("early"); expect(classifySample(10)).toBe("established");
  });
  it("should_flag_the_5000_dollar_monthly_fee", () => {
    const vals = [5, 6, 6, 8, 10, 12, 15, 5000];
    const { kept, flagged } = trimOutliers(vals);
    expect(flagged).toEqual([5000]); expect(kept).toHaveLength(7);
  });
  it("should_clamp_histogram_to_p5_p95", () => {
    const w = histogramWindow(Array.from({ length: 100 }, (_, i) => i + 1));
    expect(w.lo).toBeGreaterThanOrEqual(5); expect(w.hi).toBeLessThanOrEqual(96);
  });
  it("should_keep_one_row_per_institution", () => {
    expect(dedupePerInstitution([{ institution_id: 1, amount: 30 }, { institution_id: 1, amount: 35 }, { institution_id: 2, amount: 20 }])).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run — FAIL.** Implement (percentiles via the exported `computePercentile`).

- [ ] **Step 3: Apply.** `distribution-chart.tsx`: compute `histogramWindow(amounts)`, bin within `[lo, hi]`, add `<ReferenceLine x={median} label="median" />` (recharts), show "Not enough data to show a distribution (n < 5)" when `amounts.length < MIN_N_PUBLISH`. Category page: `const sample = classifySample(bench.institution_count)`; when `insufficient` render an `InsufficientDataPanel` (new small component: "We have fewer than 5 institutions with a published {name} fee. We list them without a benchmark.") instead of stat cards + chart, set `robots: { index: false, follow: true }` in `generateMetadata`, and pass no `count` to `UpgradeGate`; when `early` show an "Early data — 5–9 institutions" pill next to the h1. State/district: replace `>= 3` literals with `MIN_ROW_N`. Guides: `dedupePerInstitution(detail.fees, "min")` before cheapest/most-expensive; hide lists when `< MIN_N_PUBLISH`; run `trimOutliers` on histogram input and add a footnote "{flagged.length} value(s) under review are excluded". Canonical: after computing, `trimOutliers` on the per-institution amounts before percentiles; store `outlier_flagged`.

- [ ] **Step 4: Tests + lint PASS.** Acceptance: `/fees/prepaid_card_reload` (n=4) shows the insufficient panel and `<meta name="robots" content="noindex">`; `/fees/monthly_maintenance` histogram is readable (axis ≤ p95) and the guide no longer shows $5,000; `/research/state/OH` rows all n ≥ 3.

- [ ] **Step 5: Commit** `git commit -m "feat(data): small-n and outlier policy across benchmarks, charts and lists"`

---

### Task 9: Institution profile = directory (counts, badge tiers, score, per-row sources)

**Files:**
- Modify: `src/lib/data-store/core.ts:308-333` (`getPublicInstitutionById` uses the same three-CTE counts as `search.ts` — extract `SEARCH_QUALITY_CTE` into `src/lib/data-store/quality-cte.ts` and import it in both)
- Modify: `src/app/(public)/institution/[id]/page.tsx:69-71,106-125,201,258-273`, `institution-metrics.tsx:60`, `fee-schedule-table.tsx:62-64,139,161`, `profile-copy.ts`
- Create: `src/lib/institution-badge.ts`, `src/lib/institution-badge.test.ts`
- Migration: `supabase/migrations/20270102090000_source_documents_link_health.sql` (adds `last_checked_at timestamptz`, `last_status int`, `archived_r2_key text` to `source_documents`)
- Create: `src/lib/agents/magellan/link-check.ts` (+ `link-check.test.ts`) — a Magellan step `magellan.link_check` registered in `run-store.ts` next to the fetch step; it HEAD-checks `source_documents.url` for institutions with published fees, writes `last_checked_at/last_status`, and emits run events. (Typed agent module → satisfies the no-scripts rule.)

**Interfaces:**
```ts
// src/lib/institution-badge.ts
export type BadgeTier = "verified" | "partial" | "under_review" | "none";
export function institutionBadge(input: { published: number; provisional: number; hasSource: boolean }): { tier: BadgeTier; label: string; detail: string };
// verified: published >= 5 → "Verified"; partial: 1..4 → "Partially verified (n of 5)"; under_review: published 0 && (provisional > 0 || hasSource) → "Under review"; none → "No published schedule found"
```
- `getPublicInstitutionById` returns `published_fee_count`, `provisional_fee_count`, `latest_source_status` consistent with the directory.

- [ ] **Step 1: Failing test**

```ts
// src/lib/institution-badge.test.ts
import { describe, expect, it } from "vitest";
import { institutionBadge } from "./institution-badge";
describe("institutionBadge", () => {
  it("should_tier_by_published_count", () => {
    expect(institutionBadge({ published: 26, provisional: 20, hasSource: true }).tier).toBe("verified");
    expect(institutionBadge({ published: 2, provisional: 6, hasSource: true })).toMatchObject({ tier: "partial", label: "Partially verified (2 of 5)" });
    expect(institutionBadge({ published: 0, provisional: 13, hasSource: true }).tier).toBe("under_review");
    expect(institutionBadge({ published: 0, provisional: 0, hasSource: false }).tier).toBe("none");
  });
});
```

- [ ] **Step 2: Run — FAIL. Implement** `institution-badge.ts` (thresholds import `MIN_VERIFIED_FEES_FOR_OFFER` from `profile-copy.ts`).

- [ ] **Step 3: Reconcile counts.** Move `SEARCH_QUALITY_CTE` to `quality-cte.ts`; in `core.ts getPublicInstitutionById` select `published_fee_count`, `provisional_fee_count` from that CTE (same projection as `search.ts:223-233`). In `page.tsx:106-118` set `underReviewCount = inst.provisional_fee_count` (drop the `Math.max` juggling), render "Under review · {n}" tile, and add a collapsed `<details>` "What's under review ({n})" whose body is copy only: "{n} more fees have been collected from this institution's schedule and are being verified. Verified fees appear above as they clear review." (counts only — no provisional rows on public pages, per the read-model rule).

- [ ] **Step 4: Badge + score.** Replace the group-level "Verified" pill logic (`fee-schedule-table.tsx:62-64`) with `institutionBadge(...)` at page level (hero) and keep row chips for provisional in mixed groups. `institution-metrics.tsx:60`: render the tile only when `scoreLabel` is non-null; in `page.tsx:201` pass `scoreLabel={rating?.label ?? null}` from the existing `computeInstitutionRating` result (`page.tsx:122`) when `verifiedFees.length >= MIN_VERIFIED_FEES_FOR_OFFER`, else omit.

- [ ] **Step 5: Sources per row.** In `fee-schedule-table.tsx:139,161` render `Source: {host(sourceUrl)} · published {formatDate(fee.updated_at)}` (add `updated_at` to `getFeesByInstitution` select, `core.ts:86-90`) and, when `source_documents.last_status >= 400`, append "(link currently unavailable — archived copy on request)". Add `link_status` via a LEFT JOIN on `source_documents` by `ef.source_document_id`.

- [ ] **Step 6: Metadata honesty.** `page.tsx:71`: description says "verified against its own fee schedule" only when tier is `verified`; otherwise "Fee schedule under review — {n} fees collected" or "No published fee schedule on file yet".

- [ ] **Step 7: Link-check agent step.** `src/lib/agents/magellan/link-check.ts` exports `runLinkCheck(runId, { limit = 200 })`: selects `source_documents` for institutions with `published_fee_count > 0` ordered by `last_checked_at NULLS FIRST`, `fetch(url, { method: "HEAD", redirect: "follow" })` with 10 s timeout, updates `last_checked_at/last_status`, records a run event per batch. Register `"magellan.link_check"` in `run-store.ts` step registry; schedule from the existing tick (`src/app/api/admin/agents/tick/route.ts`) once per day. Test with a mocked `fetch` in `link-check.test.ts`.

- [ ] **Step 8: Tests + lint + guards** (`fee-tier-contract-kill`, `source-read-model-kill`, `catalog-contract-kill`). Acceptance: `/institution/3827` shows Verified, "Under review · 20", per-row "Source: angelinabankonline.com · published Feb 17, 2026 (link currently unavailable)"; `/institution/22` shows "Under review · 13" and no "No published schedule found"; `/institution/6703` "Partially verified (2 of 5)".

- [ ] **Step 9: Commit** `git commit -m "feat(profile): reconcile counts with directory, badge tiers, real score tile, per-row source lines, link-check step"`

---

### Task 10: Make institution profiles reachable by browsing

**Files:**
- Modify: `src/app/(public)/guides/[slug]/page.tsx:411-468` (institution names → `<Link href={/institution/${id}}>`)
- Create: `src/app/(public)/fees/[category]/institutions-charging.tsx` (server component; props `{ rows: CategoryFeeRow[]; category: string; name: string }`), used in `fees/[category]/page.tsx` after the distribution section
- Modify: `src/app/(public)/research/state/[code]/page.tsx:155-174` (add "View all {n} {state} institutions →" → `/institutions?state={code}`) and `research/district/[id]/page.tsx` (link each state chip to `/institutions?state=`)
- Modify: `src/app/(public)/institutions/page.tsx:50-69` + `directory-sort.ts` — verify the state filter lists **all** monitored institutions with status badges (Verified / Under review / No schedule); if `loadResults` applies a `has_fees` filter, remove it and add a "Verified only" toggle (query param `verified=1`)
- Create: `src/app/(public)/fees/[category]/institutions-charging.test.tsx`

**Interfaces:** `InstitutionsCharging` renders up to 10 lowest and 10 highest priced institutions (deduped per institution via `dedupePerInstitution`, hidden below `MIN_N_PUBLISH`), each a link to `/institution/{id}`, plus "See all {n} institutions in the directory →" (`/institutions?fee={category}` — add `fee` param support to the directory loader using `getFeeCategoryDetail`).

- [ ] **Step 1: Failing test**

```tsx
// src/app/(public)/fees/[category]/institutions-charging.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InstitutionsCharging } from "./institutions-charging";
const rows = Array.from({ length: 12 }, (_, i) => ({ institution_id: i + 1, institution_name: `Bank ${i + 1}`, amount: 10 + i, state_code: "OH", charter_type: "bank" }));
describe("InstitutionsCharging", () => {
  it("should_link_every_institution_name", () => {
    render(<InstitutionsCharging rows={rows} category="overdraft" name="Overdraft" />);
    expect(screen.getByRole("link", { name: /Bank 1$/ })).toHaveAttribute("href", "/institution/1");
  });
  it("should_hide_when_below_min_n", () => {
    const { container } = render(<InstitutionsCharging rows={rows.slice(0, 3)} category="overdraft" name="Overdraft" />);
    expect(container.textContent).toBe("");
  });
});
```

- [ ] **Step 2: Run — FAIL. Implement** the component; wire into `fees/[category]/page.tsx` (rows = `detail.fees` already loaded at `:113`); guides lists → links; state/district links; directory filter check.

- [ ] **Step 3: Tests + lint PASS.** Acceptance: rerun the 100-visitor sim (`node scratchpad/sim/run.js 3`) — institution-profile views should rise from 16 to well above 100 and distinct profiles from 13 to 50+.

- [ ] **Step 4: Commit** `git commit -m "feat(reach): link institutions from guides, category pages, state and district pages; directory shows monitored rows"`

---

### Task 11: Guides — prose from the index, citations, right hero, consumer CTAs

**Files:**
- Modify: `src/lib/guides.ts` (schema: `primaryCategory`, `sources: { label: string; url: string }[]`, section `content` may contain tokens `{{median}} {{p25}} {{p75}} {{n}}` for `primaryCategory`; fix invalid slugs `returned_item`→`nsf`, `atm_balance_inquiry`→`balance_inquiry`, `account_closure`→`early_closure`)
- Create: `src/lib/guides-render.ts` (`renderGuideProse(content, bench)`), `src/lib/guides-render.test.ts`, `src/lib/guides.test.ts` (every `feeCategories`/`primaryCategory` exists in `DISPLAY_NAMES`)
- Modify: `src/app/(public)/guides/[slug]/page.tsx:134-160` (hero = `primaryCategory`), `:230-247` (rendered prose + "Sources" list), `:490-518` (sidebar: `InstitutionSearchBar` + newsletter form + one-line report bridge; remove the API card), Article JSON-LD gains `author`, `publisher`, `datePublished`, `dateModified`, `image`; FAQ headings become questions; visible byline "By Fee Insight research · Updated {freshness}"
- Modify: `src/app/(public)/guides/page.tsx:299` (bottom CTA → consumer: "Look up your bank" `/institutions`), hero numbers from canonical

**Interfaces:** `renderGuideProse(content: string, bench: CanonicalBenchmark | null): string` replaces tokens with `$` formatted values (`formatMoney` from Task 18) or an em-dash when null.

- [ ] **Step 1: Failing tests**

```ts
// src/lib/guides-render.test.ts
import { describe, expect, it } from "vitest";
import { renderGuideProse } from "./guides-render";
it("should_fill_tokens_from_the_benchmark", () => {
  const out = renderGuideProse("Most banks charge between {{p25}} and {{p75}}, median {{median}} (n={{n}}).", { fee_category: "overdraft", median: 30, p25: 20, p75: 35, min: 1, max: 40, institution_count: 68, observation_count: 78, as_of: null } as never);
  expect(out).toBe("Most banks charge between $20.00 and $35.00, median $30.00 (n=68).");
});
// src/lib/guides.test.ts
import { GUIDES } from "./guides"; import { DISPLAY_NAMES } from "./fee-taxonomy";
it("should_only_reference_real_categories_and_have_sources", () => {
  for (const g of GUIDES) { for (const c of [g.primaryCategory, ...g.feeCategories]) expect(DISPLAY_NAMES[c], `${g.slug}:${c}`).toBeTruthy(); expect(g.sources.length).toBeGreaterThan(0); }
});
```

- [ ] **Step 2: Run — FAIL. Implement.** Rewrite each guide's numeric sentences with tokens (e.g. overdraft: "Overdraft fees at the institutions we track have a median of {{median}}; the middle half fall between {{p25}} and {{p75}}."), add 2–4 sources per guide (CFPB overdraft/NSF pages, Reg E, FDIC/NCUA, Fedwire, USPS money-order pricing, NAUPA), set `primaryCategory` (overdraft → `overdraft`, account-closure → `early_closure`, check → `cashiers_check`). Sidebar rework as listed.

- [ ] **Step 3: Tests + lint PASS.** Acceptance: each guide's numbers equal the category page's; hero stat on overdraft guide is the OD fee, not the daily cap; every Lowest/Highest name is a link; end-of-guide CTAs are Find your bank / Newsletter / (small) $300 bridge.

- [ ] **Step 4: Commit** `git commit -m "feat(guides): index-driven prose, sources, intent-matched hero, consumer CTAs, article schema"`

---

### Task 12: Original-research studies — content in front of the paywall

**Files:**
- Modify: `src/app/(public)/research/fee-revenue-analysis/page.tsx:33-40`, `src/app/(public)/research/market-concentration/page.tsx:39-46`
- Create: `src/app/(public)/research/study-teaser.tsx` (`StudyTeaser({ title, abstract, highlights: {label,value}[], chart?: ReactNode }`)
- Modify: `src/app/sitemap.ts:131-134` (add `/research/market-concentration`, `/research/data-sources`)
- Modify: `src/app/(public)/research/data-sources/page.tsx` (add breadcrumb + onward CTA to `/methodology`, `/api-docs`) and `src/app/(public)/research/page.tsx` (link data-sources from the hub)

**Interfaces:** each study page computes a public teaser from already-available functions (`getTierFeeRevenueSummary()` top-3 tiers; `getMarketConcentration({limit:5, minInstitutions:10})` top-5 states) and renders `<h1>`, breadcrumb, `StudyTeaser`, then `UpgradeGate` for the rest.

- [ ] **Step 1: Failing test** (`study-teaser.test.tsx`): renders `h1`, abstract, three highlights, and a "See pricing" link only once.
- [ ] **Step 2: Implement; move `getCurrentUser/canAccessPremium` below the teaser fetch; keep full study for premium.**
- [ ] **Step 3: Acceptance:** anonymous `/research/fee-revenue-analysis` has h1 + ≥150 words + a highlights table; sitemap lists both studies + data-sources.
- [ ] **Step 4: Commit** `git commit -m "feat(research): study teasers before the paywall, data-sources linked and indexed"`

---

### Task 13: Stop steering consumers to Pricing

**Files:**
- Modify: `src/components/upgrade-gate.tsx` (new prop `audience?: "professional" | "consumer"`; consumer variant renders `ConsumerNextSteps` instead of the pricing card)
- Create: `src/components/public/consumer-next-steps.tsx` (`{ stateCode?: string; category?: string }` → "Look up your bank" `/institutions`, "Fees in {state}" `/research/state/{code}` or "Fees by state" `/research#states`, newsletter form (reuse footer form component), and a one-line bridge "Work at a bank or credit union? Get the $300 report" → `/for-institutions#report`)
- Modify call sites: `fees/[category]/page.tsx:226` (`audience="consumer"`), `guides/[slug]` (Task 11 already), `research/state/[code]/page.tsx:346` (keep pro gate but add `ConsumerNextSteps` above), `research/national-fee-index/page.tsx:367` (add "Get a report for your institution — $300" line to the pro card)
- Modify: `src/app/for-institutions/pro-tools.tsx` "Start monthly" → `/register?plan=monthly&from=%2Ffor-institutions` (same target as `/subscribe`)

- [ ] **Step 1: Failing test** (`consumer-next-steps.test.tsx`): renders three links with the exact hrefs above given `stateCode="OH"`, and the report bridge points at `/for-institutions#report`.
- [ ] **Step 2: Implement + rewire.**
- [ ] **Step 3: Acceptance:** rerun sim; `/subscribe` visitors should drop from 63 → well under 40 and consumer-role pricing visits from 17 → single digits.
- [ ] **Step 4: Commit** `git commit -m "feat(cta): consumer next-steps on data pages and guides; one Start monthly target"`

---

### Task 14: Replace mailto CTAs; real password reset

**Files:**
- Modify: `src/app/subscribe/page.tsx` (Talk to us → `/contact?type=advisory`, Book a walkthrough → `/contact?type=pro`), `src/app/(public)/api-docs/page.tsx` ("Contact us about API access" → `/contact?type=api`; "Get started — no card required" → link `/contact?type=api`), `src/app/(public)/about/page.tsx` ("Write to James" → `/contact`), `src/app/(public)/contact/page.tsx` + `contact-form.tsx` (preselect inquiry from `?type=`; add inquiry type "Correct our listing / data question")
- Password reset: Migration `supabase/migrations/20270102090100_password_reset_tokens.sql` (`id uuid pk, user_id int fk, token_hash text unique, expires_at timestamptz, used_at timestamptz`); Create `src/lib/password-reset.ts` (+ test), `src/app/(auth)/forgot-password/page.tsx` + `actions.ts`, `src/app/(auth)/reset-password/page.tsx` + `actions.ts`, `src/lib/email/password-reset.ts`; Modify `src/app/(auth)/login/page.tsx:15-16` (`FORGOT_PASSWORD_HREF = "/forgot-password"`)

**Interfaces:**
```ts
// src/lib/password-reset.ts
export function createResetToken(): { token: string; tokenHash: string; expiresAt: Date }; // 32 random bytes hex; sha256; +60 min
export function hashResetToken(token: string): string;
export async function issueReset(email: string): Promise<void>;        // always resolves (no account enumeration); sends email when user exists
export async function consumeReset(token: string, newPassword: string): Promise<"ok" | "invalid" | "expired">;
```

- [ ] **Step 1: Failing tests** for `createResetToken`/`hashResetToken` (hash is deterministic, 64 hex chars; expiry ≈ 60 min) and `consumeReset` state machine with a mocked `sql`.
- [ ] **Step 2: Implement** using `hashPassword` from `src/lib/passwords`; email via `sendTransactionalEmail` (resend.ts) with `not_configured` handled (page says "If that email is on file, a reset link is on its way" regardless).
- [ ] **Step 3: Contact type presets + CTA rewires;** add `type` mapping test in `contact-form.test.tsx`.
- [ ] **Step 4: Acceptance:** `/subscribe` has zero `mailto:` in body; `/login` "Forgot password?" → `/forgot-password` → email link → `/reset-password?token=…` sets a new password.
- [ ] **Step 5: Commit** `git commit -m "feat(contact): route CTAs to the contact form, add correction inquiry type, self-serve password reset"`

---

### Task 15: City pages — median, slugs, index rules, as-of note

**Files:**
- Modify: `src/lib/data-store/city-fee-aggregation.ts:37-51` (median via `computePercentile(…, 50)`; rename field to `median` semantics), `src/lib/data-store/geographic.ts:187-235` (normalize city names: `INITCAP(LOWER(city))`, dedupe by normalized name; slug = lowercased, hyphenated)
- Modify: `src/app/(public)/fees/city/[state]/[city]/page.tsx:27-32,41-44,83-86,142,235-244`, `[state]/page.tsx:100`
- Modify: `src/proxy.ts` (canonical redirect: `/fees/city/:state/:city` with `%20` or uppercase → hyphenated lowercase 301)
- Modify: `src/app/sitemap.ts:56-73` (index a city only if ≥1 spotlight card populated — reuse the page's own `indexable` rule)
- Create: `src/lib/data-store/city-fee-aggregation.test.ts`, `src/lib/city-slug.ts` + test (`citySlug("Fort Worth") === "fort-worth"`, `cityName("fort-worth") === "Fort Worth"`)

- [ ] **Step 1: Failing tests** for median vs mean (`[10, 10, 100]` → 10) and slug round-trip.
- [ ] **Step 2: Implement;** page: rename "{city} Avg" → "{city} median", `indexable = institutions.length >= 3 && spotlight.some(s => s.cityAvg !== null)`, add `<DataFreshness />` + "Source: published fee schedules; institutions matched by headquarters city" note; link city pages from the state research page and directory.
- [ ] **Step 3: Acceptance:** `/fees/city/tx/fort%20worth` 301 → `/fees/city/tx/fort-worth`; Columbus page shows an honest empty state with `ConsumerNextSteps` (Task 13) and is noindex; Houston shows medians.
- [ ] **Step 4: Commit** `git commit -m "fix(city): true medians, canonical hyphen slugs, honest index rule, as-of and source note"`

---

### Task 16: Payment success and Pro polish

**Files:**
- Modify: `src/app/account/welcome/page.tsx:96-108` (after `activateIfPaid`, fetch the active subscription → pass `paid: { planLabel, amountLabel, nextBillDate }` to `WelcomeSteps`), `welcome-steps.tsx:182-239` (step 0 "You're subscribed" panel when `paid`; skip re-showing the wizard on later visits by persisting `onboarding_completed_at` — Migration `20270102090200_users_onboarding.sql`)
- Modify: `src/components/consumer-nav.tsx:82-90` (account menu: Account · Sign out form to `/api/auth/logout`), `src/app/account/page.tsx:194` (keep)
- Modify: `src/lib/hamilton/monitor-data.ts:99-124` + `SignalFeed.tsx`, `MonitorFeedPreview.tsx` — signals whose `institutionId` is non-numeric are `sample: true`; render a "SAMPLE" chip and a feed header "Sample signals until you watch an institution"
- Modify: `src/app/(public)/institution/[id]/page.tsx:157-161,278-284` and `src/lib/institution-profile-links.ts:49-67` — pass `isPremium: canAccessPremium(user)`; `gate` uses `isPremium` (not `isAuthenticated`); show the Pro card on every profile (drop `showProCard={!thinProfile}`; keep `showAddSource`) with copy for thin profiles "Hamilton completes verification as part of your analysis"
- Ops (Stripe dashboard, both modes): rename product to "Fee Insight Pro — Seat License (Monthly/Annual)", set account public business name "Fee Insight", statement descriptor "FEE INSIGHT"; document in `docs/runbooks/stripe-branding.md`
- Tests: `welcome-steps.test.tsx` (paid panel renders plan/amount/next bill), `institution-profile-links.test.ts` (free logged-in user gets `/subscribe?from=`, premium gets `/pro/*`)

- [ ] **Step 1: Failing tests** as above. **Step 2: Implement.** **Step 3: Acceptance** (local, test Stripe): after paying, welcome shows "Seat License — Monthly · $499.99/mo · next bill Sep 17, 2026 · receipt sent to …"; second visit to `/account/welcome` goes to `/account`; `/institution/2813` as Pro shows Analyze/Brief/Scenario → `/pro/*`; header shows Sign out; monitor sample rows carry SAMPLE. **Step 4: Commit** `git commit -m "feat(pro): payment-confirmed welcome, sign-out in header, sample-signal labels, premium-aware profile CTAs"`

---

## Phase C — P2 hygiene

### Task 17: Real 404s, redirects, robots, sitemap, one 404 template

**Files:**
- Modify: `src/proxy.ts:16-22` (add `"/pricing": "/subscribe"`, `"/report": "/for-institutions#report"`, `"/request-report": "/for-institutions#report"`, `"/claim": "/submit-fees?claim=1"`; add lowercase-state canonical: `/research/state/oh` → `/research/state/OH` 301; city canonical from Task 15), `src/proxy.test.ts` (extend)
- Modify: `src/app/robots.ts:11` (`disallow: ["/admin/", "/api/", "/r/", "/account", "/pro/"]` + `allow: ["/api/v1/openapi.json"]`)
- Modify: `src/app/sitemap.ts` (add market-concentration, data-sources — Task 12 — and drop nothing else)
- Modify: `src/app/not-found.tsx` (render `ConsumerNav` + `CustomerFooter` and the same links as `(public)/not-found.tsx` plus "Request your report — $300" and "Submit a fee source"; delete the duplicate content in `(public)/not-found.tsx` by re-exporting the root one)
- Investigate/modify: `notFound()` returning HTTP 200 on `/institution/999999`, `/fees/not_a_fee`, `/research/state/ZZ`, `/research/district/999999` — cause is the route-level `loading.tsx` streaming shells (`institution/[id]/loading.tsx`, `fees/[category]/loading.tsx`, `research/state/[code]/loading.tsx`, `research/district/[id]/loading.tsx`); fix by validating the param **before** any awaited data (already true for `NaN` ids) and, for DB-existence checks, moving the existence check into `generateMetadata` **and** the page while removing those four `loading.tsx` files (keep skeletons inside the page via `<Suspense>` around the slow sections). Verify with `curl -s -o /dev/null -w '%{http_code}' https://feeinsight.com/institution/999999` → `404`.

- [ ] **Step 1: Failing proxy tests** for the four redirects and the lowercase-state canonical. **Step 2: Implement.** **Step 3: Acceptance** with curl for each URL in the dead-end register (D20, D30). **Step 4: Commit** `git commit -m "fix(seo): real 404 status, legacy redirects, robots/sitemap hygiene, one 404 template"`

---

### Task 18: Hydration and RSC errors

**Files:**
- Use: `src/lib/format.ts` from Task 7 (`formatNumber`, `formatMoney`, `formatDate`)
- Modify: bare `toLocaleString()` at `src/app/(public)/fees/[category]/page.tsx:172,173,256,290,333,373,413,414`, `src/app/(public)/fees/family-section.tsx:137`, `src/components/data-freshness.tsx:19` → `formatNumber`
- Modify: `src/components/public/distribution-chart.tsx` — wrap `ResponsiveContainer` in a fixed-height `div` (`h-64`) and import the chart with `next/dynamic` `{ ssr: false }` from the category/guide pages (`ChartLoading` placeholder of the same height)
- Create: `src/app/(public)/error.tsx` (client error boundary: "Something went wrong loading this page" + retry + links; logs to console.error once) and route-level `error.tsx` for `fees/[category]`, `institution/[id]`
- Modify: `src/lib/data-store/connection.ts` — set `DATABASE_POOL_MAX` default to 3 for serverless and add `statement_timeout` via `connection: { statement_timeout: 8000 }`; add `src/lib/data-store/connection.test.ts` for the pool-size parsing
- Investigate `/fees/stop_payment` #418: after the `formatNumber` change, re-run Playwright with `page.on('pageerror')`; if it persists, diff SSR vs client output of that page's tables (`hidden sm:table-cell` cells are fine; look for conditional rendering on `typeof window`)

- [ ] **Step 1: Failing test** `src/lib/data-store/connection.test.ts` (`resolvePoolMax(undefined) === 3`, `resolvePoolMax("8") === 8`, `resolvePoolMax("x") === 3`). **Step 2: Implement + replace every bare `toLocaleString()` with `formatNumber`.** **Step 3: Acceptance:** Playwright over `/privacy`, `/contact`, `/fees/stop_payment`, `/fees/prepaid_card_reload`, `/guides`, `/institutions`, `/research` with `pageerror` listener → zero errors across 5 loads each. **Step 4: Commit** `git commit -m "fix(render): locale-stable number formatting, client-only chart, error boundaries, safer DB pool"`

---

### Task 19: Mobile tables and guide layout

**Files:**
- Modify: `src/app/globals.css:992-1022` (`.table-scroll` gains a sticky first column: `.table-scroll th:first-child, .table-scroll td:first-child { position: sticky; left: 0; background: inherit; z-index: 1 }` and a visible right-edge affordance on touch)
- Modify: apply `table-scroll` wrapper to `research/state/[code]/page.tsx:186,239`, `research/district/[id]/page.tsx:242`, `fees/city/[state]/[city]/page.tsx:166,230`, `fees/city/[state]/page.tsx:86`, `src/components/server-sortable-table.tsx:67`, `src/components/sortable-table.tsx:91`
- Modify: `src/app/(public)/guides/[slug]/page.tsx` layout — on `< md` render order: intro → TOC → chart → top/bottom lists → sections → sources → next steps → 3 related guides (CSS `order-*` on the grid children; "More guides" limited to 3 related by shared `feeCategories`)
- Test: `guides-related.test.ts` (`relatedGuides(slug)` returns ≤3, never itself)

- [ ] **Step 1: Failing test** for `relatedGuides`. **Step 2: Implement.** **Step 3: Acceptance:** Playwright 390 px: state table first column stays visible while scrolling horizontally; guide page height drops ≥35% (from ~12,700 px). **Step 4: Commit** `git commit -m "fix(mobile): sticky-first-column scroll tables, shorter guide layout"`

---

### Task 20: `/fees` skeleton and cold starts

**Files:**
- Modify: `src/app/(public)/fees/loading.tsx` (parchment palette: `bg-[#F3EDE3]` blocks on `#FAF7F2`, same section shapes as the page), likewise `fees/[category]/loading.tsx`, `institution/[id]/loading.tsx` if kept after Task 17
- Modify: `src/app/(public)/fees/page.tsx` — wrap the spotlight/family sections in `<Suspense fallback={<FeesSkeleton/>}>` so header + h1 render immediately (removes the "content streams in late" flags)
- Modify: `src/app/(public)/institution/[id]/page.tsx` and `src/app/(public)/institutions/page.tsx` — cache the heavy, user-independent loads with `unstable_cache(fn, ["institution", id], { revalidate: 3600, tags: [\`institution:${id}\`] })` (profile data, fees, evidence) and `unstable_cache` for state summaries; keep `getCurrentUser()` outside the cache; call `revalidateTag` from Hamilton publish (`src/lib/agents/hamilton/publish.ts`) after publishing an institution
- Test: `institution-cache.test.ts` (cache key includes id; tag name format)

- [ ] **Step 1: Failing test** for the cache-key helper (`institutionCacheKey(22) → ["institution","22"]`, `institutionTag(22) → "institution:22"`). **Step 2: Implement.** **Step 3: Acceptance:** cold `/institution/3827` under 2 s on second cold-ish hit; `/fees` shows h1 within the first paint; rerun sim → zero LATE_CONTENT flags. **Step 4: Commit** `git commit -m "perf(public): suspense skeletons on /fees, cached institution and directory loads"`

---

## Verification & closure

- [ ] Run everything: `npm run lint && npx vitest run && npm run guard:legacy && npm run build`.
- [ ] Re-run the acceptance harness against production after deploy: `cd ~/code/active/feeschedule-hub && NODE_PATH=$PWD/node_modules node <scratchpad>/sim/run.js 3` then `node aggregate.js` — targets: institution views ≥ 100, `/subscribe` visitors < 40, EMPTY_STATE < 10, MAILTO_CTA = 0, LATE_CONTENT = 0, PAYWALL_ONLY = 0, MISSING_H1 = 0, no console errors.
- [ ] Re-walk the six persona journeys from the first audit (register → Stripe test → welcome; report request → email arrives; contact → email arrives; API key request → contact form; mobile drawer; directory search).
- [ ] Update `CLAUDE.md` Status/Next-action, and `docs/runbooks/` with the Stripe branding + email env runbook.
- [ ] Clean up audit test data (leads labelled "Journey Audit TEST", the two `jlgilmore2+feeinsight-journey-…` users, cancel test subscription `sub_1U5ZHgLlzQ8j0VdktC9Pnzg1`).

## Self-review (done while writing)

- **Coverage:** backlog #1→T1, #2→T2, #3→T3, #4→T4, #5→T5, #6→T6, #7→T7, #8→T8, #9→T9, #10→T10, #11→T11, #12→T12, #13→T13, #14→T14, #15→T15, #16→T16, #17→T17, #18→T18, #19→T19, #20→T20. Register items D06 (payment explanation) folded into T2; D22 (Hamilton CTAs drop on pricing) into T16; D31 (research islands) into T12; D25 (Start monthly targets, checkout=1 logged out) into T13/T6.
- **Placeholders:** none of "TBD/TODO/similar to"; every code step shows the code or the exact edit; ops steps show the exact commands.
- **Type consistency:** `CanonicalBenchmark` (T7) is what T8 annotates (`sample`, `outlier_flagged`) and T11 consumes; `MIN_N_PUBLISH`/`dedupePerInstitution` (T8) are used in T10/T11; `institutionBadge` (T9) is used in T9 only; `toCustomerFacingError` (T3) used in reports action + API route + AnalyzeWorkspace; `formatMoney`/`formatNumber` are created in T7 (`src/lib/format.ts`) and consumed by T11 and T18, so task order already satisfies the dependency.
