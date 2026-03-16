import Database from "better-sqlite3";
import path from "path";

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), "data", "crawler.db");

let _singleton: InstanceType<typeof Database> | null = null;

// Minimal table stubs so queries return empty results during CI builds
const STUB_TABLES = `
  CREATE TABLE IF NOT EXISTS crawl_targets (id INTEGER PRIMARY KEY, institution_name TEXT, website_url TEXT, fee_schedule_url TEXT, charter_type TEXT, state TEXT, state_code TEXT, city TEXT, asset_size INTEGER, cert_number TEXT, source TEXT, status TEXT, fed_district INTEGER, asset_size_tier TEXT, created_at TEXT, last_crawl_at TEXT, last_success_at TEXT, consecutive_failures INTEGER DEFAULT 0, document_type TEXT, last_content_hash TEXT, failure_reason TEXT, cms_platform TEXT);
  CREATE TABLE IF NOT EXISTS extracted_fees (id INTEGER PRIMARY KEY, crawl_result_id INTEGER, crawl_target_id INTEGER, fee_name TEXT, amount REAL, frequency TEXT, conditions TEXT, extraction_confidence REAL, review_status TEXT DEFAULT 'pending', validation_flags TEXT, fee_family TEXT, fee_category TEXT, account_product_type TEXT, created_at TEXT);
  CREATE TABLE IF NOT EXISTS crawl_results (id INTEGER PRIMARY KEY, crawl_run_id INTEGER, crawl_target_id INTEGER, status TEXT, document_url TEXT, document_path TEXT, content_hash TEXT, fees_extracted INTEGER, error_message TEXT, crawled_at TEXT);
  CREATE TABLE IF NOT EXISTS crawl_runs (id INTEGER PRIMARY KEY, trigger_type TEXT, status TEXT, targets_total INTEGER, targets_crawled INTEGER, targets_succeeded INTEGER, targets_failed INTEGER, targets_unchanged INTEGER, fees_extracted INTEGER, started_at TEXT, completed_at TEXT);
  CREATE TABLE IF NOT EXISTS institution_financials (id INTEGER PRIMARY KEY, crawl_target_id INTEGER, report_date TEXT, source TEXT, total_assets INTEGER, total_deposits INTEGER, total_loans INTEGER, service_charge_income INTEGER, other_noninterest_income INTEGER, net_interest_margin REAL, efficiency_ratio REAL, roa REAL, roe REAL, tier1_capital_ratio REAL, branch_count INTEGER, employee_count INTEGER, member_count INTEGER, raw_json TEXT, fetched_at TEXT, total_revenue INTEGER, fee_income_ratio REAL);
  CREATE TABLE IF NOT EXISTS institution_complaints (id INTEGER PRIMARY KEY, crawl_target_id INTEGER, report_period TEXT, product TEXT, issue TEXT, complaint_count INTEGER, fetched_at TEXT);
  CREATE TABLE IF NOT EXISTS fee_reviews (id INTEGER PRIMARY KEY, fee_id INTEGER, action TEXT, user_id INTEGER, username TEXT, previous_status TEXT, new_status TEXT, previous_values TEXT, new_values TEXT, notes TEXT, created_at TEXT);
  CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, username TEXT, password_hash TEXT, display_name TEXT, role TEXT, is_active INTEGER, created_at TEXT, email TEXT, stripe_customer_id TEXT, subscription_status TEXT DEFAULT 'none', institution_name TEXT, institution_type TEXT, asset_tier TEXT, state_code TEXT, job_role TEXT, interests TEXT);
  CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, user_id INTEGER, expires_at TEXT, created_at TEXT);
  CREATE TABLE IF NOT EXISTS analysis_results (id INTEGER PRIMARY KEY, crawl_target_id INTEGER, analysis_type TEXT, result_json TEXT, computed_at TEXT);
  CREATE TABLE IF NOT EXISTS fed_beige_book (id INTEGER PRIMARY KEY, release_date TEXT, release_code TEXT, fed_district INTEGER, section_name TEXT, content_text TEXT, source_url TEXT, fetched_at TEXT);
  CREATE TABLE IF NOT EXISTS fed_content (id INTEGER PRIMARY KEY, content_type TEXT, title TEXT, speaker TEXT, fed_district INTEGER, source_url TEXT, published_at TEXT, description TEXT, source_feed TEXT, fetched_at TEXT);
  CREATE TABLE IF NOT EXISTS fed_economic_indicators (id INTEGER PRIMARY KEY, series_id TEXT, series_title TEXT, fed_district INTEGER, observation_date TEXT, value REAL, units TEXT, frequency TEXT, fetched_at TEXT);
  CREATE TABLE IF NOT EXISTS fee_snapshots (id INTEGER PRIMARY KEY, crawl_target_id INTEGER, crawl_result_id INTEGER, snapshot_date TEXT, fee_name TEXT, fee_category TEXT, amount REAL, frequency TEXT, conditions TEXT, account_product_type TEXT, extraction_confidence REAL, created_at TEXT);
  CREATE TABLE IF NOT EXISTS fee_change_events (id INTEGER PRIMARY KEY, crawl_target_id INTEGER, fee_category TEXT, previous_amount REAL, new_amount REAL, change_type TEXT, detected_at TEXT);
  CREATE TABLE IF NOT EXISTS ops_jobs (id INTEGER PRIMARY KEY, command TEXT, params_json TEXT, status TEXT, triggered_by TEXT, target_id INTEGER, crawl_run_id INTEGER, pid INTEGER, log_path TEXT, started_at TEXT, completed_at TEXT, exit_code INTEGER, stdout_tail TEXT, error_summary TEXT, result_summary TEXT, created_at TEXT);
  CREATE TABLE IF NOT EXISTS discovery_cache (id INTEGER PRIMARY KEY, crawl_target_id INTEGER, discovery_method TEXT, attempted_at TEXT, result TEXT, found_url TEXT, error_message TEXT);
  CREATE TABLE IF NOT EXISTS community_submissions (id INTEGER PRIMARY KEY, crawl_target_id INTEGER, institution_name TEXT, fee_name TEXT, fee_category TEXT, amount REAL, frequency TEXT, source_url TEXT, submitter_ip TEXT, review_status TEXT, created_at TEXT);
  CREATE TABLE IF NOT EXISTS research_usage (id INTEGER PRIMARY KEY, user_id INTEGER, agent_id TEXT, input_tokens INTEGER, output_tokens INTEGER, estimated_cost_cents REAL, created_at TEXT);
  CREATE TABLE IF NOT EXISTS stripe_events (id TEXT PRIMARY KEY, event_type TEXT NOT NULL, stripe_customer_id TEXT, payload_json TEXT NOT NULL, processed_at TEXT NOT NULL DEFAULT (datetime('now')));
  CREATE TABLE IF NOT EXISTS leads (id INTEGER PRIMARY KEY, name TEXT, email TEXT, company TEXT, role TEXT, use_case TEXT, source TEXT DEFAULT 'coming_soon', status TEXT DEFAULT 'new', created_at TEXT);
  CREATE TABLE IF NOT EXISTS api_keys (id INTEGER PRIMARY KEY, user_id INTEGER, key_hash TEXT, key_prefix TEXT, tier TEXT DEFAULT 'pro', monthly_limit INTEGER DEFAULT 5000, call_count INTEGER DEFAULT 0, last_used_at TEXT, is_active INTEGER DEFAULT 1, created_at TEXT);
`;

