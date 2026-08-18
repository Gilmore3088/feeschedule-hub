/**
 * Whether lead-driven email (report request / contact / newsletter / notify
 * confirmations) can actually send. Used to make UI copy conditional instead
 * of promising an email that `sendLeadNotificationPair` will report as
 * `not_configured`.
 */
type Env = Record<string, string | undefined>;

const FROM_KEYS = [
  "REPORT_REQUEST_EMAIL_FROM",
  "WORKSPACE_INVITE_EMAIL_FROM",
  "TRANSACTIONAL_EMAIL_FROM",
  "EMAIL_FROM",
] as const;

export function isLeadEmailConfigured(env: Env = process.env): boolean {
  const key = (env.RESEND_API_KEY ?? "").trim();
  const from = FROM_KEYS.map((k) => (env[k] ?? "").trim()).find(Boolean);
  return Boolean(key && from);
}
