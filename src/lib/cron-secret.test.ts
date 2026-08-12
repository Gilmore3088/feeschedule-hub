import { describe, expect, it } from "vitest";
import { matchesConfiguredCronSecret } from "./cron-secret";

describe("matchesConfiguredCronSecret", () => {
  it("matches a dedicated report cron secret", () => {
    expect(matchesConfiguredCronSecret("secret", {
      REPORT_CRON_SECRET: "secret",
    })).toBe(true);
  });

  it("normalizes deployment-injected line endings", () => {
    expect(matchesConfiguredCronSecret("secret", {
      REPORT_CRON_SECRET: "secret\n",
    })).toBe(true);
  });

  it("supports the legacy revalidation token", () => {
    expect(matchesConfiguredCronSecret("legacy", {
      BFI_REVALIDATE_TOKEN: "legacy",
    })).toBe(true);
  });

  it("rejects missing and incorrect credentials", () => {
    expect(matchesConfiguredCronSecret(null, { REPORT_CRON_SECRET: "secret" })).toBe(false);
    expect(matchesConfiguredCronSecret("wrong", { REPORT_CRON_SECRET: "secret" })).toBe(false);
  });
});
