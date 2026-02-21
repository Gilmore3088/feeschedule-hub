import { describe, it, expect } from "vitest";
import {
  hashPassword,
  verifyPassword,
  verifySessionToken,
  verifySubscriptionCookieEdge,
} from "./subscriber-auth";

describe("subscriber password hashing", () => {
  it("hashes and verifies a password", async () => {
    const hash = await hashPassword("test-password-123");
    expect(hash).toContain(":");
    expect(hash.split(":")).toHaveLength(2);

    const valid = await verifyPassword("test-password-123", hash);
    expect(valid).toBe(true);
  });

  it("rejects wrong password", async () => {
    const hash = await hashPassword("correct-password");
    const valid = await verifyPassword("wrong-password", hash);
    expect(valid).toBe(false);
  });

  it("produces different hashes for same password (random salt)", async () => {
    const h1 = await hashPassword("same-password");
    const h2 = await hashPassword("same-password");
    expect(h1).not.toBe(h2);
  });
});

describe("verifySubscriptionCookieEdge", () => {
  function makeToken(payload: Record<string, unknown>): string {
    const json = JSON.stringify(payload);
    const encoded = Buffer.from(json).toString("base64url");
    return `${encoded}.fakesig`;
  }

  it("returns active subscription info", () => {
    const token = makeToken({
      subscriptionActive: true,
      plan: "starter",
      exp: Date.now() + 60000,
    });
    const result = verifySubscriptionCookieEdge(token);
    expect(result).toEqual({ active: true, plan: "starter" });
  });

  it("returns inactive for expired token", () => {
    const token = makeToken({
      subscriptionActive: true,
      plan: "starter",
      exp: Date.now() - 60000,
    });
    const result = verifySubscriptionCookieEdge(token);
    expect(result).toBeNull();
  });

  it("returns null for malformed token", () => {
    expect(verifySubscriptionCookieEdge("garbage")).toBeNull();
    expect(verifySubscriptionCookieEdge("")).toBeNull();
  });

  it("handles missing fields gracefully", () => {
    const token = makeToken({ exp: Date.now() + 60000 });
    const result = verifySubscriptionCookieEdge(token);
    expect(result).toEqual({ active: false, plan: null });
  });
});

describe("verifySessionToken", () => {
  it("returns null for empty token", () => {
    expect(verifySessionToken("")).toBeNull();
  });

  it("returns null for token without separator", () => {
    expect(verifySessionToken("noseparator")).toBeNull();
  });

  it("returns null for tampered token", () => {
    const payload = JSON.stringify({
      organizationId: 1,
      memberId: 1,
      email: "test@test.com",
      orgName: "Test",
      orgSlug: "test",
      plan: null,
      subscriptionActive: false,
      exp: Date.now() + 60000,
    });
    const encoded = Buffer.from(payload).toString("base64url");
    // Use a fake signature
    const result = verifySessionToken(`${encoded}.0000000000`);
    expect(result).toBeNull();
  });
});
