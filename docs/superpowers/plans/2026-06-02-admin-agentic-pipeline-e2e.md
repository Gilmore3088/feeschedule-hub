# Admin Agentic-Pipeline E2E Smoke Test — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Playwright on-demand smoke test that logs into the deployed admin UI, triggers the agentic data pipeline via the Command Center ("Run Atlas for one state" → `atlas_dispatch` Modal), and asserts the run is accepted + executes.

**Architecture:** A minimal `@playwright/test` harness targeting the live deploy (`baseURL` from env). A `setup` project logs in via the real `/admin/login` form and saves a `storageState` cookie; the main `chromium` project reuses it. One spec drives the Command Center, hard-asserts the Atlas trigger resolves to "✓ ok", and logs any fee-count delta as a soft signal. Not wired into CI.

**Tech Stack:** TypeScript, `@playwright/test` (chromium), Next.js admin UI (server actions), Modal endpoints.

---

## Design references (read before starting)
- Spec: `docs/superpowers/specs/2026-06-02-admin-agentic-pipeline-e2e-design.md`
- Login form: `src/app/admin/login/login-form.tsx` (fields `#username`, `#password`, button "Sign in"). `loginAction` (`src/app/admin/login/actions.ts`) calls `login(username, password)` which validates against the `users` table and `redirect("/admin")` on success.
- Command Center controls: `src/app/admin/command/controls.tsx` — "Run Atlas for one state" card has a state `<input placeholder="TX">`, a number `<input type=number>` (batch size), a "Run" button, and a `ResultPane` rendering `✓ ok` / `✗ failed` + `cmd` + `error`.
- Command Center tiles: `src/app/admin/command/page.tsx` — `StatTile label="Tier 1 fees_raw"` and `"Tier 2 fees_verified"`.

## Environment contract (the test reads these; never hardcode)
- `BFI_E2E_URL` — target base URL. Default `https://bankfeeindex.com`.
- `BFI_E2E_USERNAME` — admin account username/email. Default `admin`. Must be a real active admin in the target DB.
- `BFI_E2E_PASSWORD` — that account's password (the value of `BFI_ADMIN_PASSWORD`). **Required**; test fails fast if missing.
- `BFI_E2E_STATE` — 2-letter state for the Atlas run. Default `VT` (low volume → bounded mutation).
- `BFI_E2E_ATLAS_SIZE` — `size_per_state`. Default `2`.

## File structure
```
playwright.config.ts                       # CREATE — harness config, two projects
tests/e2e/README.md                        # CREATE — how to run + expected outcomes
tests/e2e/auth.setup.ts                    # CREATE — login, save storageState
tests/e2e/admin-agentic-pipeline.spec.ts   # CREATE — the smoke test
package.json                               # MODIFY — devDep + test:e2e script
.gitignore                                 # MODIFY — ignore auth state + reports
```

---

## Task 1: Scaffold the Playwright harness

**Files:**
- Install: `@playwright/test` (dev) + chromium browser
- Create: `playwright.config.ts`
- Modify: `package.json` (script), `.gitignore`

- [ ] **Step 1: Install @playwright/test + chromium**

Run:
```bash
npm install -D @playwright/test
npx playwright install chromium
```
Expected: `@playwright/test` added to devDependencies; chromium downloads.

- [ ] **Step 2: Create `playwright.config.ts`**

```ts
import { defineConfig, devices } from "@playwright/test";

const BASE_URL = process.env.BFI_E2E_URL ?? "https://bankfeeindex.com";

export default defineConfig({
  testDir: "tests/e2e",
  // Real Modal/agentic runs are slow; allow up to 10 min per test.
  timeout: 10 * 60 * 1000,
  expect: { timeout: 30 * 1000 },
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "tests/e2e/.auth/admin.json",
      },
      dependencies: ["setup"],
      testIgnore: /auth\.setup\.ts/,
    },
  ],
});
```

- [ ] **Step 3: Add the `test:e2e` script to `package.json`**

In the `"scripts"` block, add:
```json
"test:e2e": "playwright test"
```

- [ ] **Step 4: Ignore auth state + Playwright artifacts in `.gitignore`**

Append:
```gitignore
# Playwright e2e
/test-results/
/playwright-report/
tests/e2e/.auth/
```

- [ ] **Step 5: Verify Playwright is installed**

