import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), "data", "crawler.db");

export function runMigrations() {
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");

  try {
    // Check if users table has the email column (migration already ran)
    const cols = db.pragma("table_info(users)") as { name: string }[];
    const hasEmail = cols.some((c) => c.name === "email");

    if (hasEmail) {
      console.log("[migrate] 001-payments already applied, skipping.");
      return;
    }

    console.log("[migrate] Applying 001-payments...");

    // Run ALTER TABLE statements individually (each can fail independently)
    const alters = [
      "ALTER TABLE users ADD COLUMN email TEXT",
      "ALTER TABLE users ADD COLUMN stripe_customer_id TEXT",
      "ALTER TABLE users ADD COLUMN subscription_status TEXT DEFAULT 'none'",
    ];

    for (const sql of alters) {
      try {
        db.exec(sql);
      } catch (e) {
        // Column may already exist from partial run
        if (!(e instanceof Error && e.message.includes("duplicate column"))) {
          throw e;
        }
      }
    }

    // Indexes and tables are idempotent (IF NOT EXISTS)
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email
        ON users(email) WHERE email IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_stripe_customer
        ON users(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;

      CREATE TABLE IF NOT EXISTS stripe_events (
        id                TEXT PRIMARY KEY,
        event_type        TEXT NOT NULL,
        stripe_customer_id TEXT,
        payload_json      TEXT NOT NULL,
        processed_at      TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_stripe_events_type ON stripe_events(event_type);
    `);

    console.log("[migrate] 001-payments applied successfully.");
  } finally {
    db.close();
  }
}

// Run directly: npx tsx src/lib/crawler-db/migrate.ts
if (require.main === module) {
  runMigrations();
}
