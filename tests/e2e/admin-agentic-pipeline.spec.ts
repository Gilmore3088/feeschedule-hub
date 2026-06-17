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
