import { describe, expect, it } from "vitest";
import { toCustomerFacingError } from "./customer-error";
describe("toCustomerFacingError", () => {
  it("should_map_emergency_stop_to_paused_without_leaking_reason", () => {
    const r = toCustomerFacingError(new Error("Emergency stop is active; hamilton generate_report_section is blocked: Anthropic API credit balance is too low"));
    expect(r.code).toBe("paused");
    expect(r.message).not.toMatch(/Anthropic|credit|extractor/i);
    expect(r.message).toMatch(/paused/i);
  });
  it("should_map_unknown_errors_generically", () => {
    expect(toCustomerFacingError(new Error("boom")).code).toBe("unknown");
  });
});
