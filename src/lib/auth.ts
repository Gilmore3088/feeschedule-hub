import crypto from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb, getWriteDb } from "./crawler-db/connection";

const SESSION_COOKIE = "fsh_session";
const SESSION_TTL_HOURS = 24;

export interface User {
  id: number;
  username: string;
  display_name: string;
  role: "viewer" | "analyst" | "admin";
}

export type Permission =
  | "view"
  | "approve"
  | "reject"
  | "edit"
  | "bulk_approve"
  | "manage_users";

const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  viewer: ["view"],
  analyst: ["view", "approve", "reject"],
  admin: ["view", "approve", "reject", "edit", "bulk_approve", "manage_users"],
};

function scryptHash(password: string, salt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey.toString("hex"));
    });
  });
}

function hashPasswordLegacy(password: string, salt: string): string {
  return crypto
    .createHash("sha256")
    .update(`${salt}:${password}`)
    .digest("hex");
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, expected] = stored.split(":", 2);

  // Try scrypt first (new format: salt is 32 hex chars = 16 bytes)
  if (salt.length === 32) {
    const actual = await scryptHash(password, salt);
    const expectedBuf = Buffer.from(expected, "hex");
    const actualBuf = Buffer.from(actual, "hex");
    if (expectedBuf.length === actualBuf.length) {
      return crypto.timingSafeEqual(expectedBuf, actualBuf);
    }
  }

  // Fall back to legacy SHA-256
  const actual = hashPasswordLegacy(password, salt);
  const expectedBuf = Buffer.from(expected, "hex");
  const actualBuf = Buffer.from(actual, "hex");
  if (expectedBuf.length !== actualBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}

export async function hashNewPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = await scryptHash(password, salt);
  return `${salt}:${hash}`;
}

export async function login(
  username: string,
  password: string
): Promise<User | null> {
  const db = getWriteDb();
  try {
    const row = db
      .prepare(
        "SELECT id, username, display_name, role, password_hash FROM users WHERE username = ? AND is_active = 1"
      )
      .get(username) as
      | (User & { password_hash: string })
      | undefined;

    if (!row || !(await verifyPassword(password, row.password_hash))) {
      return null;
    }

    // Upgrade legacy SHA-256 hash to scrypt on successful login
    if (row.password_hash.split(":")[0].length !== 32) {
      const upgraded = await hashNewPassword(password);
      db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(
        upgraded,
        row.id
      );
    }

    // Create session
    const sessionId = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(
      Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000
    ).toISOString();

    db.prepare(
      "INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)"
    ).run(sessionId, row.id, expiresAt);

    // Set cookie
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE, sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: SESSION_TTL_HOURS * 60 * 60,
      path: "/",
    });

    return {
      id: row.id,
      username: row.username,
      display_name: row.display_name,
      role: row.role,
    };
  } finally {
    db.close();
  }
}

export async function logout(): Promise<void> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;

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
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;

  if (!sessionId) return null;

  const db = getDb();
  const row = db
    .prepare(
      `SELECT u.id, u.username, u.display_name, u.role
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
