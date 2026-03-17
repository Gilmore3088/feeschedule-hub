import crypto from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb, getWriteDb } from "@/lib/crawler-db/connection";

const SESSION_COOKIE = "fsh_session";
const SESSION_TTL_HOURS = 24;
function getCookieSecret(): string {
  const secret = process.env.BFI_COOKIE_SECRET;
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("BFI_COOKIE_SECRET must be set in production");
  }
  return secret || "dev-secret-change-in-production";
}

function signSessionId(sessionId: string): string {
  const sig = crypto
    .createHmac("sha256", getCookieSecret())
    .update(sessionId)
    .digest("hex");
  return `${sessionId}.${sig}`;
}

function verifyAndExtractSessionId(signed: string): string | null {
  const dotIdx = signed.lastIndexOf(".");
  if (dotIdx === -1) return null;
  const sessionId = signed.substring(0, dotIdx);
  const sig = signed.substring(dotIdx + 1);
  if (!sessionId || !sig || sig.length !== 64) return null;
  try {
    const expected = crypto
      .createHmac("sha256", getCookieSecret())
      .update(sessionId)
      .digest("hex");
    if (!crypto.timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"))) {
      return null;
    }
    return sessionId;
  } catch {
    return null;
  }
}

export interface User {
  id: number;
  username: string;
  display_name: string;
  role: "viewer" | "analyst" | "admin" | "premium";
  email: string | null;
  stripe_customer_id: string | null;
  subscription_status: "none" | "active" | "past_due" | "canceled";
  institution_name: string | null;
  institution_type: string | null;
  asset_tier: string | null;
  state_code: string | null;
  job_role: string | null;
  interests: string | null; // JSON array
}

export type Permission =
  | "view"
  | "approve"
  | "reject"
  | "edit"
  | "bulk_approve"
  | "manage_users"
  | "trigger_jobs"
  | "cancel_jobs"
  | "research";

const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  viewer: ["view"],
  premium: ["view", "research"],
  analyst: ["view", "approve", "reject", "research"],
  admin: ["view", "approve", "reject", "edit", "bulk_approve", "manage_users", "trigger_jobs", "cancel_jobs", "research"],
};

function hashPassword(password: string, salt: string): string {
  return crypto
    .createHash("sha256")
    .update(`${salt}:${password}`)
    .digest("hex");
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, expected] = stored.split(":", 2);
  const actual = hashPassword(password, salt);
  return actual === expected;
}

export async function login(
  username: string,
  password: string
): Promise<User | null> {
  const db = getWriteDb();
  try {
    const row = db
      .prepare(
        `SELECT id, username, display_name, role, password_hash, email,
                COALESCE(subscription_status, 'none') as subscription_status,
                institution_name, institution_type, asset_tier, state_code, job_role, interests
         FROM users WHERE (username = ? OR email = ?) AND is_active = 1`
      )
      .get(username, username) as
      | (User & { password_hash: string })
      | undefined;

    if (!row) return null;

    // Use passwords.ts verifyPassword which handles both bcrypt and legacy SHA-256
    const { verifyPassword: verifyPw } = await import("@/lib/passwords");
    const { valid } = await verifyPw(password, row.password_hash);
    if (!valid) return null;

    // Create session
    const sessionId = crypto.randomBytes(32).toString("hex");
    // Store expiry in SQLite-compatible format (YYYY-MM-DD HH:MM:SS) for reliable comparison
    const expiresDate = new Date(Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000);
    const expiresAt = expiresDate.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "");

    db.prepare(
      "INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)"
    ).run(sessionId, row.id, expiresAt);

    // Set signed cookie
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE, signSessionId(sessionId), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: SESSION_TTL_HOURS * 60 * 60,
      path: "/",
    });

    const { password_hash: _, ...user } = row;
    return user;
  } finally {
    db.close();
  }
}

export async function logout(): Promise<void> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE)?.value;
  const sessionId = raw ? verifyAndExtractSessionId(raw) : null;

  if (sessionId) {
    const db = getWriteDb();
    try {
      db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
    } finally {
      db.close();
    }
  }

  cookieStore.delete(SESSION_COOKIE);
}

export async function getCurrentUser(): Promise<User | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE)?.value;
  if (!raw) return null;

  const sessionId = verifyAndExtractSessionId(raw);
  if (!sessionId) return null;

  const db = getDb();
  const row = db
    .prepare(
      `SELECT u.id, u.username, u.display_name, u.role,
              u.email, u.stripe_customer_id,
              COALESCE(u.subscription_status, 'none') as subscription_status,
              u.institution_name, u.institution_type, u.asset_tier,
              u.state_code, u.job_role, u.interests
       FROM sessions s
       JOIN users u ON s.user_id = u.id
       WHERE s.id = ? AND s.expires_at > datetime('now') AND u.is_active = 1`
    )
    .get(sessionId) as User | undefined;

  return row ?? null;
}

export function hasPermission(user: User, permission: Permission): boolean {
  return ROLE_PERMISSIONS[user.role]?.includes(permission) ?? false;
}

export async function requireAuth(permission?: Permission): Promise<User> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/admin/login");
  }
  if (permission && !hasPermission(user, permission)) {
    redirect("/admin?error=forbidden");
  }
  return user;
}
