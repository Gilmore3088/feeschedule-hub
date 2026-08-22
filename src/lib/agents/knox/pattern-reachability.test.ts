import { describe, expect, it } from "vitest";

import { FEE_PATTERNS, classifySegment } from "@/lib/fee-classification";

/**
 * `classifySegment` resolves with `FEE_PATTERNS.find(...)` — first match wins.
 * A specific key placed below a generic pattern that subsumes it can never fire
 * and silently mis-files every row it should have claimed. That is exactly how
 * daily overdraft caps were landing on the `overdraft` key and widening its
 * published range.
 *
 * These tests are the guard. Adding a pattern without adding a probe here means
 * the reachability test fails, by design.
 */

/** One representative schedule line per key, as it appears in real documents. */
const PROBES: Record<string, string> = {
  od_daily_cap: "Maximum overdraft fee per day $250.00",
  nsf_daily_cap: "Maximum NSF charges per day - not to exceed $105.00",
  continuous_od: "Sustained Overdraft Fee (after 5 days) $30.00",
  od_protection_transfer: "Overdraft Protection Transfer Fee $10.00",
  od_line_of_credit: "Overdraft Line of Credit advance $15.00",
  overdraft: "Overdraft Fee (per item paid) $32.00",
  nsf: "NSF Return Item Fee $32.00",
  ira_administration: "IRA annual maintenance $25.00",
  ira_termination: "IRA termination fee $50.00",
  monthly_maintenance: "Monthly maintenance fee $12.00",
  minimum_balance: "Minimum balance fee $10.00",
  atm_international: "International ATM withdrawal $5.00",
  balance_inquiry: "Balance inquiry at ATM $1.00",
  atm_non_network: "Non-network ATM withdrawal $2.50",
  cashiers_check: "Cashier's check $8.00",
  money_order: "Money order $3.00",
  counter_check: "Temporary Checks (3 per page) $2.00",
  zelle_fee: "Zelle transfer $0.50",
  stop_payment: "Stop payment order $30.00",
  wire_domestic_outgoing: "Outgoing domestic wire $25.00",
  wire_domestic_incoming: "Incoming domestic wire $15.00",
  wire_intl_outgoing: "International outgoing wire $45.00",
  wire_intl_incoming: "Foreign incoming wire transfer $20.00",
  card_replacement: "Debit card replacement $10.00",
  rush_card: "Rush card delivery $35.00",
  card_foreign_txn: "Foreign transaction fee $3.00",
  paper_statement: "Paper statement fee $3.00",
  estatement_fee: "E-statement fee $1.00",
  check_printing: "Check printing (per box) $25.00",
  check_image: "Check copy $5.00",
  check_cashing: "Check cashing (non-member) $10.00",
  ach_return: "ACH returned item $15.00",
  ach_origination: "ACH origination batch $10.00",
  bill_pay: "Bill pay monthly $5.95",
  mobile_deposit: "Mobile deposit $0.50",
  deposited_item_return: "Returned deposited item $12.00",
  coin_counting: "Coin counting (non-member) $5.00",
  cash_advance: "Cash advance fee $10.00",
  night_deposit: "Night deposit bag $8.00",
  notary_fee: "Notary service $5.00",
  safe_deposit_box: "Safe deposit box lost key $25.00",
  garnishment_levy: "Garnishment or levy processing $75.00",
  legal_process: "Legal process / subpoena $50.00",
  account_verification: "Account verification $10.00",
  late_payment: "Late payment charge $25.00",
  loan_origination: "Loan origination fee $150.00",
  appraisal_fee: "Appraisal fee $450.00",
  gift_card_purchase: "Gift card purchase $2.95",
  prepaid_card_reload: "Prepaid card reload $3.00",
  early_closure: "Early account closure (closed within 90 days) $25.00",
  dormant_account: "Dormant account fee $5.00",
  account_research: "Account research (per hour) $25.00",
};

describe("FEE_PATTERNS reachability", () => {
  it("has no duplicate keys", () => {
    const keys = FEE_PATTERNS.map((entry) => entry.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("has a probe segment for every pattern", () => {
    const missing = FEE_PATTERNS.map((entry) => entry.key).filter((key) => !(key in PROBES));
    expect(missing, `add a probe segment to PROBES for: ${missing.join(", ")}`).toEqual([]);
  });

  it("resolves every key from its own probe — no pattern is shadowed", () => {
    const shadowed: Array<{ key: string; resolvedTo: string | null }> = [];
    for (const { key } of FEE_PATTERNS) {
      const probe = PROBES[key];
      if (!probe) continue;
      const resolved = classifySegment(probe);
      if (resolved !== key) shadowed.push({ key, resolvedTo: resolved });
    }
    expect(
      shadowed,
      `these keys are unreachable — a broader pattern above them claims their segments first:\n${shadowed
        .map((entry) => `  ${entry.key} -> ${entry.resolvedTo ?? "null"}`)
        .join("\n")}`,
    ).toEqual([]);
  });
});

describe("overdraft family separation", () => {
  it.each([
    ["Maximum overdraft fee per day $250.00", "od_daily_cap"],
    ["Overdraft/NSF fee maximum $384.00 daily", "od_daily_cap"],
    ["Daily cap on overdraft charges $150.00", "od_daily_cap"],
    ["Maximum NSF fees charged per day $105.00", "nsf_daily_cap"],
    ["Overdraft Fee (per item) $32.00", "overdraft"],
    ["NSF Fee (per presentment) $32.00", "nsf"],
    ["Extended Overdraft Fee $30.00", "continuous_od"],
    ["Overdraft Protection Transfer $10.00", "od_protection_transfer"],
  ])("classifies %j as %s", (segment, expected) => {
    expect(classifySegment(segment)).toBe(expected);
  });

  it("never files a cap line on the plain overdraft key", () => {
    const caps = [
      "Maximum overdraft fee per day $250.00",
      "Overdraft fees not to exceed $160.00 per day",
      "Overdraft charges limited to 5 items per day",
    ];
    for (const segment of caps) {
      expect(classifySegment(segment)).not.toBe("overdraft");
    }
  });
});

describe("monthly_maintenance precision", () => {
  it("still matches real maintenance lines", () => {
    expect(classifySegment("Monthly maintenance fee $12.00")).toBe("monthly_maintenance");
    expect(classifySegment("Monthly service charge $8.00")).toBe("monthly_maintenance");
  });

  it("no longer claims unrelated lines that merely contain 'monthly'", () => {
    // The previous pattern matched a bare "monthly" anywhere in the segment and
    // is the likeliest source of the $5,000 / $2,500 monthly_maintenance rows
    // in the published set.
    expect(classifySegment("Safe deposit box, billed monthly $5,000.00")).not.toBe("monthly_maintenance");
  });
});
