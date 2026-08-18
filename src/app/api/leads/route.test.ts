import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/data-store/connection", () => ({
  sql: vi.fn(),
}));

vi.mock("@/lib/api-hardening/audit", () => ({
  recordApiRouteAuditEvent: vi.fn(() => Promise.resolve()),
  getRequestSubjectKey: vi.fn(() => "test"),
}));

vi.mock("@/lib/email/report-request", () => ({
  sendReportRequestNotifications: vi.fn(),
  sendContactRequestNotifications: vi.fn(),
  sendConfirmationOnlyNotification: vi.fn(),
}));

import { sql } from "@/lib/data-store/connection";
import {
  sendConfirmationOnlyNotification,
  sendContactRequestNotifications,
  sendReportRequestNotifications,
} from "@/lib/email/report-request";
import { POST } from "./route";

const sqlMock = sql as unknown as ReturnType<typeof vi.fn>;
const reportNotifyMock = sendReportRequestNotifications as unknown as ReturnType<typeof vi.fn>;
const contactNotifyMock = sendContactRequestNotifications as unknown as ReturnType<typeof vi.fn>;
const confirmationOnlyMock = sendConfirmationOnlyNotification as unknown as ReturnType<typeof vi.fn>;
const SENT = { status: "sent", providerId: "em_1" };

