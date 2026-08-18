import { describe, expect, it } from "vitest";
import { isLeadEmailConfigured } from "./config";
describe("isLeadEmailConfigured", () => {
  it("should_require_key_and_from", () => {
    expect(isLeadEmailConfigured({})).toBe(false);
    expect(isLeadEmailConfigured({ RESEND_API_KEY: "re_x" })).toBe(false);
    expect(isLeadEmailConfigured({ RESEND_API_KEY: "re_x", EMAIL_FROM: "Fee Insight <hello@bankfeeindex.com>" })).toBe(true);
    expect(isLeadEmailConfigured({ RESEND_API_KEY: " ", REPORT_REQUEST_EMAIL_FROM: "x@y" })).toBe(false);
  });
});
