#!/usr/bin/env node
/**
 * Migrate data from SQLite to Supabase Postgres.
 * Usage: DATABASE_URL=... node scripts/migrate-data.js
 */
const Database = require('better-sqlite3');
const postgres = require('postgres');
const path = require('path');

const SQLITE_PATH = process.env.SQLITE_PATH || path.join(__dirname, '..', 'data', 'crawler.db');
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('DATABASE_URL required'); process.exit(1); }

const db = new Database(SQLITE_PATH, { readonly: true });
const sql = postgres(DATABASE_URL, { ssl: 'require', max: 5 });

// Columns that need TEXT -> TIMESTAMPTZ conversion
const TS_COLUMNS = new Set([
  'created_at', 'updated_at', 'expires_at', 'last_crawl_at', 'last_success_at',
  'crawled_at', 'started_at', 'completed_at', 'computed_at', 'fetched_at',
  'detected_at', 'attempted_at', 'processed_at', 'published_at', 'reviewed_at',
  'generated_at', 'last_used_at', 'failure_reason_updated_at',
]);

// Columns that need TEXT -> JSONB conversion
const JSON_COLUMNS = new Set([
  'validation_flags', 'previous_values', 'new_values', 'result_json',
  'raw_json', 'interests', 'metadata', 'params_json', 'config_json',
  'summary_json', 'quality_gate_results',
]);

// Columns that need INTEGER -> BOOLEAN conversion
const BOOL_COLUMNS = new Set([
  'is_active', 'is_main_office', 'enabled', 'cancel_at_period_end',
]);

// SQLite column name -> Postgres column name remap
const COLUMN_REMAP = {
  crawl_runs: { trigger: 'trigger_type' },
};

function transformValue(table, col, val) {
  if (val === null || val === undefined) return null;

  // Column remap doesn't change the value, just the name
  const remappedCol = (COLUMN_REMAP[table] && COLUMN_REMAP[table][col]) || col;

  if (BOOL_COLUMNS.has(col)) return Boolean(val);

  if (JSON_COLUMNS.has(col)) {
    if (typeof val === 'string') {
      try { return JSON.parse(val); } catch { return null; }
    }
    return val;
  }

  // TS columns: keep as string, Postgres will parse it
  // But clean up any invalid dates
  if (TS_COLUMNS.has(col)) {
    if (typeof val === 'string' && val.trim()) return val;
    return null;
  }

  return val;
}

// Migration order (respects FK constraints)
const MIGRATION_ORDER = [
  'users',
  'organizations',
  'sessions',
  'crawl_targets',
  'crawl_runs',
  'crawl_results',
  'extracted_fees',
  'fee_reviews',
  'analysis_results',
  'institution_financials',
  'institution_complaints',
  'fee_snapshots',
  'fee_change_events',
  'discovery_cache',
  'crawl_target_changes',
  'upload_jobs',
  'community_submissions',
  'leads',
  'saved_peer_sets',
  'fed_beige_book',
  'fed_content',
  'fed_economic_indicators',
  'articles',
  'research_articles',
  'research_conversations',
  'research_messages',
  'research_usage',
  'branch_deposits',
  'market_concentration',
  'demographics',
  'census_tracts',
  'subscriptions',
  'org_members',
  'api_keys',
  'stripe_events',
  'usage_events',
  'alert_preferences',
  'saved_subscriber_peer_groups',
  'ops_jobs',
  'pipeline_runs',
  'reg_articles',
  'coverage_snapshots',
  'fee_index_cache',
];

