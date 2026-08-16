import { describe, expect, it } from "vitest";
import {
  normalizeCityInstitutionRow,
  normalizeCitySummaryRow,
} from "./geographic";

describe("city geographic read-model normalization", () => {
  it("converts Postgres numeric strings before public route formatting", () => {
    expect(
      normalizeCityInstitutionRow({
        id: 42,
        institution_name: "Example Bank",
        charter_type: "bank",
        asset_size: "125000",
        fee_count: "4",
        overdraft: "35.00",
        monthly_maintenance: "5.50",
        nsf: null,
        atm_non_network: "3",
      }),
    ).toEqual({
      id: 42,
      institution_name: "Example Bank",
      charter_type: "bank",
      asset_size: 125000,
      fee_count: 4,
      overdraft: 35,
      monthly_maintenance: 5.5,
      nsf: null,
      atm_non_network: 3,
    });
  });

  it("converts city summary counts so totals add numerically", () => {
    expect(
      normalizeCitySummaryRow({
        city: "Dothan",
        state_code: "AL",
        institution_count: "12",
        with_fees: "3",
      }),
    ).toEqual({
      city: "Dothan",
      state_code: "AL",
      institution_count: 12,
      with_fees: 3,
    });
  });
});
