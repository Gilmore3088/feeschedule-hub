import { describe, expect, it } from "vitest";
import { normalizeStripeKey } from "./stripe";

describe("normalizeStripeKey", () => {
  it("should_strip_trailing_newline_and_whitespace", () => {
    expect(normalizeStripeKey("sk_test_abc\n")).toBe("sk_test_abc");
    expect(normalizeStripeKey("  sk_test_abc \r\n")).toBe("sk_test_abc");
  });
  it("should_throw_when_missing_or_blank", () => {
    expect(() => normalizeStripeKey(undefined)).toThrow("STRIPE_SECRET_KEY is not configured");
    expect(() => normalizeStripeKey(" \n")).toThrow("STRIPE_SECRET_KEY is not configured");
  });
});
