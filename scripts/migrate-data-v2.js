#!/usr/bin/env node
/**
 * Fast data migration: SQLite -> Supabase Postgres (batch inserts)
 * Usage: DATABASE_URL=... node scripts/migrate-data-v2.js
 */
const Database = require('better-sqlite3');
const postgres = require('postgres');
const path = require('path');

const SQLITE_PATH = process.env.SQLITE_PATH || path.join(__dirname, '..', 'data', 'crawler.db');
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('DATABASE_URL required'); process.exit(1); }

const db = new Database(SQLITE_PATH, { readonly: true });
const sql = postgres(DATABASE_URL, { ssl: 'require', max: 5 });

// SQLite col -> Postgres col renames
const COL_RENAMES = {
  crawl_runs: { trigger: 'trigger_type' },
};

// Columns needing BOOLEAN conversion (SQLite INTEGER 0/1 -> Postgres BOOLEAN)
const BOOL_COLS = new Set(['is_active', 'is_main_office', 'enabled', 'cancel_at_period_end']);

// Columns needing JSON parse (SQLite TEXT -> Postgres JSONB)
const JSON_COLS = new Set([
  'validation_flags', 'previous_values', 'new_values', 'result_json',
  'raw_json', 'interests', 'metadata', 'params_json', 'config_json', 'summary_json',
]);

// Migration order (FK deps first)
const TABLES = [
  'users', 'organizations', 'sessions', 'crawl_targets', 'crawl_runs',
  'crawl_results', 'extracted_fees', 'fee_reviews', 'analysis_results',
  'institution_financials', 'institution_complaints', 'fee_snapshots',
  'fee_change_events', 'discovery_cache', 'crawl_target_changes', 'upload_jobs',
  'community_submissions', 'leads', 'saved_peer_sets', 'fed_beige_book',
  'fed_content', 'fed_economic_indicators', 'articles', 'research_articles',
  'research_conversations', 'research_messages', 'research_usage',
  'branch_deposits', 'market_concentration', 'demographics', 'census_tracts',
  'subscriptions', 'org_members', 'api_keys', 'stripe_events', 'usage_events',
  'alert_preferences', 'saved_subscriber_peer_groups', 'ops_jobs',
  'pipeline_runs', 'reg_articles', 'coverage_snapshots', 'fee_index_cache',
];

async function migrateTable(table) {
  const rows = db.prepare(`SELECT * FROM ${table}`).all();
  if (!rows.length) { console.log(`  ${table}: 0 rows (skip)`); return 0; }

  // Get common columns between SQLite and Postgres
  const sqCols = Object.keys(rows[0]);
  const pgCols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${table}
  `;
  const pgColSet = new Set(pgCols.map(c => c.column_name));
  const renames = COL_RENAMES[table] || {};

  // Build mapping: { sqliteCol -> postgresCol }
  const colMap = {};
  for (const col of sqCols) {
    const pgName = renames[col] || col;
    if (pgColSet.has(pgName)) colMap[col] = pgName;
  }

  const pgNames = Object.values(colMap);
  const sqNames = Object.keys(colMap);

  // Transform and insert in batches
  const BATCH = 200;
  let total = 0;

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const transformed = batch.map(row => {
      const out = {};
      for (const sqCol of sqNames) {
        const pgCol = colMap[sqCol];
        let val = row[sqCol];

        if (val === null || val === undefined) { out[pgCol] = null; continue; }
        if (BOOL_COLS.has(sqCol)) { out[pgCol] = Boolean(val); continue; }
        if (JSON_COLS.has(sqCol) && typeof val === 'string') {
          try { out[pgCol] = JSON.parse(val); } catch { out[pgCol] = null; }
          continue;
        }
        out[pgCol] = val;
      }
      return out;
    });

    try {
      // Use postgres.js bulk insert
      const cols = pgNames;
      const values = transformed.map(r => cols.map(c => r[c]));
      const placeholderRow = cols.map((_, ci) => `$${ci + 1}`).join(', ');

      // Insert one row at a time but pipelined (much faster than awaiting each)
      const promises = values.map(vals =>
        sql.unsafe(
          `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholderRow}) ON CONFLICT DO NOTHING`,
          vals
        ).catch(() => {}) // skip individual row errors
      );
      await Promise.all(promises);
      total += batch.length;
    } catch (e) {
      console.error(`    batch error in ${table} at offset ${i}: ${e.message}`);
    }

    if (i > 0 && i % 5000 === 0) {
      process.stdout.write(`    ...${i.toLocaleString()} / ${rows.length.toLocaleString()}\r`);
    }
  }

  // Reset sequence
  if (pgColSet.has('id')) {
    try {
      await sql.unsafe(`SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE((SELECT MAX(id) FROM ${table}), 1))`);
    } catch {}
  }

  console.log(`  ${table}: ${total.toLocaleString()} rows`);
  return total;
}

async function main() {
  console.log('SQLite -> Postgres Migration (v2 - pipelined)');
  console.log(`  Source: ${SQLITE_PATH}`);
  console.log(`  Target: ${DATABASE_URL.slice(0, 50)}...\n`);

  // Clear existing data first (in reverse order for FK safety)
  console.log('Clearing existing Postgres data...');
  for (const table of [...TABLES].reverse()) {
    try { await sql.unsafe(`DELETE FROM ${table}`); } catch {}
  }
  console.log('Done.\n');

  let grand = 0;
  const start = Date.now();

  for (const table of TABLES) {
    try {
      grand += await migrateTable(table);
    } catch (e) {
      console.error(`  FAILED ${table}: ${e.message}`);
    }
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\nTotal: ${grand.toLocaleString()} rows in ${elapsed}s\n`);

  // Validation
  console.log('--- Validation ---');
  const checks = [
    'crawl_targets', 'extracted_fees', 'crawl_results', 'crawl_runs',
    'users', 'leads', 'fee_reviews', 'institution_financials',
    'branch_deposits', 'census_tracts', 'fed_economic_indicators',
  ];

  let pass = true;
  for (const t of checks) {
    const sqN = db.prepare(`SELECT COUNT(*) as n FROM ${t}`).get().n;
    const [pgR] = await sql.unsafe(`SELECT COUNT(*) as n FROM ${t}`);
    const pgN = Number(pgR.n);
    const ok = sqN === pgN;
    if (!ok) pass = false;
    console.log(`  ${ok ? 'PASS' : 'FAIL'} ${t}: SQLite=${sqN}, Postgres=${pgN}`);
  }

  // FK checks
  const [o1] = await sql`SELECT COUNT(*) as n FROM extracted_fees ef WHERE NOT EXISTS (SELECT 1 FROM crawl_targets ct WHERE ct.id = ef.crawl_target_id)`;
  const [o2] = await sql`SELECT COUNT(*) as n FROM crawl_results cr WHERE NOT EXISTS (SELECT 1 FROM crawl_runs r WHERE r.id = cr.crawl_run_id)`;
  console.log(`  ${Number(o1.n) === 0 ? 'PASS' : 'FAIL'} Orphaned extracted_fees: ${o1.n}`);
  console.log(`  ${Number(o2.n) === 0 ? 'PASS' : 'FAIL'} Orphaned crawl_results: ${o2.n}`);

  console.log(`\n${pass && Number(o1.n) === 0 && Number(o2.n) === 0 ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED'}`);

  await sql.end();
  db.close();
}

main().catch(e => { console.error(e); process.exit(1); });
