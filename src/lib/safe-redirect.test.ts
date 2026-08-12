import { describe, expect, it } from "vitest";
import { sanitizeInternalRedirect } from "./safe-redirect";

describe("sanitizeInternalRedirect", () => {
  it("preserves an internal path, query, and fragment", () => {
    expect(
      sanitizeInternalRedirect("/admin/knox?queue=fees#review", "/admin"),
    ).toBe("/admin/knox?queue=fees#review");
  });

  it.each([
    "https://attacker.example/admin",
    "//attacker.example/admin",
    "/\\attacker.example/admin",
    "javascript:alert(1)",
  ])("rejects unsafe destination %s", (destination) => {
    expect(sanitizeInternalRedirect(destination, "/admin")).toBe("/admin");
  });

  it("uses the fallback when no destination is supplied", () => {
    expect(sanitizeInternalRedirect(undefined, "/account")).toBe("/account");
  });
});