Run: `npx playwright --version`
Expected: prints a version (e.g. `Version 1.x.x`).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json playwright.config.ts .gitignore
git commit -m "test(e2e): scaffold Playwright harness for deployed smoke tests"
```

---

## Task 2: Admin login setup (saves storageState)

**Files:**
- Create: `tests/e2e/auth.setup.ts`

- [ ] **Step 1: Write `tests/e2e/auth.setup.ts`**

```ts
import { test as setup, expect } from "@playwright/test";
import path from "node:path";

const STORAGE = path.join(__dirname, ".auth", "admin.json");

setup("authenticate as admin", async ({ page }) => {
  const username = process.env.BFI_E2E_USERNAME ?? "admin";
  const password = process.env.BFI_E2E_PASSWORD;
  if (!password) {
    throw new Error(
      "BFI_E2E_PASSWORD is required: the password of a real active admin " +
        "account in the target DB. Also set BFI_E2E_USERNAME (default 'admin') " +
        "if your admin uses a different username/email.",
    );
  }

  await page.goto("/admin/login");
  await page.locator("#username").fill(username);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();

  // loginAction redirects to /admin on success; on failure it stays on
  // /admin/login and shows an error. Wait for a non-login /admin URL.
  await page
    .waitForURL(/\/admin(?!\/login)/, { timeout: 30_000 })
    .catch(async () => {
      const err = await page
        .getByText(/invalid username or password|required/i)
        .first()
        .textContent()
        .catch(() => null);
      throw new Error(
        `Admin login did not reach /admin${err ? ` — UI error: "${err}"` : ""}. ` +
          "Check BFI_E2E_USERNAME / BFI_E2E_PASSWORD against the target deploy.",
      );
    });

  await expect(page).not.toHaveURL(/\/admin\/login/);
  await page.context().storageState({ path: STORAGE });
});
```

- [ ] **Step 2: Run the setup against the deploy (requires env)**

Run:
```bash
BFI_E2E_PASSWORD='<admin-password>' npx playwright test --project=setup
```
Expected (success): `1 passed`, and `tests/e2e/.auth/admin.json` is created.
Expected (known failure modes, reported clearly): a thrown message about login not reaching `/admin` (wrong creds) or missing `BFI_E2E_PASSWORD`.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/auth.setup.ts
git commit -m "test(e2e): admin login setup that saves storageState"
```

---

## Task 3: The agentic-pipeline smoke spec

**Files:**
- Create: `tests/e2e/admin-agentic-pipeline.spec.ts`

- [ ] **Step 1: Write `tests/e2e/admin-agentic-pipeline.spec.ts`**

```ts
import { test, expect, type Page } from "@playwright/test";

const STATE = (process.env.BFI_E2E_STATE ?? "VT").toUpperCase();
const SIZE = process.env.BFI_E2E_ATLAS_SIZE ?? "2";

function parseCount(text: string | null): number | null {
  if (!text) return null;
  const m = text.replace(/,/g, "").match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}

// Best-effort read of a Command Center tier tile by its label. Soft signal
// only — never assert on it.
async function readTier(page: Page, label: string): Promise<number | null> {
  try {
    const tile = page.locator("div", { hasText: label }).last();
    return parseCount(await tile.textContent());
  } catch {
    return null;
  }
}

const n = (v: number | null) => v ?? 0;

test("admin triggers the agentic pipeline (Run Atlas) and it is accepted", async ({
  page,
}) => {
  // 1. Baseline tier counts (soft signal).
  await page.goto("/admin/command");
  const baseRaw = await readTier(page, "Tier 1 fees_raw");
  const baseVerified = await readTier(page, "Tier 2 fees_verified");
  console.log(`[baseline] fees_raw=${baseRaw} fees_verified=${baseVerified}`);

  // 2. Locate the "Run Atlas for one state" card.
  const atlasCard = page
    .locator("div.rounded-lg", { hasText: "Run Atlas for one state" })
    .first();
  await expect(atlasCard).toBeVisible();

  // 3. Bound the run: small state + small size.
  await page.getByPlaceholder("TX").fill(STATE); // globally-unique state input
  await atlasCard.getByRole("spinbutton").fill(SIZE);

  // 4. Trigger (button reads "Run" when idle, "Running…" while pending).
  await atlasCard.getByRole("button", { name: /^run$/i }).click();

  // 5. HARD ASSERT: a result resolves and it is "✓ ok". Wait beyond the 120s
  //    server-action timeout in callModalEndpoint.
  await expect(atlasCard.getByText(/✓ ok|✗ failed/)).toBeVisible({
    timeout: 135_000,
  });
  const pane = (await atlasCard.textContent()) ?? "";
  expect(
    pane,
    `Atlas dispatch was not accepted. Result pane:\n${pane}\n\n` +
      "This test deliberately surfaces real breaks here — common causes: " +
      "requireAuth('admin') denying the Command Center action, or " +
      "BFI_MODAL_WORKERS_BASE_URL unset on the deploy.",
  ).toContain("✓ ok");

  // 6. SOFT SIGNAL: re-read tiles and log any delta. Not gating — a real run
  //    may legitimately find 0 new fees, and Modal work lands asynchronously.
  await page.goto("/admin/command");
  const afterRaw = await readTier(page, "Tier 1 fees_raw");
  const afterVerified = await readTier(page, "Tier 2 fees_verified");
  console.log(
    `[after] fees_raw=${afterRaw} (Δ ${n(afterRaw) - n(baseRaw)}) ` +
      `fees_verified=${afterVerified} (Δ ${n(afterVerified) - n(baseVerified)})`,
  );
});
```

