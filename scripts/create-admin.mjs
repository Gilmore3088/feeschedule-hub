#!/usr/bin/env node
/**
 * Create or reset an admin user — recovery tool for "admin login not working".
 *
 *   DATABASE_URL="postgres://..." node scripts/create-admin.mjs <username> <password> [email]
 *
 * Upserts a row in `users` with role=admin, is_active=true, and a password hash
 * in the legacy-sha256 format that src/lib/passwords.ts verifies
 * (salt:sha256("salt:password")). Uses only the `postgres` client (a project
 * dependency) + Node's built-in crypto — no bcrypt needed — so it runs anywhere
 * DATABASE_URL is reachable.
 *
 * Run this against production to guarantee a known-good admin login. It does NOT
 * touch any other user.
 */

import crypto from "node:crypto";
import postgres from "postgres";

const [username, password, email] = process.argv.slice(2);

if (!username || !password) {
  console.error("usage: DATABASE_URL=... node scripts/create-admin.mjs <username> <password> [email]");
  process.exit(2);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(2);
}

// legacy-sha256 format: "<salt>:<sha256(salt:password)>"
const salt = crypto.randomBytes(16).toString("hex");
const hash = crypto.createHash("sha256").update(`${salt}:${password}`).digest("hex");
const passwordHash = `${salt}:${hash}`;

const sql = postgres(process.env.DATABASE_URL, {
  ssl: "require",
  max: 1,
  prepare: false, // Supabase transaction pooler
});

try {
  const [row] = await sql`
    INSERT INTO users (username, password_hash, role, is_active, email, display_name)
    VALUES (${username}, ${passwordHash}, 'admin', true, ${email ?? null}, ${username})
    ON CONFLICT (username) DO UPDATE SET
      password_hash = EXCLUDED.password_hash,
      role          = 'admin',
      is_active     = true,
      email         = COALESCE(EXCLUDED.email, users.email)
    RETURNING id, username, role, is_active, email
  `;
  console.log("admin ready:", row);

  // Sanity: verify the row is selectable + active (catches RLS/role surprises).
  const check = await sql`
    SELECT id FROM users WHERE username = ${username} AND is_active = true
  `;
  if (check.length !== 1) {
    console.error(
      "WARNING: the row was written but is not selectable as active — check the " +
      "DB role (RLS bypass requires the postgres/service role) and is_active."
    );
    process.exit(1);
  }
  console.log(`\nDone. Sign in at /login (or /admin/login) as "${username}".`);
} catch (err) {
  console.error("failed:", err?.message ?? err);
  process.exit(1);
} finally {
  await sql.end({ timeout: 5 });
}