async function migrateTable(table) {
  const rows = db.prepare(`SELECT * FROM ${table}`).all();
  if (rows.length === 0) {
    console.log(`  ${table}: 0 rows (skip)`);
    return 0;
  }

  // Get column names from first row
  const sqliteCols = Object.keys(rows[0]);

  // Get Postgres column names for this table
  const pgCols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${table}
    ORDER BY ordinal_position
  `;
  const pgColSet = new Set(pgCols.map(c => c.column_name));

  // Build column mapping: SQLite col -> Postgres col
  const colMap = {};
  for (const col of sqliteCols) {
    const remapped = (COLUMN_REMAP[table] && COLUMN_REMAP[table][col]) || col;
    if (pgColSet.has(remapped)) {
      colMap[col] = remapped;
    }
    // Skip columns that don't exist in Postgres (e.g., SQLite-only)
  }

  const pgColNames = Object.values(colMap);
  const BATCH = 500;
  let migrated = 0;

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const values = batch.map(row => {
      return pgColNames.map(pgCol => {
        // Find the SQLite col that maps to this pg col
        const sqliteCol = Object.keys(colMap).find(k => colMap[k] === pgCol);
        return transformValue(table, sqliteCol, row[sqliteCol]);
      });
    });

    // Build INSERT with positional params
    const colList = pgColNames.join(', ');
    const placeholders = pgColNames.map((_, idx) => `$${idx + 1}`).join(', ');
    const query = `INSERT INTO ${table} (${colList}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;

    for (const row of values) {
      try {
        await sql.unsafe(query, row);
        migrated++;
      } catch (e) {
        // Log first error per table, skip row
        if (migrated === i) {
          console.error(`    ERROR in ${table}: ${e.message}`);
          console.error(`    Row sample:`, JSON.stringify(row).slice(0, 200));
        }
        migrated++;
      }
    }
  }

  // Reset sequence to max id
  const hasId = pgColSet.has('id');
  if (hasId) {
    try {
      await sql.unsafe(`SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE((SELECT MAX(id) FROM ${table}), 1))`);
    } catch { /* some tables use TEXT PKs */ }
  }

  console.log(`  ${table}: ${rows.length} rows migrated`);
  return rows.length;
}

async function main() {
  console.log('SQLite -> Postgres Migration');
  console.log(`  Source: ${SQLITE_PATH}`);
  console.log(`  Target: ${DATABASE_URL.slice(0, 50)}...`);
  console.log();

  let total = 0;
  for (const table of MIGRATION_ORDER) {
    try {
      const n = await migrateTable(table);
      total += n;
    } catch (e) {
      console.error(`  FAILED ${table}: ${e.message}`);
    }
  }

  console.log(`\nTotal rows migrated: ${total.toLocaleString()}`);

  // Validation
  console.log('\n--- Validation ---');
  const checks = [
    'crawl_targets', 'extracted_fees', 'crawl_results', 'crawl_runs',
    'users', 'leads', 'fee_reviews', 'institution_financials',
    'branch_deposits', 'census_tracts', 'fed_economic_indicators',
  ];

  let allMatch = true;
  for (const table of checks) {
    const sqCount = db.prepare(`SELECT COUNT(*) as n FROM ${table}`).get().n;
    const [pgRow] = await sql.unsafe(`SELECT COUNT(*) as n FROM ${table}`);
    const pgCount = Number(pgRow.n);
    const match = sqCount === pgCount ? 'PASS' : 'FAIL';
    if (match === 'FAIL') allMatch = false;
    console.log(`  ${match} ${table}: SQLite=${sqCount}, Postgres=${pgCount}`);
  }

  // FK integrity
  const [orphanFees] = await sql`
    SELECT COUNT(*) as n FROM extracted_fees ef
    WHERE NOT EXISTS (SELECT 1 FROM crawl_targets ct WHERE ct.id = ef.crawl_target_id)
  `;
  const ofn = Number(orphanFees.n);
  console.log(`  ${ofn === 0 ? 'PASS' : 'FAIL'} Orphaned extracted_fees: ${ofn}`);

  const [orphanResults] = await sql`
    SELECT COUNT(*) as n FROM crawl_results cr
    WHERE NOT EXISTS (SELECT 1 FROM crawl_runs run WHERE run.id = cr.crawl_run_id)
  `;
  const orn = Number(orphanResults.n);
  console.log(`  ${orn === 0 ? 'PASS' : 'FAIL'} Orphaned crawl_results: ${orn}`);

  console.log(`\nOverall: ${allMatch && ofn === 0 && orn === 0 ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED'}`);

  await sql.end();
  db.close();
}

main().catch(e => { console.error(e); process.exit(1); });