- [ ] **Step 2: Run the full smoke test against the deploy (requires env)**

Run:
```bash
BFI_E2E_PASSWORD='<admin-password>' npx playwright test --project=chromium
```
Expected (healthy deploy): `1 passed`; logs show baseline + after counts; the Atlas result pane shows `✓ ok`.
Expected (test doing its job): `1 failed` with the result-pane text quoted — e.g. an auth denial from `requireAuth('admin')` or `BFI_MODAL_WORKERS_BASE_URL not set`. A red result here means the admin acquisition flow is broken in the deploy, which is the signal we want.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/admin-agentic-pipeline.spec.ts
git commit -m "test(e2e): agentic-pipeline smoke test (Run Atlas trigger accepted)"
```

---

## Task 4: Document how to run it

**Files:**
- Create: `tests/e2e/README.md`

- [ ] **Step 1: Write `tests/e2e/README.md`**

````markdown
# Admin E2E smoke tests (Playwright)

On-demand smoke tests against a **deployed** Bank Fee Index admin UI. They log
in as a real admin and drive the agentic data pipeline. They are **not** run in
CI — they hit the live deploy + real Modal + real Supabase and write to the DB.

## Run

```bash
# Required: a real active admin account's password in the target DB.
export BFI_E2E_PASSWORD='…'

# Optional overrides:
export BFI_E2E_URL='https://bankfeeindex.com'   # default
export BFI_E2E_USERNAME='admin'                 # default
export BFI_E2E_STATE='VT'                        # default (bounded)
export BFI_E2E_ATLAS_SIZE='2'                    # default

npm run test:e2e
```

## What it does

`admin-agentic-pipeline.spec.ts`: logs in → `/admin/command` → "Run Atlas for
one state" (small state + size) → asserts the trigger resolves to `✓ ok`. A
fee-count delta is logged as a soft signal, not a pass/fail (a real run may find
0 new fees, and Modal work lands asynchronously).

## A red result may be correct

The test deliberately surfaces real production breaks at the trigger step:
- `requireAuth("admin")` — `"admin"` is a role, not a `Permission`, so it may
  deny the Command Center action for everyone.
- `BFI_MODAL_WORKERS_BASE_URL` unset on the deploy.
If either is live, the test fails with the result-pane text quoted.
````

- [ ] **Step 2: Commit**

```bash
git add tests/e2e/README.md
git commit -m "docs(e2e): how to run the admin agentic-pipeline smoke test"
```

---

## Self-review notes
- **Spec coverage:** harness (Task 1), auth fixture/storageState (Task 2), the spec with hard "✓ ok" assertion + soft delta log (Task 3), safety/env/on-demand docs (Task 4), risk-surfacing messages (Tasks 2–3). All spec sections covered.
- **No placeholders:** every code block is complete; commands have expected output.
- **Type/selector consistency:** `#username`/`#password`/"Sign in" match `login-form.tsx`; `getByPlaceholder("TX")` + the spinbutton + `^run$` button + `✓ ok`/`✗ failed` text match `controls.tsx`/`ResultPane`; tier labels match `page.tsx`. `storageState` path `tests/e2e/.auth/admin.json` is identical in config + setup.
- **Known constraint:** login is DB-backed (`users` table), so `BFI_E2E_PASSWORD` must be a real account's password, not merely the `BFI_ADMIN_PASSWORD` env unless that account was seeded with it.
