/**
 * Password reset email. Single message to the requesting user; never throws
 * (mirrors the other senders in this directory), and reports `not_configured`
 * instead of failing so callers can stay silent for account-enumeration safety.
 */
import { SITE_URL } from "@/lib/constants";
import {
  escapeHtml,
  getResendApiKey,
  getTransactionalFromAddress,
  sendResendEmail,
  type EmailDeliveryResult,
} from "./resend";

export type PasswordResetEmailDeliveryResult = EmailDeliveryResult;

const RESET_LINK_TTL_LABEL = "60 minutes";

function getResetPasswordUrl(token: string): string {
  return `${SITE_URL.replace(/\/$/, "")}/reset-password?token=${encodeURIComponent(token)}`;
}

export async function sendPasswordResetEmail(input: {
  to: string;
  token: string;
}): Promise<PasswordResetEmailDeliveryResult> {
  const apiKey = getResendApiKey();
  const from = getTransactionalFromAddress();

  if (!apiKey) {
    return { status: "not_configured", reason: "RESEND_API_KEY is not configured." };
  }
  if (!from) {
    return {
      status: "not_configured",
      reason: "TRANSACTIONAL_EMAIL_FROM or EMAIL_FROM is not configured.",
    };
  }

  const resetUrl = getResetPasswordUrl(input.token);
  const subject = "Reset your Fee Insight password";
  const preview = `Use the link below to set a new password. It expires in ${RESET_LINK_TTL_LABEL}.`;

  const text = [
    preview,
    "",
    resetUrl,
    "",
    "If you didn't request this, you can safely ignore this email.",
  ].join("\n");

  const html = `
    <div style="background: #FAF7F2; padding: 32px 16px; font-family: Georgia, 'Times New Roman', serif; color: #1A1815; line-height: 1.55;">
      <div style="max-width: 560px; margin: 0 auto; background: #FDFBF8; border: 1px solid #E0D7C9; border-radius: 8px; padding: 28px 28px 24px;">
        <p style="margin: 0 0 20px; font-size: 20px; font-weight: 500; letter-spacing: -0.01em; color: #1A1815;">${escapeHtml(preview)}</p>
        <p style="margin: 0 0 22px;">
          <a href="${escapeHtml(resetUrl)}" style="background: #C44B2E; color: #ffffff; padding: 11px 18px; font-size: 14px; font-weight: 600; text-decoration: none; border-radius: 6px; display: inline-block;">
            Set a new password
          </a>
        </p>
        <p style="margin: 0 0 22px; font-size: 13px; color: #5A5347;">
          If you didn't request this, you can safely ignore this email.
        </p>
        <p style="margin: 0; padding-top: 16px; border-top: 1px solid #E0D7C9; color: #7A7062; font-size: 13px;">
          Fee Insight — this link works once and expires in ${RESET_LINK_TTL_LABEL}.
        </p>
      </div>
    </div>
  `;

  return sendResendEmail({ from, to: input.to, subject, html, text }, "the password reset email");
}
