import { describe, expect, it } from "vitest";
import { resolvePostLoginRedirect, sanitizeInternalRedirect } from "./safe-redirect";

describe("sanitizeInternalRedirect", () => {
  it("preserves an internal path, query, and fragment", () => {
    expect(
      sanitizeInternalRedirect("/admin/knox?queue=decisions#review", "/admin"),
    ).toBe("/admin/knox?queue=decisions#review");
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

describe("resolvePostLoginRedirect", () => {
  it("preserves Pro institution context for admins and analysts", () => {
    const destination = "/pro/research?prompt=institution&instId=2945";

    expect(resolvePostLoginRedirect(destination, "admin")).toBe(destination);
    expect(resolvePostLoginRedirect(destination, "analyst")).toBe(destination);
  });

  it("keeps admin users in admin by default", () => {
    expect(resolvePostLoginRedirect("/account", "admin")).toBe("/admin");
  });

  it("prevents non-admin users from landing in admin", () => {
    expect(resolvePostLoginRedirect("/admin/quality", "premium")).toBe("/account");
  });

  it("preserves non-admin Pro destinations for downstream subscription gates", () => {
    expect(resolvePostLoginRedirect("/pro/analyze?instId=2945", "premium")).toBe(
      "/pro/analyze?instId=2945",
    );
  });
});
