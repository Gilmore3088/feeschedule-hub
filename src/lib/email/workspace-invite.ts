import { SITE_URL } from "@/lib/constants";
import type { InstitutionWorkspaceInvitation } from "@/lib/hamilton/institution-membership";
import {
  escapeHtml,
  getResendApiKey,
  getTransactionalFromAddress,
  sendResendEmail,
  type EmailDeliveryResult,
} from "./resend";

export type WorkspaceInviteEmailDeliveryResult = EmailDeliveryResult;

function getWorkspaceInviteUrl() {
  return `${SITE_URL.replace(/\/$/, "")}/workspace-invite`;
}

function getInviteEmailFromAddress() {
  return (process.env.WORKSPACE_INVITE_EMAIL_FROM || "").trim() || getTransactionalFromAddress();
}

function buildIdempotencyKey(invitation: InstitutionWorkspaceInvitation) {
  const version = (invitation.updatedAt || invitation.createdAt || invitation.expiresAt)
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 48);
  return `workspace-invite-${invitation.id}-${version || "queued"}`;
}

export async function sendWorkspaceInviteEmail(
  invitation: InstitutionWorkspaceInvitation,
): Promise<WorkspaceInviteEmailDeliveryResult> {
  const apiKey = getResendApiKey();
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
    <div style="background: #FAF7F2; padding: 32px 16px; font-family: Georgia, 'Times New Roman', serif; color: #1A1815; line-height: 1.55;">
      <div style="max-width: 560px; margin: 0 auto; background: #FDFBF8; border: 1px solid #E0D7C9; border-radius: 8px; padding: 28px 28px 24px;">
        <p style="margin: 0 0 20px; font-family: Georgia, 'Times New Roman', serif; font-size: 20px; font-weight: 500; letter-spacing: -0.01em; color: #1A1815;">${escapeHtml(preview)}</p>
        <p style="margin: 0 0 16px; font-size: 15px; color: #1A1815;">
          <strong style="color: #5A5347; font-weight: 600;">Institution:</strong> ${escapeHtml(institutionName)}<br />
          <strong style="color: #5A5347; font-weight: 600;">Role:</strong> ${escapeHtml(invitation.role)}
        </p>
        <p style="margin: 0 0 22px; font-size: 15px; color: #5A5347;">
          Accept the invitation by signing in or registering with ${escapeHtml(invitation.email)}.
          If the account is not Pro yet, the invitation will attach after Pro activation.
        </p>
        <p style="margin: 0 0 22px;">
          <a href="${escapeHtml(inviteUrl)}" style="background: #C44B2E; color: #ffffff; padding: 11px 18px; font-size: 14px; font-weight: 600; text-decoration: none; border-radius: 6px; display: inline-block;">
            Open workspace invite
          </a>
        </p>
        <p style="margin: 0; padding-top: 16px; border-top: 1px solid #E0D7C9; color: #7A7062; font-size: 13px;">
          Fee Insight Hamilton workspace access is institution-scoped and can be revoked by the workspace owner.
        </p>
      </div>
    </div>
  `;

  return sendResendEmail(
    {
      from,
      to: invitation.email,
      subject,
      html,
      text,
      idempotencyKey: buildIdempotencyKey(invitation),
    },
    "the workspace invite",
  );
}
