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
      const finalUrl = page.url();
      const errText = await page
        .locator(".bg-red-50, [role=alert]")
        .first()
        .textContent({ timeout: 2_000 })
        .catch(() => null);
      throw new Error(
        `Admin login did not reach /admin (still at ${finalUrl})` +
          (errText && errText.trim()
            ? ` — UI message: "${errText.trim()}"`
            : " — no visible error message on the page") +
          ". Check BFI_E2E_USERNAME / BFI_E2E_PASSWORD against the target deploy.",
      );
    });

  await expect(page).not.toHaveURL(/\/admin\/login/);
  await page.context().storageState({ path: STORAGE });
});
