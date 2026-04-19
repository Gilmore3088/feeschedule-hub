#!/usr/bin/env node
// Reliability Roadmap #9 — reusable migration applier.
//
// Applies a single migration file and records it in schema_migrations. Safe to
// re-run; skips files already recorded as applied.
//
// Usage:
//   node scripts/apply-migration.mjs 20260418_schema_migrations_tracking.sql
//   node scripts/apply-migration.mjs --pending         # apply every un-applied file
//   node scripts/apply-migration.mjs --status          # list applied vs pending
//
// DATABASE_URL must be set in env (.env is loaded automatically).

import fs from "fs";
import path from "path";
import crypto from "crypto";
import postgres from "postgres";
import { config } from "dotenv";

config();

const MIGRATIONS_DIR = "supabase/migrations";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });

async function ensureTrackingTable() {
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename    TEXT PRIMARY KEY,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      applied_by  TEXT,
      checksum    TEXT
    )
  `);
}

async function listAppliedFilenames() {
  const rows = await sql`SELECT filename FROM schema_migrations`;
  return new Set(rows.map((r) => r.filename));
}

function allFilesOnDisk() {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

function checksum(body) {
  return crypto.createHash("sha256").update(body).digest("hex").slice(0, 16);
}

async function applyOne(filename) {
  const full = path.join(MIGRATIONS_DIR, filename);
  if (!fs.existsSync(full)) {
    throw new Error(`Migration file not found: ${full}`);
  }
  const body = fs.readFileSync(full, "utf8");
  const [already] = await sql`SELECT 1 FROM schema_migrations WHERE filename = ${filename}`;
  if (already) {
    console.log(`SKIP  ${filename} (already applied)`);
    return "skipped";
  }
  try {
    await sql.unsafe(body);
  } catch (err) {
    console.error(`FAIL  ${filename}: ${err.message}`);
    throw err;
  }
  await sql`
    INSERT INTO schema_migrations (filename, checksum, applied_by)
    VALUES (${filename}, ${checksum(body)}, ${process.env.USER ?? "unknown"})
    ON CONFLICT (filename) DO NOTHING
  `;
  console.log(`OK    ${filename}`);
  return "applied";
}

async function status() {
  const applied = await listAppliedFilenames();
  const files = allFilesOnDisk();
  let okCount = 0;
  let pendingCount = 0;
  for (const f of files) {
    if (applied.has(f)) {
      okCount++;
      console.log(`OK       ${f}`);
    } else {
      pendingCount++;
      console.log(`PENDING  ${f}`);
    }
  }
  console.log(`\n${okCount} applied · ${pendingCount} pending`);
}

async function applyPending() {
  const applied = await listAppliedFilenames();
  const files = allFilesOnDisk();
  const pending = files.filter((f) => !applied.has(f));
  if (pending.length === 0) {
    console.log("No pending migrations.");
    return;
  }
  console.log(`Applying ${pending.length} pending migration(s)...`);
  for (const f of pending) {
    await applyOne(f);
  }
}

async function main() {
  await ensureTrackingTable();
  const arg = process.argv[2];
  if (!arg) {
    console.error("Usage: apply-migration.mjs <filename> | --pending | --status");
    process.exit(2);
  }
  if (arg === "--status") {
    await status();
  } else if (arg === "--pending") {
    await applyPending();
  } else {
    await applyOne(arg);
  }
}

try {
  await main();
  process.exit(0);
} catch (err) {
  console.error(err);
  process.exit(1);
} finally {
  await sql.end();
}
