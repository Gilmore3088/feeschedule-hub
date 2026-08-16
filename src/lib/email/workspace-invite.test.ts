import { afterEach, describe, expect, it, vi } from "vitest";
import type { InstitutionWorkspaceInvitation } from "@/lib/hamilton/institution-membership";
import { sendWorkspaceInviteEmail } from "./workspace-invite";

function invitation(
  overrides: Partial<InstitutionWorkspaceInvitation> = {},
): InstitutionWorkspaceInvitation {
  return {
    id: 91,
    institutionId: 2945,
    institutionName: "Hamilton Bank",
    city: "New York",
    stateCode: "NY",
    email: "invitee@example.com",
    role: "analyst",
    status: "pending",
    invitedByUserId: 7,
    invitedByDisplayName: "Owner User",
    invitedByEmail: "owner@example.com",
    acceptedByUserId: null,
    revokedByUserId: null,
    expiresAt: "2026-09-14T12:00:00.000Z",
    acceptedAt: null,
    revokedAt: null,
    notes: null,
    createdAt: "2026-08-15T12:00:00.000Z",
    updatedAt: "2026-08-15T12:03:00.000Z",
    ...overrides,
  };
}

describe("sendWorkspaceInviteEmail", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("returns not_configured without calling the provider when email env vars are missing", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("WORKSPACE_INVITE_EMAIL_FROM", "");
    vi.stubEnv("TRANSACTIONAL_EMAIL_FROM", "");
    vi.stubEnv("EMAIL_FROM", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendWorkspaceInviteEmail(invitation());

    expect(result).toEqual({
      status: "not_configured",
      reason: "RESEND_API_KEY is not configured.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends a workspace invite through Resend with a deterministic idempotency key", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("WORKSPACE_INVITE_EMAIL_FROM", "Fee Insight <invites@example.com>");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "em_123" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendWorkspaceInviteEmail(invitation());

    expect(result).toEqual({ status: "sent", providerId: "em_123" });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer re_test",
      "Content-Type": "application/json",
      "Idempotency-Key": "workspace-invite-91-20260815T120300000Z",
    });

    const body = JSON.parse(String(init.body)) as Record<string, string>;
    expect(body.from).toBe("Fee Insight <invites@example.com>");
    expect(body.to).toBe("invitee@example.com");
    expect(body.subject).toBe("Hamilton Bank Hamilton workspace invitation");
    expect(body.text).toContain("Open https://feeinsight.com/workspace-invite");
    expect(body.html).toContain("Hamilton Bank");
    expect(body.html).toContain("invitee@example.com");
  });

  it("returns failed when the provider rejects the send", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("WORKSPACE_INVITE_EMAIL_FROM", "Fee Insight <invites@example.com>");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: "domain is not verified" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendWorkspaceInviteEmail(invitation());

    expect(result).toEqual({
      status: "failed",
      error: "domain is not verified",
    });
  });
});
