/**
 * Self-service password reset: token creation/hashing, issuing a reset (email
 * side effect, never reveals whether the account exists), and consuming a
 * token to set a new password. Single-use tokens are enforced by the
 * `used_at` column checked inside the same transaction that sets it.
 *
 * Issuance is bounded two ways: any outstanding unused token for the user is
 * invalidated before a new one is minted, and a short cooldown
 * (RESET_REISSUE_COOLDOWN_MS) prevents re-issuing — and re-sending — within
 * that window of the last issuance. The email send itself is fire-and-forget
 * so the account-exists and account-missing branches cost the same small,
 * fixed DB round trip instead of also varying with the email provider's
 * network latency (a timing oracle for account enumeration).
 *
 * On successful consumption, all of the user's sessions are invalidated in
 * the same transaction as the password change, so a leaked/expired
 * credential can't ride an existing session past the reset.
 *
 * Issuance itself (cooldown check + invalidate-outstanding + insert) runs in
 * one transaction guarded by a per-user Postgres advisory lock, so two
 * concurrent requests for the same email can't both race past the cooldown
 * check — the second waits for the first to commit, then sees its row.
 */
import { createHash } from "node:crypto";
import { sql, withTransaction } from "@/lib/data-store/connection";
import { generateToken, hashPassword } from "@/lib/passwords";
import { sendPasswordResetEmail } from "@/lib/email/password-reset";

const RESET_TOKEN_TTL_MINUTES = 60;
export const RESET_REISSUE_COOLDOWN_MS = 5 * 60 * 1000;

/**
 * Arbitrary fixed namespace for `pg_advisory_xact_lock(namespace, user_id)`
 * calls made while issuing a password reset. Any int4 works as long as it's
 * stable and not reused by another advisory-lock caller in this codebase —
 * there currently isn't one. Spells "PRST" (password reset) in hex.
 */
export const PASSWORD_RESET_LOCK_NAMESPACE = 0x50525354;

export type ConsumeResetResult = "ok" | "invalid" | "expired";

interface ResetTokenRow {
  id: string;
  user_id: number;
  expires_at: string | Date;
  used_at: string | Date | null;
  is_active: boolean;
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
  const { token, hash: tokenHash } = generateToken();
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000);
  return { token, tokenHash, expiresAt };
}

function isWithinCooldown(lastIssuedAt: string | Date | undefined): boolean {
  if (!lastIssuedAt) return false;
  return Date.now() - new Date(lastIssuedAt).getTime() < RESET_REISSUE_COOLDOWN_MS;
}

/**
 * Always resolves, regardless of whether the email matches an account, so
 * callers can show the same "check your inbox" message either way (no
 * account enumeration). The reset email is fired without being awaited so
 * its network latency never leaks into the caller's response time.
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

  const issuedToken = await withTransaction(async (tx) => {
    // Serialize concurrent issuers for this user first: the second call
    // blocks here until the first commits, so its cooldown check below sees
    // the first call's freshly-inserted row instead of racing past it.
    await tx`SELECT pg_advisory_xact_lock(${PASSWORD_RESET_LOCK_NAMESPACE}, ${user.id})`;

    const recentRows = await tx`
      SELECT created_at FROM password_reset_tokens
      WHERE user_id = ${user.id} AND used_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    `;
    const lastIssuedAt = (recentRows[0] as { created_at: string | Date } | undefined)?.created_at;
    if (isWithinCooldown(lastIssuedAt)) return null;

    await tx`
      UPDATE password_reset_tokens SET used_at = NOW()
      WHERE user_id = ${user.id} AND used_at IS NULL
    `;

    const { token, tokenHash, expiresAt } = createResetToken();

    await tx`
      INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
      VALUES (${user.id}, ${tokenHash}, ${expiresAt})
    `;

    return token;
  });

  if (!issuedToken) return;

  // Fire-and-forget, and deliberately outside the transaction: the email
  // provider round trip must not hold the advisory lock or the DB
  // transaction open, and awaiting it here would let the hit/no-hit
  // branches diverge in response time by the provider's latency instead of
  // just the fixed DB work above.
  void sendPasswordResetEmail({ to: user.email, token: issuedToken }).catch(() => undefined);
}

export async function consumeReset(
  token: string,
  newPassword: string,
): Promise<ConsumeResetResult> {
  const tokenHash = hashResetToken(token);

  return withTransaction(async (tx) => {
    const rows = await tx`
      SELECT prt.id AS id, prt.user_id AS user_id, prt.expires_at AS expires_at,
             prt.used_at AS used_at, u.is_active AS is_active
      FROM password_reset_tokens prt
      JOIN users u ON u.id = prt.user_id
      WHERE prt.token_hash = ${tokenHash}
      FOR UPDATE OF prt
    `;
    const row = rows[0] as ResetTokenRow | undefined;

    if (!row || row.used_at || !row.is_active) return "invalid";
    if (new Date(row.expires_at).getTime() < Date.now()) return "expired";

    const hashedPassword = await hashPassword(newPassword);

    await tx`
      UPDATE password_reset_tokens SET used_at = NOW() WHERE id = ${row.id}
    `;
    await tx`
      UPDATE users SET password_hash = ${hashedPassword} WHERE id = ${row.user_id}
    `;
    // Invalidate every existing session for this user — a reset should end
    // any session riding the old (possibly compromised) credential.
    await tx`
      DELETE FROM sessions WHERE user_id = ${row.user_id}
    `;

    return "ok";
  });
}
