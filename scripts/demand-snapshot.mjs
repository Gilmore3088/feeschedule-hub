#!/usr/bin/env node
/**
 * Writes .demand-snapshot.json — the numbers the session brief shows at start.
 *
 * The session brief must never open a database connection: it runs on a short
 * hook timeout, on planes and in offline shells, and a slow or failed query
 * there would delay or break every session. So the brief reads a cached file
 * and this script is what refreshes it.
 *
 *   npm run demand
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const env = readFileSync(join(ROOT, ".env.local"), "utf8");
    const line = env.split("\n").find((l) => l.startsWith("DATABASE_URL="));
    if (line) return line.slice("DATABASE_URL=".length).trim().replace(/^["']|["']$/g, "");
  } catch { /* fall through */ }
  return null;
}

const url = databaseUrl();
if (!url) {
  console.error("No DATABASE_URL (checked env and .env.local).");
  process.exit(1);
}

const sql = postgres(url, { max: 1, idle_timeout: 5, connect_timeout: 10 });
const PAYING = ["active", "trialing", "past_due"];

async function count(label, run) {
  try { return Number((await run())[0]?.n ?? 0); }
  catch { warnings.push(label); return null; }
}
const warnings = [];

try {
  const [leads, reportRequests, registrations, reportsGenerated, paying] = await Promise.all([
    count("leads", () => sql`SELECT count(*)::int AS n FROM leads WHERE created_at >= now() - interval '7 days'`),
    count("report_leads", () => sql`SELECT count(*)::int AS n FROM report_leads WHERE requested_at >= now() - interval '7 days'`),
    count("users", () => sql`SELECT count(*)::int AS n FROM users WHERE created_at >= now() - interval '7 days'`),
    count("hamilton_reports", () => sql`SELECT count(*)::int AS n FROM hamilton_reports WHERE created_at >= now() - interval '7 days'`),
    count("subscriptions", () => sql`SELECT count(*)::int AS n FROM users WHERE subscription_status = ANY(${PAYING})`),
  ]);

  const snapshot = {
    takenAt: new Date().toISOString(),
    windowDays: 7,
    leads, reportRequests, registrations, reportsGenerated, paying,
    warnings,
  };
  writeFileSync(join(ROOT, ".demand-snapshot.json"), JSON.stringify(snapshot, null, 2) + "\n");
  console.log(
    `${leads ?? "?"} leads · ${registrations ?? "?"} signups · ` +
    `${reportsGenerated ?? "?"} reports · ${paying ?? "?"} paying` +
    (warnings.length ? `  (unreadable: ${warnings.join(", ")})` : ""),
  );
} finally {
  await sql.end({ timeout: 5 });
}
