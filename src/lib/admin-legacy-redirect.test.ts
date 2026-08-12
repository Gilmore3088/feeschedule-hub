import { describe, expect, it } from "vitest";
import { buildLegacyAdminPath } from "./admin-legacy-redirect";

describe("buildLegacyAdminPath", () => {
  it("preserves filters from legacy bookmarks", () => {
    expect(
      buildLegacyAdminPath("/admin", {
        status: "failed",
        page: "2",
      }),
    ).toBe("/admin?status=failed&page=2");
  });

  it("preserves repeated values and empty filters", () => {
    expect(
      buildLegacyAdminPath("/admin/magellan", {
        state: ["CA", "OR"],
        q: "",
      }),
    ).toBe("/admin/magellan?state=CA&state=OR&q=");
  });

  it("allows bookmark values to override destination defaults", () => {
    expect(
      buildLegacyAdminPath(
        "/admin/knox",
        { queue: "decisions", reason: "outlier" },
        { queue: "fees" },
      ),
    ).toBe("/admin/knox?queue=decisions&reason=outlier");
  });

  it("retains query values already present in the destination", () => {
    expect(
      buildLegacyAdminPath("/admin/knox?queue=gold", { institution: "42" }),
    ).toBe("/admin/knox?queue=gold&institution=42");
  });
});
