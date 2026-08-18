import { describe, expect, it } from "vitest";
import { registerErrorMessage, REGISTER_FALLBACK_CTA } from "./register-error";

describe("registerErrorMessage", () => {
  it("should_name_the_failing_step_without_leaking_internals", () => {
    expect(registerErrorMessage("stripe")).toMatch(/billing account/i);
    expect(registerErrorMessage("db")).toMatch(/save your account/i);
    expect(registerErrorMessage("duplicate")).toBe("An account with this email already exists.");
  });
  it("should_offer_a_human_fallback", () => {
    expect(REGISTER_FALLBACK_CTA.href).toBe("/contact?type=pro");
    expect(REGISTER_FALLBACK_CTA.label).toMatch(/set up your seat/i);
  });
});
