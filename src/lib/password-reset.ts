/**
 * Self-service password reset: token creation/hashing, issuing a reset (email
 * side effect, never reveals whether the account exists), and consuming a
 * token to set a new password. Single-use tokens are enforced by the
 * `used_at` column checked inside the same transaction that sets it.
 */
import { createHash, randomBytes } from "node:crypto";
import { sql, withTransaction } from "@/lib/data-store/connection";
import { hashPassword } from "@/lib/passwords";
import { sendPasswordResetEmail } from "@/lib/email/password-reset";

const RESET_TOKEN_BYTES = 32;
const RESET_TOKEN_TTL_MINUTES = 60;

export type ConsumeResetResult = "ok" | "invalid" | "expired";

interface ResetTokenRow {
  id: string;
  user_id: number;
  expires_at: string | Date;
  used_at: string | Date | null;
}

interface ActiveUserRow {
  id: number;
  email: string | null;
  username: string;
}

export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createResetToken(): { token: string; tokenHash: string; expiresAt: Date } {
  const token = randomBytes(RESET_TOKEN_BYTES).toString("hex");
  const tokenHash = hashResetToken(token);
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000);
  return { token, tokenHash, expiresAt };
}

/**
 * Always resolves, regardless of whether the email matches an account, so
 * callers can show the same "check your inbox" message either way (no
 * account enumeration). Email delivery failures are swallowed for the same
 * reason — the token is already stored, and the UI copy never depends on
 * send success.
 */
export async function issueReset(email: string): Promise<void> {
  const trimmedEmail = email.trim().toLowerCase();
  if (!trimmedEmail) return;

  const rows = await sql`
    SELECT id, email, username FROM users
    WHERE lower(email) = ${trimmedEmail} AND is_active = true
  `;
  const user = (rows[0] as ActiveUserRow | undefined) ?? undefined;
  if (!user || !user.email) return;

  const { token, tokenHash, expiresAt } = createResetToken();

  await sql`
    INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
    VALUES (${user.id}, ${tokenHash}, ${expiresAt})
  `;

  await sendPasswordResetEmail({ to: user.email, token }).catch(() => undefined);
}

export async function consumeReset(
  token: string,
  newPassword: string,
): Promise<ConsumeResetResult> {
  const tokenHash = hashResetToken(token);

  return withTransaction(async (tx) => {
    const rows = await tx`
      SELECT id, user_id, expires_at, used_at
      FROM password_reset_tokens
      WHERE token_hash = ${tokenHash}
      FOR UPDATE
    `;
    const row = rows[0] as ResetTokenRow | undefined;

    if (!row || row.used_at) return "invalid";
    if (new Date(row.expires_at).getTime() < Date.now()) return "expired";

    const hashedPassword = await hashPassword(newPassword);

    await tx`
      UPDATE password_reset_tokens SET used_at = NOW() WHERE id = ${row.id}
    `;
    await tx`
      UPDATE users SET password_hash = ${hashedPassword} WHERE id = ${row.user_id}
    `;

    return "ok";
  });
}
