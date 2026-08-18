import { describe, expect, it } from "vitest";
import { stripCheckoutParam, checkoutNotice } from "./checkout-url";
describe("checkout url helpers", () => {
  it("should_remove_only_the_checkout_param", () => {
    expect(stripCheckoutParam("/subscribe?plan=monthly&checkout=1&from=%2Fpro")).toBe("/subscribe?plan=monthly&from=%2Fpro");
    expect(stripCheckoutParam("/subscribe?checkout=1")).toBe("/subscribe");
  });
  it("should_detect_cancel_return", () => {
    expect(checkoutNotice({ checkout: "canceled" })).toBe("canceled");
    expect(checkoutNotice({ checkout: "1" })).toBeNull();
  });
});
