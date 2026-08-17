import { describe, expect, it } from "vitest";
import {
  getHostedReport,
  isHostedReportExpired,
  prepareReportForEmbed,
  prepareReportForPrint,
  type HostedReportMap,
} from "./hosted-reports";

const FIXTURE: HostedReportMap = {
  "0123456789abcdef": {
    institution_id: 4802,
    institution_name: "Georgia Heritage Federal Credit Union",
    prepared_on: "2026-08-15",
    expires_on: "2026-11-15",
  },
  "fedcba9876543210": {
    institution_id: 860,
    institution_name: "Bank of the Pacific",
    prepared_on: "2026-05-01",
    expires_on: "2026-08-01",
  },
};

const NOW = new Date("2026-08-17T12:00:00Z");

describe("getHostedReport", () => {
  it("returns null for an unknown token", () => {
    expect(getHostedReport("ffffffffffffffff", { map: FIXTURE, now: NOW })).toBeNull();
  });

  it("returns null for a malformed token without consulting the map", () => {
    expect(getHostedReport("../etc/passwd", { map: FIXTURE, now: NOW })).toBeNull();
    expect(getHostedReport("", { map: FIXTURE, now: NOW })).toBeNull();
    expect(getHostedReport("0123456789ABCDEF", { map: FIXTURE, now: NOW })).toBeNull();
  });

  it("returns null for an expired token", () => {
    expect(getHostedReport("fedcba9876543210", { map: FIXTURE, now: NOW })).toBeNull();
  });

  it("returns the record for a known, unexpired token", () => {
    expect(getHostedReport("0123456789abcdef", { map: FIXTURE, now: NOW })).toEqual({
      token: "0123456789abcdef",
      institution_id: 4802,
      institution_name: "Georgia Heritage Federal Credit Union",
      prepared_on: "2026-08-15",
      expires_on: "2026-11-15",
    });
  });

  it("treats the expiry date itself as still valid", () => {
    const lastDay = new Date("2026-11-15T23:00:00Z");
    expect(getHostedReport("0123456789abcdef", { map: FIXTURE, now: lastDay })).not.toBeNull();
    const dayAfter = new Date("2026-11-16T00:00:00Z");
    expect(getHostedReport("0123456789abcdef", { map: FIXTURE, now: dayAfter })).toBeNull();
  });
});

describe("isHostedReportExpired", () => {
  it("treats a malformed expiry date as expired", () => {
    expect(
      isHostedReportExpired({ ...FIXTURE["0123456789abcdef"], expires_on: "soon" }, NOW),
    ).toBe(true);
  });
});

describe("report HTML preparation", () => {
  const doc = "<html><head><title>x</title></head><body><p>hi</p></body></html>";

  it("injects screen styles before </head>", () => {
    const out = prepareReportForEmbed(doc);
    expect(out.indexOf("data-fee-insight-embed")).toBeLessThan(out.indexOf("</head>"));
    expect(out).toContain("<p>hi</p>");
  });

  it("injects an auto-print hook before </body>", () => {
    const out = prepareReportForPrint(doc);
    expect(out.indexOf("window.print()")).toBeLessThan(out.indexOf("</body>"));
  });
});

describe("formatReportDate", () => {
  it("formats an ISO date without shifting the calendar day", async () => {
    const { formatReportDate } = await import("./hosted-reports");
    expect(formatReportDate("2026-08-16")).toBe("Aug 16, 2026");
    expect(formatReportDate("not-a-date")).toBe("not-a-date");
  });
});
