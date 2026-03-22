#!/usr/bin/env node
/**
 * Run a SQL file against the Supabase Postgres database.
 * Usage: DATABASE_URL=... node scripts/run-sql.js scripts/migrate-schema.sql
 */
const fs = require('fs');
const postgres = require('postgres');

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/run-sql.js <sql-file>');
  process.exit(1);
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL environment variable required');
  process.exit(1);
}

const sqlContent = fs.readFileSync(file, 'utf8');
const sql = postgres(DATABASE_URL, { ssl: 'require' });

(async () => {
  try {
    console.log(`Running ${file}...`);
    await sql.unsafe(sqlContent);
    console.log('Done.');

    // List created tables
    const tables = await sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `;
    console.log(`\nTables created: ${tables.length}`);
    tables.forEach(t => console.log(`  ${t.table_name}`));

    await sql.end();
  } catch (e) {
    console.error('Error:', e.message);
    await sql.end();
    process.exit(1);
  }
})();
