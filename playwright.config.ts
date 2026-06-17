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
    // Bound individual actions/navigations so a failed step reports in seconds
    // instead of hanging until the (long) per-test timeout.
    actionTimeout: 20_000,
    navigationTimeout: 30_000,
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