function isStubDb(db: InstanceType<typeof Database>): boolean {
  try {
    const row = db.prepare("SELECT COUNT(*) as cnt FROM crawl_targets").get() as { cnt: number };
    return row.cnt === 0 && db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='_stub'").get() !== undefined;
  } catch {
    return true;
  }
}

export function getDb() {
  if (!_singleton) {
    _singleton = new Database(DB_PATH, { readonly: false });
    _singleton.pragma("journal_mode = WAL");
    _singleton.pragma("synchronous = normal");
    _singleton.pragma("cache_size = -32000");
    _singleton.pragma("mmap_size = 268435456");
    _singleton.pragma("temp_store = memory");
    _singleton.pragma("busy_timeout = 5000");
    _singleton.pragma("foreign_keys = ON");

    // During CI builds, the DB is a stub -- create empty tables so queries don't crash
    if (isStubDb(_singleton)) {
      _singleton.exec(STUB_TABLES);
    }
  }
  return _singleton;
}

/** Returns true if the DB has real data (not a CI stub). */
export function hasData(): boolean {
  try {
    const db = getDb();
    const row = db.prepare("SELECT COUNT(*) as cnt FROM crawl_targets").get() as { cnt: number };
    return row.cnt > 0;
  } catch {
    return false;
  }
}

export function getWriteDb() {
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = normal");
  db.pragma("cache_size = -32000");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  return db;
}