function post(body: Record<string, unknown>) {
  return POST(
    new NextRequest("http://localhost/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

/** Reassemble a tagged-template call into readable SQL with its bound values. */
function issued(callIndex: number): { text: string; values: unknown[] } {
  const [strings, ...values] = sqlMock.mock.calls[callIndex] as [TemplateStringsArray, ...unknown[]];
  return { text: strings.join("?").replace(/\s+/g, " "), values };
}

describe("POST /api/leads", () => {
  beforeEach(() => {
    sqlMock.mockReset();
    reportNotifyMock.mockReset();
    contactNotifyMock.mockReset();
    confirmationOnlyMock.mockReset();
    reportNotifyMock.mockResolvedValue({ notification: SENT, confirmation: SENT });
    contactNotifyMock.mockResolvedValue({ notification: SENT, confirmation: SENT });
    confirmationOnlyMock.mockResolvedValue({ notification: SENT, confirmation: SENT });
  });

  it("inserts a new lead with its source", async () => {
    sqlMock.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const res = await post({ name: "Newsletter signup", email: "a@b.co", source: "newsletter" });
    expect(res.status).toBe(200);
    const insert = issued(1);
    expect(insert.text).toContain("INSERT INTO leads");
    expect(insert.values).toEqual(["Newsletter signup", "a@b.co", null, null, null, "newsletter"]);
  });

  it("does not overwrite an existing qualified lead on newsletter signup", async () => {
    sqlMock.mockResolvedValueOnce([{ id: 7 }]).mockResolvedValueOnce([]);
    const res = await post({ name: "Newsletter signup", email: "cmo@bank.com", source: "newsletter" });
    expect(res.status).toBe(200);

    const update = issued(1);
    expect(update.text).toContain("UPDATE leads SET");
    // Newsletter placeholder never becomes the name candidate.
    expect(update.text).toContain("WHEN name IS NULL OR name = '' OR name = ?");
    expect(update.text).toContain("THEN COALESCE(?, name) ELSE name END");
    expect(update.values[0]).toBe("Newsletter signup");
    expect(update.values[1]).toBeNull();
    // Company/role/use_case only fill NULLs.
    expect(update.text).toContain("company = COALESCE(company, ?)");
    expect(update.text).toContain("role = COALESCE(role, ?)");
    expect(update.text).toContain("use_case = COALESCE(use_case, ?)");
    expect(update.text).not.toMatch(/SET name = \?/);
    expect(update.text).not.toContain("company = ?,");
    // Source is appended, not replaced; status only set when NULL.
    expect(update.text).toContain("ELSE source || ',' || ?");
    expect(update.text).toContain("status = COALESCE(status, ?)");
    expect(update.text).not.toContain("status = 'updated'");
    expect(update.values).toContain("newsletter");
    expect(update.values[update.values.length - 1]).toBe("cmo@bank.com");
  });

  it("uses a real name as the fill candidate for a placeholder-only lead", async () => {
    sqlMock.mockResolvedValueOnce([{ id: 3 }]).mockResolvedValueOnce([]);
    await post({ name: "Dana Lee", email: "dana@cu.org", company: "Example CU", source: "report" });
    const update = issued(1);
    expect(update.values[1]).toBe("Dana Lee");
    expect(update.values).toContain("Example CU");
    expect(update.values).toContain("report");
  });

  it("sends a confirmation-only notification for newsletter signups", async () => {
    sqlMock.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const res = await post({ name: "Newsletter signup", email: "a@b.co", source: "newsletter" });
    expect(await res.json()).toEqual({
      success: true,
      notifications: { notification: "sent", confirmation: "sent" },
    });
    expect(reportNotifyMock).not.toHaveBeenCalled();
    expect(contactNotifyMock).not.toHaveBeenCalled();
    expect(confirmationOnlyMock).toHaveBeenCalledWith({
      source: "newsletter",
      email: "a@b.co",
      institution: null,
    });
  });

  it("sends a confirmation-only notification for notify-verified signups", async () => {
    sqlMock.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const res = await post({
      name: "Notify request",
      email: "a@b.co",
      company: "Example CU",
      use_case: "notify-verified:4802",
      source: "notify",
    });
    expect(await res.json()).toEqual({
      success: true,
      notifications: { notification: "sent", confirmation: "sent" },
    });
    expect(reportNotifyMock).not.toHaveBeenCalled();
    expect(contactNotifyMock).not.toHaveBeenCalled();
    expect(confirmationOnlyMock).toHaveBeenCalledWith({
      source: "notify",
      email: "a@b.co",
      institution: "Example CU",
    });
  });

  it("stores institution_id and src on use_case and notifies for report requests", async () => {
    sqlMock.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const res = await post({
      name: "Dana Lee",
      email: "dana@cu.org",
      company: "Example CU",
      role: "VP Retail",
      use_case: "competitive-fee-position-report",
      source: "report",
      institutionId: 4802,
      src: "profile",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      notifications: { notification: "sent", confirmation: "sent" },
    });

    const insert = issued(1);
    expect(insert.values).toEqual([
      "Dana Lee",
      "dana@cu.org",
      "Example CU",
      "VP Retail",
      "competitive-fee-position-report; institution_id=4802; src=profile",
      "report",
    ]);
    expect(reportNotifyMock).toHaveBeenCalledWith({
      name: "Dana Lee",
      email: "dana@cu.org",
      institution: "Example CU",
      role: "VP Retail",
      institutionId: 4802,
      src: "profile",
    });
  });

  it("drops malformed institutionId/src instead of storing them", async () => {
    sqlMock.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    await post({
      name: "Dana Lee",
      email: "dana@cu.org",
      company: "Example CU",
      use_case: "competitive-fee-position-report",
      source: "report",
      institutionId: "4802; DROP TABLE leads",
      src: "bad src!",
    });
    expect(issued(1).values[4]).toBe("competitive-fee-position-report");
    expect(reportNotifyMock).toHaveBeenCalledWith(
      expect.objectContaining({ institutionId: null, src: null }),
    );
  });

  it("stores the lead and reports the email status when the notifier is not configured", async () => {
    sqlMock.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const notConfigured = { status: "not_configured", reason: "RESEND_API_KEY is not configured." };
    reportNotifyMock.mockResolvedValue({ notification: notConfigured, confirmation: notConfigured });
    const res = await post({ name: "Dana Lee", email: "dana@cu.org", company: "Example CU", source: "report" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      notifications: { notification: "not_configured", confirmation: "not_configured" },
    });
    expect(issued(1).text).toContain("INSERT INTO leads");
  });

  it("still returns success when the notifier throws unexpectedly", async () => {
    sqlMock.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    reportNotifyMock.mockRejectedValue(new Error("boom"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await post({ name: "Dana Lee", email: "dana@cu.org", company: "Example CU", source: "report" });
    errorSpy.mockRestore();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      notifications: { notification: "failed", confirmation: "failed" },
    });
  });

  it("notifies for contact-form submissions with the inquiry type and message", async () => {
    sqlMock.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    await post({
      name: "Sam Ortiz",
      email: "sam@bank.example",
      company: "First Example Bank",
      role: "CFO",
      use_case: "Can we license the dataset?",
      source: "contact_enterprise",
    });
    expect(contactNotifyMock).toHaveBeenCalledWith({
      name: "Sam Ortiz",
      email: "sam@bank.example",
      company: "First Example Bank",
      role: "CFO",
      message: "Can we license the dataset?",
      inquiryType: "enterprise",
    });
    expect(reportNotifyMock).not.toHaveBeenCalled();
    expect(confirmationOnlyMock).not.toHaveBeenCalled();
  });

  it("rejects missing name or invalid email", async () => {
    expect((await post({ email: "a@b.co" })).status).toBe(400);
    expect((await post({ name: "x", email: "nope" })).status).toBe(400);
    expect(sqlMock).not.toHaveBeenCalled();
  });
});
