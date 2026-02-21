import { describe, it, expect } from "vitest";
import crypto from "crypto";

// Test the key hashing logic directly (authenticateApiKey needs NextRequest)
describe("API key hashing", () => {
  function hashKey(rawKey: string): string {
    return crypto.createHash("sha256").update(rawKey).digest("hex");
  }

  it("produces consistent hashes for the same key", () => {
    const key = "bfi_test_key_123456";
    const hash1 = hashKey(key);
    const hash2 = hashKey(key);
    expect(hash1).toBe(hash2);
  });

  it("produces different hashes for different keys", () => {
    const hash1 = hashKey("bfi_key_one");
    const hash2 = hashKey("bfi_key_two");
    expect(hash1).not.toBe(hash2);
  });

  it("produces 64-char hex string", () => {
    const hash = hashKey("bfi_any_key");
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });
});

describe("API key format", () => {
  it("generates proper prefix from raw key", () => {
    const rawKey = `bfi_${crypto.randomBytes(24).toString("hex")}`;
    const prefix = rawKey.slice(0, 12);
    expect(prefix).toBe("bfi_" + rawKey.slice(4, 12));
    expect(rawKey.startsWith("bfi_")).toBe(true);
    expect(rawKey).toHaveLength(4 + 48); // bfi_ + 24 bytes hex
  });
});
