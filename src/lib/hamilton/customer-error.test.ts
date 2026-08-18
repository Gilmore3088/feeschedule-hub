import { describe, expect, it } from "vitest";
import { deriveThesisStatus, parseChatErrorBody, toCustomerFacingError } from "./customer-error";

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
  it("should_map_provider_circuit_open_to_paused_without_leaking_provider_detail", () => {
    const r = toCustomerFacingError(
      new Error(
        "Provider circuit is open: latest Anthropic credit-balance failure was 2026-08-13T02:00:00.000Z on hamilton.chat. Fix provider billing or move this route off Anthropic before retrying.",
      ),
    );
    expect(r.code).toBe("paused");
    expect(r.message).not.toMatch(/Anthropic|credit|circuit/i);
    expect(r.message).toMatch(/paused/i);
  });
  it("should_map_budget_blocked_errors_to_budget_code_without_leaking_policy_detail", () => {
    const r = toCustomerFacingError(
      new Error("Provider budget policy hamilton-default is disabled; configure explicit caps before provider calls can run."),
    );
    expect(r.code).toBe("budget");
    expect(r.message).not.toMatch(/policy|hamilton-default/i);
  });
});

describe("parseChatErrorBody", () => {
  it("should_parse_error_and_code_from_a_json_body", () => {
    expect(parseChatErrorBody('{"error":"Hamilton is paused.","code":"paused"}')).toEqual({
      error: "Hamilton is paused.",
      code: "paused",
    });
  });
  it("should_parse_error_without_a_code_field", () => {
    expect(parseChatErrorBody('{"error":"Something broke."}')).toEqual({
      error: "Something broke.",
      code: undefined,
    });
  });
  it("should_return_null_for_non_json_text", () => {
    expect(parseChatErrorBody("Failed to fetch the chat response.")).toBeNull();
  });
  it("should_return_null_for_json_without_an_error_field", () => {
    expect(parseChatErrorBody('{"message":"no error field here"}')).toBeNull();
  });
  it("should_return_null_for_a_json_array", () => {
    expect(parseChatErrorBody("[1,2,3]")).toBeNull();
  });
});

describe("deriveThesisStatus", () => {
  it("should_return_paused_for_an_emergency_stop_message", () => {
    expect(
      deriveThesisStatus("Emergency stop is active; hamilton monthly_pulse is blocked: Anthropic API credit balance is too low"),
    ).toBe("paused");
  });
  it("should_return_unavailable_for_a_generic_api_error_message", () => {
    expect(deriveThesisStatus("api_error: the model returned a 500")).toBe("unavailable");
  });
});
