import { describe, expect, it } from "vitest";
import { canAccessApiKey, canAccessPremium, canExportData } from "./access";
import type { User } from "./auth";

const premiumUser: User = {
  id: 1,
  username: "pro-user",
  display_name: "Pro User",
  role: "premium",
  email: "pro@example.com",
  stripe_customer_id: "cus_123",
  subscription_status: "active",
  institution_name: null,
  institution_type: null,
  asset_tier: null,
  state_code: null,
  fed_district: null,
  job_role: null,
  interests: null,
};

describe("access policy", () => {
  it("keeps app/export access separate from self-serve API key controls", () => {
    expect(canAccessPremium(premiumUser)).toBe(true);
    expect(canExportData(premiumUser)).toBe(true);
    expect(canAccessApiKey(premiumUser)).toBe(false);
  });
});
