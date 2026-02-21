import { describe, it, expect } from "vitest";
import {
  canTransition,
  canSetStatus,
  ALLOWED_TRANSITIONS,
  PUBLISH_PERMISSIONS,
} from "./article-permissions";
import type { Role } from "./article-permissions";
import type { ArticleStatus } from "@/lib/crawler-db/types";

const ALL_STATUSES: ArticleStatus[] = ["draft", "review", "approved", "published", "rejected"];
const ALL_ROLES: Role[] = ["viewer", "analyst", "admin"];

describe("canTransition", () => {
  it("allows draft -> review", () => {
    expect(canTransition("draft", "review")).toBe(true);
  });

  it("allows draft -> rejected", () => {
    expect(canTransition("draft", "rejected")).toBe(true);
  });

  it("blocks draft -> published (must go through review/approved)", () => {
    expect(canTransition("draft", "published")).toBe(false);
  });

  it("allows review -> approved", () => {
    expect(canTransition("review", "approved")).toBe(true);
  });

  it("allows review -> rejected", () => {
    expect(canTransition("review", "rejected")).toBe(true);
  });

  it("allows review -> draft (send back)", () => {
    expect(canTransition("review", "draft")).toBe(true);
  });

  it("allows approved -> published", () => {
    expect(canTransition("approved", "published")).toBe(true);
  });

  it("allows published -> approved (unpublish)", () => {
    expect(canTransition("published", "approved")).toBe(true);
  });

  it("blocks published -> draft (must unpublish first)", () => {
    expect(canTransition("published", "draft")).toBe(false);
  });

  it("allows rejected -> draft (retry)", () => {
    expect(canTransition("rejected", "draft")).toBe(true);
  });

  it("blocks rejected -> published (must go through full flow)", () => {
    expect(canTransition("rejected", "published")).toBe(false);
  });

  it("blocks self-transitions for all statuses", () => {
    for (const status of ALL_STATUSES) {
      expect(canTransition(status, status)).toBe(false);
    }
  });

  it("every status has at least one valid transition", () => {
    for (const status of ALL_STATUSES) {
      expect(ALLOWED_TRANSITIONS[status].length).toBeGreaterThan(0);
    }
  });
});

describe("canSetStatus (role permissions)", () => {
  it("viewer cannot set any status", () => {
    for (const status of ALL_STATUSES) {
      expect(canSetStatus("viewer", status)).toBe(false);
    }
  });

  it("analyst can set draft, review, approved, rejected", () => {
    expect(canSetStatus("analyst", "draft")).toBe(true);
    expect(canSetStatus("analyst", "review")).toBe(true);
    expect(canSetStatus("analyst", "approved")).toBe(true);
    expect(canSetStatus("analyst", "rejected")).toBe(true);
  });

  it("analyst CANNOT publish", () => {
    expect(canSetStatus("analyst", "published")).toBe(false);
  });

  it("admin can set all statuses including published", () => {
    for (const status of ALL_STATUSES) {
      expect(canSetStatus("admin", status)).toBe(true);
    }
  });

  it("only admin can publish", () => {
    const rolesAllowed = ALL_ROLES.filter((r) => canSetStatus(r, "published"));
    expect(rolesAllowed).toEqual(["admin"]);
  });

  it("every status has at least one permitted role", () => {
    for (const status of ALL_STATUSES) {
      expect(PUBLISH_PERMISSIONS[status].length).toBeGreaterThan(0);
    }
  });
});

describe("full workflow validation", () => {
  it("admin can walk the happy path: draft -> review -> approved -> published", () => {
    const role: Role = "admin";
    const path: ArticleStatus[] = ["draft", "review", "approved", "published"];

    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransition(path[i], path[i + 1])).toBe(true);
      expect(canSetStatus(role, path[i + 1])).toBe(true);
    }
  });

  it("analyst can advance to approved but not publish", () => {
    const role: Role = "analyst";
    expect(canTransition("draft", "review")).toBe(true);
    expect(canSetStatus(role, "review")).toBe(true);

    expect(canTransition("review", "approved")).toBe(true);
    expect(canSetStatus(role, "approved")).toBe(true);

    expect(canTransition("approved", "published")).toBe(true);
    expect(canSetStatus(role, "published")).toBe(false);
  });

  it("rejected articles can be recycled: rejected -> draft -> review", () => {
    expect(canTransition("rejected", "draft")).toBe(true);
    expect(canTransition("draft", "review")).toBe(true);
  });
});
