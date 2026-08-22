import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

import { auditRows, formatReport, parseCsv, toAuditRows } from "./fee-classification.audit";

/**
 * Runs the offline audit over a CSV export of live published rows.
 *
 * Skips cleanly when FEE_AUDIT_CSV is unset, so it is safe to leave in the
 * suite and in CI. See the header of fee-classification.audit.ts for the export
 * query and how to run it.
 */

function expandHome(value: string): string {
  return value.startsWith("~") ? resolve(homedir(), value.slice(1).replace(/^\/+/, "")) : resolve(value);
}

const csvPath = process.env.FEE_AUDIT_CSV ? expandHome(process.env.FEE_AUDIT_CSV) : null;

describe("CSV parsing", () => {
  it("handles quoted fields with commas and doubled quotes", () => {
    const rows = parseCsv('a,b\n"Wire, domestic","He said ""hi"""\n');
    expect(rows).toEqual([
      ["a", "b"],
      ["Wire, domestic", 'He said "hi"'],
    ]);
  });

  it("maps a published-catalog export to audit rows", () => {
    const csv = [
      "institution_id,fee_name,canonical_fee_key,amount,frequency",
      '860,"Overdraft Fee, per item",overdraft,32.00,per_item',
      "8434,Maximum overdraft per day,overdraft,250.00,daily",
    ].join("\n");
    const rows = toAuditRows(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0].feeName).toBe("Overdraft Fee, per item");
    expect(rows[1].amount).toBe(250);
    expect(rows[1].frequency).toBe("daily");
  });

  it("rejects an export missing the required columns", () => {
    expect(() => toAuditRows("foo,bar\n1,2")).toThrow(/must have fee_name/);
  });
});

describe("audit detection", () => {
  it("flags a cap published on the plain overdraft key", () => {
    const report = auditRows([
      {
        institutionId: "8434",
        feeName: "Maximum overdraft fee per day",
        publishedKey: "overdraft",
        amount: 250,
        frequency: "daily",
      },
    ]);
    const kinds = report.findings.map((finding) => finding.kind);
    expect(kinds).toContain("reclassified");
    expect(kinds).toContain("amount_held");
    expect(report.reclassificationMatrix[0]).toMatchObject({
      from: "overdraft",
      to: "od_daily_cap",
    });
  });

  it("stays silent on a well-formed row", () => {
    const report = auditRows([
      {
        institutionId: "201",
        feeName: "Overdraft Fee",
        publishedKey: "overdraft",
        amount: 32,
        frequency: "per_item",
      },
    ]);
    expect(report.findings).toEqual([]);
  });
});

describe.runIf(csvPath)("live sample audit", () => {
  it("replays the export and prints the report", () => {
    if (!csvPath) return;
    expect(existsSync(csvPath), `FEE_AUDIT_CSV not found: ${csvPath}`).toBe(true);

    const rows = toAuditRows(readFileSync(csvPath, "utf8"));
    expect(rows.length, "export contained no usable rows").toBeGreaterThan(0);

    const report = auditRows(rows);
    // eslint-disable-next-line no-console -- this test exists to produce a report
    console.log(formatReport(report));

    // Deliberately not asserting a disagreement threshold. The point is the
    // report, and a number here would only invite tuning it until it passes.
    expect(report.rowsRead).toBe(rows.length);
  });
});
