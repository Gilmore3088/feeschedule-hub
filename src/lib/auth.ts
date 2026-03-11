import Database from "better-sqlite3";
import crypto from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import path from "path";

const DB_PATH = path.join(process.cwd(), "data", "crawler.db");
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
  | "submit_url"
  | "manual_entry"
  | "triage"
  | "bulk_approve"
  | "manage_users";

const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  viewer: ["view"],
  analyst: ["view", "approve", "reject", "edit", "submit_url", "manual_entry", "triage"],
  admin: ["view", "approve", "reject", "edit", "submit_url", "manual_entry", "triage", "bulk_approve", "manage_users"],
};

function getWriteDb(): Database.Database {
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = normal");
  db.pragma("cache_size = -32000");
  db.pragma("mmap_size = 268435456");
  db.pragma("temp_store = memory");
  return db;
}

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
        "SELECT id, username, display_name, role, password_hash FROM users WHERE username = ? AND is_active = 1"
      )
      .get(username) as
      | (User & { password_hash: string })
      | undefined;

    if (!row || !verifyPassword(password, row.password_hash)) {
      return null;
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
      secure: false, // MVP: localhost only
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

  const db = new Database(DB_PATH, { readonly: true });
  db.pragma("journal_mode = WAL");
  db.pragma("cache_size = -32000");
  try {
    const row = db
      .prepare(
        `SELECT u.id, u.username, u.display_name, u.role
         FROM sessions s
         JOIN users u ON s.user_id = u.id
         WHERE s.id = ? AND s.expires_at > datetime('now') AND u.is_active = 1`
      )
      .get(sessionId) as User | undefined;

    return row ?? null;
  } finally {
    db.close();
  }
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
