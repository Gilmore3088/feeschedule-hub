import { describe, it, expect } from "vitest";
import { derivePersonalizationContext, PersonalizationContext } from "./personalization";
import { User } from "./auth";

describe("derivePersonalizationContext", () => {
  // Helper to create a user object with defaults
  const createUser = (overrides: Partial<User> = {}): User => ({
    id: 1,
    username: "testuser",
    display_name: "Test User",
    role: "premium",
    email: "test@example.com",
    stripe_customer_id: null,
    subscription_status: "active",
    institution_name: null,
    institution_type: null,
    asset_tier: null,
    state_code: null,
    fed_district: null,
    job_role: null,
    interests: null,
    ...overrides,
  });

  it("should return all fields when user has full profile", () => {
    const user = createUser({
      institution_name: "First National Bank",
      institution_type: "bank",
      asset_tier: "community",
      state_code: "NY",
    });

    const context = derivePersonalizationContext(user);

    expect(context).toEqual({
      institutionName: "First National Bank",
      fedDistrictLabel: "New York",
      assetTier: "Community ($100M-$1B)",
      peerGroupLabel: "Community Banks ($100M-$1B)",
    });
  });

  it("should return null fedDistrictLabel when state_code is null", () => {
    const user = createUser({
      institution_name: "First National Bank",
      institution_type: "bank",
      asset_tier: "community",
      state_code: null,
    });

    const context = derivePersonalizationContext(user);

    expect(context.fedDistrictLabel).toBeNull();
    expect(context.institutionName).toBe("First National Bank");
    expect(context.assetTier).toBe("Community ($100M-$1B)");
  });

  it("should return null assetTier when asset_tier is null", () => {
    const user = createUser({
      institution_name: "First National Bank",
      institution_type: "bank",
      asset_tier: null,
      state_code: "CA",
    });

    const context = derivePersonalizationContext(user);

    expect(context.assetTier).toBeNull();
    expect(context.fedDistrictLabel).toBe("San Francisco");
    expect(context.peerGroupLabel).toBe("Banks");
  });

  it("should return null peerGroupLabel when institution_type is null", () => {
    const user = createUser({
      institution_name: "First National Bank",
      institution_type: null,
      asset_tier: "community",
      state_code: "CA",
    });

    const context = derivePersonalizationContext(user);

    expect(context.peerGroupLabel).toBeNull();
    expect(context.institutionName).toBe("First National Bank");
    expect(context.assetTier).toBe("Community ($100M-$1B)");
  });

  it("should return 'Credit Unions' in peerGroupLabel when institution_type is credit_union", () => {
    const user = createUser({
      institution_name: "Community Credit Union",
      institution_type: "credit_union",
      asset_tier: "midsize",
      state_code: "TX",
    });

    const context = derivePersonalizationContext(user);

    expect(context.peerGroupLabel).toBe("Mid-Size Credit Unions ($1B-$10B)");
  });

  it("should return null fedDistrictLabel when state_code is unknown", () => {
    const user = createUser({
      institution_name: "Mystery Bank",
      institution_type: "bank",
      asset_tier: "regional",
      state_code: "ZZ", // Unknown state code
    });

    const context = derivePersonalizationContext(user);

    expect(context.fedDistrictLabel).toBeNull();
    expect(context.assetTier).toBe("Regional ($10B-$250B)");
  });

  it("should be a pure function (no side effects, deterministic)", () => {
    const user = createUser({
      institution_name: "Test Bank",
      institution_type: "bank",
      asset_tier: "micro",
      state_code: "ME",
    });

    const result1 = derivePersonalizationContext(user);
    const result2 = derivePersonalizationContext(user);

    expect(result1).toEqual(result2);
  });

  it("should handle all FDIC tier labels correctly", () => {
    const tiers = ["micro", "community", "midsize", "regional", "mega"] as const;
    const expectedLabels = [
      "Micro (<$100M)",
      "Community ($100M-$1B)",
      "Mid-Size ($1B-$10B)",
      "Regional ($10B-$250B)",
      "Mega (>$250B)",
    ];

    tiers.forEach((tier, idx) => {
      const user = createUser({
        institution_type: "bank",
        asset_tier: tier,
        state_code: "NY",
      });

      const context = derivePersonalizationContext(user);
      expect(context.assetTier).toBe(expectedLabels[idx]);
    });
  });

  it("should handle all Fed districts correctly", () => {
    const stateToExpectedDistrict: Record<string, string> = {
      CT: "Boston",
      NY: "New York",
      PA: "Philadelphia",
      OH: "Cleveland",
      VA: "Richmond",
      GA: "Atlanta",
      IL: "Chicago",
      MO: "St. Louis",
      MN: "Minneapolis",
      KS: "Kansas City",
      TX: "Dallas",
      CA: "San Francisco",
    };

    Object.entries(stateToExpectedDistrict).forEach(([state, district]) => {
      const user = createUser({
        institution_type: "bank",
        asset_tier: "community",
        state_code: state,
      });

      const context = derivePersonalizationContext(user);
      expect(context.fedDistrictLabel).toBe(district);
    });
  });
});
