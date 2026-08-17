import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/data-store/connection", () => ({
  sql: vi.fn(),
}));

vi.mock("@/lib/api-hardening/audit", () => ({
  recordApiRouteAuditEvent: vi.fn(() => Promise.resolve()),
  getRequestSubjectKey: vi.fn(() => "test"),
}));

import { sql } from "@/lib/data-store/connection";
import { POST } from "./route";

const sqlMock = sql as unknown as ReturnType<typeof vi.fn>;

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

  it("rejects missing name or invalid email", async () => {
    expect((await post({ email: "a@b.co" })).status).toBe(400);
    expect((await post({ name: "x", email: "nope" })).status).toBe(400);
    expect(sqlMock).not.toHaveBeenCalled();
  });
});
