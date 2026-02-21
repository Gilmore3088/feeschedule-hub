#!/usr/bin/env npx tsx
/**
 * Weekly fee change digest emailer.
 * Run: npx tsx scripts/send-weekly-digest.ts [--dry-run]
 */

import Database from "better-sqlite3";
import path from "path";

const DB_PATH =
  process.env.DB_PATH || path.join(process.cwd(), "data", "crawler.db");

// We need to manually replicate some logic since this runs outside Next.js
const db = new Database(DB_PATH, { readonly: true });
db.pragma("journal_mode = WAL");

const isDryRun = process.argv.includes("--dry-run");

interface AlertPref {
  organization_id: number;
  categories: string | null;
  frequency: string;
  enabled: number;
}

interface OrgMember {
  email: string;
  name: string | null;
  org_name: string;
}

// Get all orgs with active subscriptions and enabled alerts
const subscribers = db
  .prepare(
    `SELECT DISTINCT ap.organization_id, ap.categories, ap.frequency, ap.enabled
     FROM alert_preferences ap
     JOIN subscriptions s ON s.organization_id = ap.organization_id
     WHERE ap.enabled = 1
       AND s.status IN ('active', 'trialing')
       AND ap.frequency = 'weekly'`
  )
  .all() as AlertPref[];

if (subscribers.length === 0) {
  console.log("No subscribers with active weekly alerts.");
  process.exit(0);
}

// Get fee changes from last 7 days
const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
const changes = db
  .prepare(
    `SELECT
      ct.institution_name,
      fs.fee_category,
      fs.amount as new_amount,
      fs.snapshot_date,
      prev.amount as old_amount
     FROM fee_snapshots fs
     JOIN crawl_targets ct ON fs.crawl_target_id = ct.id
     JOIN fee_snapshots prev ON prev.crawl_target_id = fs.crawl_target_id
       AND prev.fee_category = fs.fee_category
       AND prev.snapshot_date < fs.snapshot_date
     WHERE fs.snapshot_date >= ?
       AND fs.amount IS NOT NULL
       AND prev.amount IS NOT NULL
       AND fs.amount != prev.amount
     ORDER BY fs.snapshot_date DESC
     LIMIT 100`
  )
  .all(cutoff) as {
  institution_name: string;
  fee_category: string;
  new_amount: number;
  snapshot_date: string;
  old_amount: number;
}[];

const newInstitutions = (
  db
    .prepare("SELECT COUNT(*) as cnt FROM crawl_targets WHERE created_at >= ?")
    .get(cutoff) as { cnt: number }
).cnt;

console.log(`Found ${changes.length} fee changes, ${newInstitutions} new institutions.`);
console.log(`Sending to ${subscribers.length} subscriber(s)...`);

for (const sub of subscribers) {
  const members = db
    .prepare(
      `SELECT m.email, m.name, o.name as org_name
       FROM org_members m
       JOIN organizations o ON m.organization_id = o.id
       WHERE m.organization_id = ?`
    )
    .all(sub.organization_id) as OrgMember[];

  for (const member of members) {
    if (isDryRun) {
      console.log(`[DRY RUN] Would send to: ${member.email} (${member.org_name})`);
      console.log(`  Changes: ${changes.length}, New institutions: ${newInstitutions}`);
    } else {
      console.log(`Sending to: ${member.email} (${member.org_name})`);
      // In production, call the email API here
      // For now, log the action
    }
  }
}

console.log("Done.");
db.close();
