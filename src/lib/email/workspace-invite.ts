import { SITE_URL } from "@/lib/constants";
import type { InstitutionWorkspaceInvitation } from "@/lib/hamilton/institution-membership";

export type WorkspaceInviteEmailDeliveryResult =
  | { status: "sent"; providerId: string | null }
  | { status: "not_configured"; reason: string }
  | { status: "failed"; error: string };

const RESEND_EMAIL_ENDPOINT = "https://api.resend.com/emails";

function getWorkspaceInviteUrl() {
  return `${SITE_URL.replace(/\/$/, "")}/workspace-invite`;
}

function getInviteEmailFromAddress() {
  return (
    process.env.WORKSPACE_INVITE_EMAIL_FROM ||
    process.env.TRANSACTIONAL_EMAIL_FROM ||
    process.env.EMAIL_FROM ||
    ""
  ).trim();
}

function escapeHtml(value: string | null | undefined) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildIdempotencyKey(invitation: InstitutionWorkspaceInvitation) {
  const version = (invitation.updatedAt || invitation.createdAt || invitation.expiresAt)
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 48);
  return `workspace-invite-${invitation.id}-${version || "queued"}`;
}

async function parseProviderResponse(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const body = (await response.json()) as unknown;
    return body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function providerErrorMessage(payload: Record<string, unknown> | null, fallback: string) {
  if (!payload) return fallback;
  const direct = payload.message || payload.error;
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  if (direct && typeof direct === "object" && "message" in direct) {
    const nested = (direct as { message?: unknown }).message;
    if (typeof nested === "string" && nested.trim()) return nested.trim();
  }
  return fallback;
}

export async function sendWorkspaceInviteEmail(
  invitation: InstitutionWorkspaceInvitation,
): Promise<WorkspaceInviteEmailDeliveryResult> {
  const apiKey = (process.env.RESEND_API_KEY || "").trim();
  const from = getInviteEmailFromAddress();

  if (!apiKey) {
    return { status: "not_configured", reason: "RESEND_API_KEY is not configured." };
  }
  if (!from) {
    return {
      status: "not_configured",
      reason:
        "WORKSPACE_INVITE_EMAIL_FROM, TRANSACTIONAL_EMAIL_FROM, or EMAIL_FROM is not configured.",
    };
  }

  const inviteUrl = getWorkspaceInviteUrl();
  const institutionName = invitation.institutionName || "the selected institution";
  const inviterName =
    invitation.invitedByDisplayName || invitation.invitedByEmail || "A Fee Insight workspace admin";
  const subject = `${institutionName} Hamilton workspace invitation`;
  const preview = `${inviterName} invited you to a Fee Insight Hamilton workspace.`;
  const text = [
    preview,
    "",
    `Institution: ${institutionName}`,
    `Role: ${invitation.role}`,
    "",
    `Open ${inviteUrl} and sign in or register with ${invitation.email}.`,
    "The invitation attaches after the invited account has an active Pro subscription.",
  ].join("\n");
  const html = `
    <div style="font-family: Arial, sans-serif; color: #1f2933; line-height: 1.5; max-width: 560px;">
      <p style="margin: 0 0 16px;">${escapeHtml(preview)}</p>
      <p style="margin: 0 0 16px;">
        <strong>Institution:</strong> ${escapeHtml(institutionName)}<br />
        <strong>Role:</strong> ${escapeHtml(invitation.role)}
      </p>
      <p style="margin: 0 0 20px;">
        Accept the invitation by signing in or registering with ${escapeHtml(invitation.email)}.
        If the account is not Pro yet, the invitation will attach after Pro activation.
      </p>
      <p style="margin: 0 0 20px;">
        <a href="${escapeHtml(inviteUrl)}" style="background: #0f172a; color: #ffffff; padding: 10px 14px; text-decoration: none; border-radius: 6px; display: inline-block;">
          Open workspace invite
        </a>
      </p>
      <p style="margin: 0; color: #667085; font-size: 13px;">
        Fee Insight Hamilton workspace access is institution-scoped and can be revoked by the workspace owner.
      </p>
    </div>
  `;

  try {
    const response = await fetch(process.env.RESEND_EMAIL_ENDPOINT || RESEND_EMAIL_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": buildIdempotencyKey(invitation),
      },
      body: JSON.stringify({
        from,
        to: invitation.email,
        subject,
        html,
        text,
      }),
    });

    const payload = await parseProviderResponse(response);
    if (!response.ok) {
      return {
        status: "failed",
        error: providerErrorMessage(
          payload,
          `Resend returned HTTP ${response.status} while sending the workspace invite.`,
        ),
      };
    }

    const providerId = typeof payload?.id === "string" ? payload.id : null;
    return { status: "sent", providerId };
  } catch (error) {
    return {
      status: "failed",
      error: error instanceof Error ? error.message : "Workspace invite email send failed.",
    };
  }
}
