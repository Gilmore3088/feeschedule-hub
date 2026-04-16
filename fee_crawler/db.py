"""Database layer. SQLite for dev, PostgreSQL/Supabase for production.

When DATABASE_URL is set, uses PostgreSQL via psycopg2.
Otherwise, falls back to SQLite at the path in config.yaml.

Schema authority (Phase 60.1):
  SQLite supports only the legacy tables: crawl_targets, crawl_runs,
  crawl_results, extracted_fees. Pipeline tables (jobs, platform_registry,
  cms_confidence, document_r2_key, document_type_detected,
  doc_classification_confidence) are Postgres-only — they are defined in
  supabase/migrations/ and have no SQLite parity. Use require_postgres()
  at every call site that touches pipeline tables.
"""

import os
import sqlite3
import threading
from contextlib import contextmanager
from pathlib import Path

from fee_crawler.config import Config

_thread_local = threading.local()
_DATABASE_URL = os.environ.get("DATABASE_URL")

# Pipeline tables that exist only in Postgres (supabase/migrations/).
# SQLite has no parity for these — see require_postgres().
_PIPELINE_TABLES_REQUIRING_POSTGRES = (
    "jobs",
    "platform_registry",
    "cms_confidence",
    "document_r2_key",
    "document_type_detected",
    "doc_classification_confidence",
)


def require_postgres(reason: str) -> None:
    """Raise if DATABASE_URL is not configured.

    Pipeline tables (jobs, platform_registry, cms_confidence,
    document_r2_key, document_type_detected, doc_classification_confidence)
    are only created by supabase/migrations/* and have no SQLite parity.
    Calling SQLite-only paths against pipeline code will silently use a
    stale schema. Phase 60.1 retires that path.

    Call this at the top of every function that touches pipeline tables so
    that running without DATABASE_URL fails fast with an actionable message
    instead of hitting a stale or missing schema.
    """
    # Read live at call time — Modal secrets are injected into os.environ
    # after the module is imported, so a module-level snapshot would be stale.
    if not os.environ.get("DATABASE_URL"):
        raise RuntimeError(
            "SQLite not supported for pipeline tables; set DATABASE_URL "
            f"to a Postgres connection string. Reason: {reason}. "
            "See .planning/phases/60.1-audit-remediation-operational-reliability/ "
            "for the schema authority decision."
        )

_CREATE_CRAWL_TARGETS = """
CREATE TABLE IF NOT EXISTS crawl_targets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    institution_name TEXT NOT NULL,
    website_url TEXT,
    fee_schedule_url TEXT,
    charter_type TEXT NOT NULL,  -- bank | credit_union
    state TEXT,
    state_code TEXT,
    city TEXT,
    asset_size INTEGER,  -- in thousands
    cert_number TEXT,  -- FDIC cert or NCUA charter number
    source TEXT NOT NULL,  -- fdic | ncua
    status TEXT NOT NULL DEFAULT 'active',
    document_type TEXT,
    last_content_hash TEXT,
    last_crawl_at TEXT,
    last_success_at TEXT,
    fed_district INTEGER,  -- Federal Reserve district (1-12)
    asset_size_tier TEXT,  -- community_small | community_mid | community_large | regional | large_regional | super_regional
    consecutive_failures INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(source, cert_number)
);
"""

_MIGRATE_CRAWL_TARGETS = [
    "ALTER TABLE crawl_targets ADD COLUMN fed_district INTEGER",
    "ALTER TABLE crawl_targets ADD COLUMN asset_size_tier TEXT",
]

_CREATE_CRAWL_RUNS = """
CREATE TABLE IF NOT EXISTS crawl_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trigger TEXT NOT NULL,  -- scheduled | manual
    status TEXT NOT NULL DEFAULT 'running',
    targets_total INTEGER NOT NULL DEFAULT 0,
    targets_crawled INTEGER NOT NULL DEFAULT 0,
    targets_succeeded INTEGER NOT NULL DEFAULT 0,
    targets_failed INTEGER NOT NULL DEFAULT 0,
    targets_unchanged INTEGER NOT NULL DEFAULT 0,
    fees_extracted INTEGER NOT NULL DEFAULT 0,
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT
);
"""

_CREATE_CRAWL_RESULTS = """
CREATE TABLE IF NOT EXISTS crawl_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    crawl_run_id INTEGER NOT NULL REFERENCES crawl_runs(id),
    crawl_target_id INTEGER NOT NULL REFERENCES crawl_targets(id),
    status TEXT NOT NULL,  -- success | failed | unchanged
    document_url TEXT,
    document_path TEXT,  -- local file path
    content_hash TEXT,
    fees_extracted INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    crawled_at TEXT NOT NULL DEFAULT (datetime('now'))
);
"""

_CREATE_EXTRACTED_FEES = """
CREATE TABLE IF NOT EXISTS extracted_fees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    crawl_result_id INTEGER NOT NULL REFERENCES crawl_results(id),
    crawl_target_id INTEGER NOT NULL REFERENCES crawl_targets(id),
    fee_name TEXT NOT NULL,
    amount REAL,
    frequency TEXT,  -- per_occurrence | monthly | annual | one_time
    conditions TEXT,
    extraction_confidence REAL NOT NULL DEFAULT 0.0,
    review_status TEXT NOT NULL DEFAULT 'pending',  -- pending | staged | flagged | approved | rejected
    validation_flags TEXT,  -- JSON array of {rule, severity, message}
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
"""


_CREATE_ANALYSIS_RESULTS = """
CREATE TABLE IF NOT EXISTS analysis_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    crawl_target_id INTEGER NOT NULL REFERENCES crawl_targets(id),
    analysis_type TEXT NOT NULL,  -- peer_comparison | fee_summary
    result_json TEXT NOT NULL,
    computed_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(crawl_target_id, analysis_type)
);
"""


_CREATE_USERS = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'viewer',  -- viewer | analyst | admin
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
"""

_CREATE_FEE_REVIEWS = """
CREATE TABLE IF NOT EXISTS fee_reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fee_id INTEGER NOT NULL REFERENCES extracted_fees(id),
    action TEXT NOT NULL,  -- approve | reject | edit | flag | stage | reset
    user_id INTEGER REFERENCES users(id),
    username TEXT,
    previous_status TEXT,
    new_status TEXT,
    previous_values TEXT,  -- JSON snapshot before edit
    new_values TEXT,       -- JSON snapshot after edit
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
"""

_CREATE_SESSIONS = """
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,  -- random token
    user_id INTEGER NOT NULL REFERENCES users(id),
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
"""

_MIGRATE_EXTRACTED_FEES = [
    "ALTER TABLE extracted_fees ADD COLUMN validation_flags TEXT",
    "ALTER TABLE extracted_fees ADD COLUMN fee_family TEXT",
    "ALTER TABLE extracted_fees ADD COLUMN fee_category TEXT",
    "ALTER TABLE extracted_fees ADD COLUMN account_product_type TEXT",
]

_MIGRATE_CRAWL_TARGETS_V2 = [
    "ALTER TABLE crawl_targets ADD COLUMN cbsa_code TEXT",
    "ALTER TABLE crawl_targets ADD COLUMN cbsa_name TEXT",
    "ALTER TABLE crawl_targets ADD COLUMN urban_rural TEXT",
    "ALTER TABLE crawl_targets ADD COLUMN established_date TEXT",
    "ALTER TABLE crawl_targets ADD COLUMN specialty TEXT",
]

_CREATE_INSTITUTION_FINANCIALS = """
CREATE TABLE IF NOT EXISTS institution_financials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    crawl_target_id INTEGER NOT NULL REFERENCES crawl_targets(id),
    report_date TEXT NOT NULL,
    source TEXT NOT NULL,
    total_assets INTEGER,
    total_deposits INTEGER,
    total_loans INTEGER,
    service_charge_income INTEGER,
    other_noninterest_income INTEGER,
    net_interest_margin REAL,
    efficiency_ratio REAL,
    roa REAL,
    roe REAL,
    tier1_capital_ratio REAL,
    branch_count INTEGER,
    employee_count INTEGER,
    member_count INTEGER,
    raw_json TEXT,
    fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(crawl_target_id, report_date, source)
);
"""

_CREATE_INSTITUTION_COMPLAINTS = """
CREATE TABLE IF NOT EXISTS institution_complaints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    crawl_target_id INTEGER NOT NULL REFERENCES crawl_targets(id),
    report_period TEXT NOT NULL,
    product TEXT NOT NULL,
    issue TEXT,
    complaint_count INTEGER NOT NULL,
    fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(crawl_target_id, report_period, product, issue)
);
"""

_CREATE_FEE_SNAPSHOTS = """
CREATE TABLE IF NOT EXISTS fee_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    crawl_target_id INTEGER NOT NULL REFERENCES crawl_targets(id),
    crawl_result_id INTEGER REFERENCES crawl_results(id),
    snapshot_date TEXT NOT NULL,
    fee_name TEXT NOT NULL,
    fee_category TEXT,
    amount REAL,
    frequency TEXT,
    conditions TEXT,
    account_product_type TEXT,
    extraction_confidence REAL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(crawl_target_id, snapshot_date, fee_category)
);
"""

_CREATE_FEE_CHANGE_EVENTS = """
CREATE TABLE IF NOT EXISTS fee_change_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    crawl_target_id INTEGER NOT NULL REFERENCES crawl_targets(id),
    fee_category TEXT NOT NULL,
    previous_amount REAL,
    new_amount REAL,
    change_type TEXT NOT NULL,
    detected_at TEXT NOT NULL DEFAULT (datetime('now'))
);
"""

_CREATE_COVERAGE_SNAPSHOTS = """
CREATE TABLE IF NOT EXISTS coverage_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    snapshot_date TEXT NOT NULL,
    total_institutions INTEGER NOT NULL,
    with_fee_url INTEGER NOT NULL,
    with_fees INTEGER NOT NULL,
    with_approved INTEGER NOT NULL,
    total_fees INTEGER NOT NULL,
    approved_fees INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(snapshot_date)
);
"""

_CREATE_FED_BEIGE_BOOK = """
CREATE TABLE IF NOT EXISTS fed_beige_book (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    release_date TEXT NOT NULL,
    release_code TEXT NOT NULL,
    fed_district INTEGER,
    section_name TEXT NOT NULL,
    content_text TEXT NOT NULL,
    source_url TEXT NOT NULL,
    fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(release_code, fed_district, section_name)
);
"""

_CREATE_FED_CONTENT = """
CREATE TABLE IF NOT EXISTS fed_content (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content_type TEXT NOT NULL,
    title TEXT NOT NULL,
    speaker TEXT,
    fed_district INTEGER,
    source_url TEXT NOT NULL UNIQUE,
    published_at TEXT NOT NULL,
    description TEXT,
    source_feed TEXT,
    fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
);
"""

_CREATE_FED_ECONOMIC_INDICATORS = """
CREATE TABLE IF NOT EXISTS fed_economic_indicators (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    series_id TEXT NOT NULL,
    series_title TEXT,
    fed_district INTEGER,
    observation_date TEXT NOT NULL,
    value REAL,
    units TEXT,
    frequency TEXT,
    fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(series_id, observation_date)
);
"""


_CREATE_DISCOVERY_CACHE = """
CREATE TABLE IF NOT EXISTS discovery_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    crawl_target_id INTEGER NOT NULL REFERENCES crawl_targets(id),
    discovery_method TEXT NOT NULL,
    attempted_at TEXT NOT NULL DEFAULT (datetime('now')),
    result TEXT NOT NULL,
    found_url TEXT,
    error_message TEXT,
    UNIQUE(crawl_target_id, discovery_method)
);
"""

_CREATE_COMMUNITY_SUBMISSIONS = """
CREATE TABLE IF NOT EXISTS community_submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    crawl_target_id INTEGER REFERENCES crawl_targets(id),
    institution_name TEXT NOT NULL,
    fee_name TEXT NOT NULL,
    fee_category TEXT,
    amount REAL,
    frequency TEXT,
    source_url TEXT NOT NULL,
    submitter_ip TEXT,
    review_status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
"""

_MIGRATE_CRAWL_TARGETS_V3 = [
    "ALTER TABLE crawl_targets ADD COLUMN failure_reason TEXT",
    "ALTER TABLE crawl_targets ADD COLUMN cms_platform TEXT",
]

_MIGRATE_CRAWL_TARGETS_V4 = [
    "ALTER TABLE crawl_targets ADD COLUMN crawl_strategy TEXT",
]

_CREATE_OPS_JOBS = """
CREATE TABLE IF NOT EXISTS ops_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    command TEXT NOT NULL,
    params_json TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'queued',
    triggered_by TEXT NOT NULL,
    target_id INTEGER,
    crawl_run_id INTEGER,
    pid INTEGER,
    log_path TEXT,
    started_at TEXT,
    completed_at TEXT,
    exit_code INTEGER,
    stdout_tail TEXT,
    error_summary TEXT,
    result_summary TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
"""


_CREATE_BRANCH_DEPOSITS = """
CREATE TABLE IF NOT EXISTS branch_deposits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cert INTEGER NOT NULL,
    crawl_target_id INTEGER REFERENCES crawl_targets(id),
    year INTEGER NOT NULL,
    branch_number INTEGER NOT NULL,
    is_main_office INTEGER NOT NULL DEFAULT 0,
    deposits INTEGER,
    state TEXT,
    city TEXT,
    county_fips INTEGER,
    msa_code INTEGER,
    msa_name TEXT,
    fed_district INTEGER,
    latitude REAL,
    longitude REAL,
    fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(cert, year, branch_number)
);
"""

_CREATE_MARKET_CONCENTRATION = """
CREATE TABLE IF NOT EXISTS market_concentration (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    year INTEGER NOT NULL,
    msa_code INTEGER NOT NULL,
    msa_name TEXT,
    total_deposits INTEGER,
    institution_count INTEGER,
    hhi INTEGER,
    top3_share REAL,
    computed_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(year, msa_code)
);
"""

_CREATE_DEMOGRAPHICS = """
CREATE TABLE IF NOT EXISTS demographics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    geo_id TEXT NOT NULL,
    geo_type TEXT NOT NULL,
    geo_name TEXT,
    state_fips TEXT,
    county_fips TEXT,
    median_household_income INTEGER,
    poverty_count INTEGER,
    total_population INTEGER,
    year INTEGER NOT NULL,
    fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(geo_id, geo_type, year)
);
"""

_CREATE_CENSUS_TRACTS = """
CREATE TABLE IF NOT EXISTS census_tracts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tract_id TEXT NOT NULL,
    state_fips TEXT NOT NULL,
    county_fips TEXT NOT NULL,
    msa_code TEXT,
    income_level TEXT,
    median_family_income INTEGER,
    tract_median_income INTEGER,
    income_ratio REAL,
    population INTEGER,
    minority_pct REAL,
    year INTEGER NOT NULL,
    fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(tract_id, year)
);
"""

_CREATE_LEADS = """
CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    company TEXT,
    role TEXT,
    use_case TEXT,
    source TEXT NOT NULL DEFAULT 'coming_soon',
    status TEXT NOT NULL DEFAULT 'new',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
"""

_CREATE_FEE_INDEX_CACHE = """
CREATE TABLE IF NOT EXISTS fee_index_cache (
    fee_category TEXT PRIMARY KEY,
    fee_family TEXT,
    median_amount REAL,
    p25_amount REAL,
    p75_amount REAL,
    min_amount REAL,
    max_amount REAL,
    institution_count INTEGER NOT NULL DEFAULT 0,
    observation_count INTEGER NOT NULL DEFAULT 0,
    approved_count INTEGER NOT NULL DEFAULT 0,
    bank_count INTEGER NOT NULL DEFAULT 0,
    cu_count INTEGER NOT NULL DEFAULT 0,
    maturity_tier TEXT NOT NULL DEFAULT 'insufficient',
    computed_at TEXT NOT NULL DEFAULT (datetime('now'))
);
"""

_CREATE_GOLD_STANDARD_FEES = """
CREATE TABLE IF NOT EXISTS gold_standard_fees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    crawl_target_id INTEGER NOT NULL REFERENCES crawl_targets(id),
    fee_id INTEGER NOT NULL REFERENCES extracted_fees(id),
    verdict TEXT NOT NULL,
    verified_by TEXT,
    verified_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(fee_id)
);
"""

_CREATE_PIPELINE_RUNS = """
CREATE TABLE IF NOT EXISTS pipeline_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    status TEXT NOT NULL DEFAULT 'running',
    last_completed_phase INTEGER DEFAULT 0,
    last_completed_job TEXT,
    config_json TEXT,
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT,
    error_msg TEXT,
    inst_count INTEGER,
    summary_json TEXT
);
"""


class Database:
    """Thin wrapper around SQLite for local dev.

    SQLite is supported only for the legacy tables: crawl_targets,
    crawl_runs, crawl_results, and extracted_fees. Pipeline tables
    (jobs, platform_registry, cms_confidence, document_r2_key,
    document_type_detected, doc_classification_confidence) require
    Postgres via DATABASE_URL. Use require_postgres(...) at every
    call site that touches pipeline tables.
    """

    def __init__(self, config: Config, *, init_tables: bool = True) -> None:
        db_path = Path(config.database.path)
        db_path.parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(str(db_path), timeout=30)
        self.conn.row_factory = sqlite3.Row
        self._set_pragmas()
        if init_tables:
            self._init_tables()

    def __enter__(self) -> "Database":
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    @contextmanager
    def transaction(self):
        """Context manager for BEGIN IMMEDIATE / COMMIT / ROLLBACK."""
        self.conn.execute("BEGIN IMMEDIATE")
        try:
            yield self
            self.conn.execute("COMMIT")
        except Exception:
            self.conn.execute("ROLLBACK")
            raise

    def _set_pragmas(self) -> None:
        """Enable WAL mode, foreign keys, and performance PRAGMAs."""
        self.conn.execute("PRAGMA foreign_keys=ON")
        self.conn.execute("PRAGMA journal_mode=WAL")
        self.conn.execute("PRAGMA busy_timeout=30000")
        self.conn.execute("PRAGMA synchronous=NORMAL")
        self.conn.execute("PRAGMA cache_size=-32000")
        self.conn.execute("PRAGMA mmap_size=268435456")
        self.conn.execute("PRAGMA temp_store=memory")

    def _init_tables(self) -> None:
        # LEGACY: SQLite path covers crawl_targets/crawl_runs/crawl_results/extracted_fees only.
        # Pipeline tables are Postgres-only — see require_postgres().
        self.conn.executescript(_CREATE_CRAWL_TARGETS)
        self.conn.executescript(_CREATE_CRAWL_RUNS)
        self.conn.executescript(_CREATE_CRAWL_RESULTS)
        self.conn.executescript(_CREATE_EXTRACTED_FEES)
        self.conn.executescript(_CREATE_ANALYSIS_RESULTS)
        self.conn.executescript(_CREATE_USERS)
        self.conn.executescript(_CREATE_FEE_REVIEWS)
        self.conn.executescript(_CREATE_SESSIONS)
        self.conn.executescript(_CREATE_INSTITUTION_FINANCIALS)
        self.conn.executescript(_CREATE_INSTITUTION_COMPLAINTS)
        self.conn.executescript(_CREATE_FEE_SNAPSHOTS)
        self.conn.executescript(_CREATE_FEE_CHANGE_EVENTS)
        self.conn.executescript(_CREATE_COVERAGE_SNAPSHOTS)
        self.conn.executescript(_CREATE_FED_BEIGE_BOOK)
        self.conn.executescript(_CREATE_FED_CONTENT)
        self.conn.executescript(_CREATE_FED_ECONOMIC_INDICATORS)
        self.conn.executescript(_CREATE_DISCOVERY_CACHE)
        self.conn.executescript(_CREATE_COMMUNITY_SUBMISSIONS)
        self.conn.executescript(_CREATE_OPS_JOBS)
        self.conn.executescript(_CREATE_BRANCH_DEPOSITS)
        self.conn.executescript(_CREATE_MARKET_CONCENTRATION)
        self.conn.executescript(_CREATE_DEMOGRAPHICS)
        self.conn.executescript(_CREATE_CENSUS_TRACTS)
        self.conn.executescript(_CREATE_LEADS)
        self.conn.executescript(_CREATE_GOLD_STANDARD_FEES)
        self.conn.executescript(_CREATE_PIPELINE_RUNS)
        self.conn.executescript(_CREATE_FEE_INDEX_CACHE)
        self._run_migrations()
        self._create_indexes()
        self.conn.commit()

    def _create_indexes(self) -> None:
        """Create indexes for analytical queries (idempotent)."""
        # Dedup fee_change_events before creating unique index (idempotent)
        try:
            self.conn.execute("""
                DELETE FROM fee_change_events WHERE id NOT IN (
                    SELECT MIN(id) FROM fee_change_events
                    GROUP BY crawl_target_id, fee_category, change_type,
                             previous_amount, new_amount, DATE(detected_at)
                )
            """)
        except sqlite3.OperationalError:
            pass  # table may not exist yet

        indexes = [
            # -- Covering indexes (replace narrower versions) --
            "CREATE INDEX IF NOT EXISTS idx_fees_category_amount_active ON extracted_fees(fee_category, amount, crawl_target_id) WHERE review_status != 'rejected' AND fee_category IS NOT NULL AND amount IS NOT NULL",
            "CREATE INDEX IF NOT EXISTS idx_fees_target_status_cat_amt ON extracted_fees(crawl_target_id, review_status, fee_category, amount)",
            "CREATE INDEX IF NOT EXISTS idx_fees_review_queue ON extracted_fees(review_status, created_at) WHERE review_status IN ('pending', 'staged', 'flagged')",
            "CREATE INDEX IF NOT EXISTS idx_fees_category ON extracted_fees(fee_category)",
            "CREATE INDEX IF NOT EXISTS idx_targets_charter_tier ON crawl_targets(charter_type, asset_size_tier)",
            "CREATE INDEX IF NOT EXISTS idx_targets_fee_url ON crawl_targets(fee_schedule_url) WHERE fee_schedule_url IS NOT NULL",
            "CREATE INDEX IF NOT EXISTS idx_targets_with_fees ON crawl_targets(charter_type, asset_size_tier, fed_district, state_code) WHERE fee_schedule_url IS NOT NULL",
            "CREATE INDEX IF NOT EXISTS idx_analysis_target_type ON analysis_results(crawl_target_id, analysis_type)",
            "CREATE INDEX IF NOT EXISTS idx_financials_target_date ON institution_financials(crawl_target_id, report_date)",
            "CREATE INDEX IF NOT EXISTS idx_complaints_target ON institution_complaints(crawl_target_id)",
            "CREATE INDEX IF NOT EXISTS idx_snapshots_target_cat ON fee_snapshots(crawl_target_id, fee_category)",
            "CREATE INDEX IF NOT EXISTS idx_beige_book_district ON fed_beige_book(fed_district, release_date)",
            "CREATE INDEX IF NOT EXISTS idx_fed_content_district ON fed_content(fed_district, published_at)",
            "CREATE INDEX IF NOT EXISTS idx_fed_content_type ON fed_content(content_type)",
            "CREATE INDEX IF NOT EXISTS idx_fed_indicators_series ON fed_economic_indicators(series_id, observation_date)",
            "CREATE INDEX IF NOT EXISTS idx_discovery_cache_target ON discovery_cache(crawl_target_id)",
            "CREATE INDEX IF NOT EXISTS idx_ops_jobs_status ON ops_jobs(status)",
            "CREATE INDEX IF NOT EXISTS idx_ops_jobs_created ON ops_jobs(created_at)",
            "CREATE INDEX IF NOT EXISTS idx_branch_deposits_cert ON branch_deposits(cert, year)",
            "CREATE INDEX IF NOT EXISTS idx_branch_deposits_msa ON branch_deposits(msa_code, year)",
            "CREATE INDEX IF NOT EXISTS idx_market_concentration_msa ON market_concentration(msa_code, year)",
            "CREATE INDEX IF NOT EXISTS idx_demographics_geo ON demographics(geo_type, state_fips, year)",
            "CREATE INDEX IF NOT EXISTS idx_census_tracts_state ON census_tracts(state_fips, year)",
            # -- fee_change_events unique index for idempotency --
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_fce_unique ON fee_change_events(crawl_target_id, fee_category, change_type, previous_amount, new_amount, DATE(detected_at))",
            # -- Dashboard query indexes --
            "CREATE INDEX IF NOT EXISTS idx_fce_date_category ON fee_change_events(detected_at DESC, fee_category)",
            "CREATE INDEX IF NOT EXISTS idx_crawl_results_date ON crawl_results(crawled_at DESC, crawl_target_id)",
            "CREATE INDEX IF NOT EXISTS idx_reviews_date ON fee_reviews(created_at DESC)",
            "CREATE INDEX IF NOT EXISTS idx_fees_crawl_result ON extracted_fees(crawl_result_id)",
        ]
        for sql in indexes:
            try:
                self.conn.execute(sql)
            except sqlite3.OperationalError:
                pass  # table may not exist yet

    def _run_migrations(self) -> None:
        """Apply safe ALTER TABLE migrations (idempotent)."""
        all_migrations = (
            _MIGRATE_CRAWL_TARGETS
            + _MIGRATE_EXTRACTED_FEES
            + _MIGRATE_CRAWL_TARGETS_V2
            + _MIGRATE_CRAWL_TARGETS_V3
            + _MIGRATE_CRAWL_TARGETS_V4
        )
        for sql in all_migrations:
            try:
                self.conn.execute(sql)
            except sqlite3.OperationalError:
                pass  # column already exists

    def insert_returning_id(self, sql: str, params: tuple = ()) -> int:
        """Execute an INSERT and return the new row's id."""
        cursor = self.conn.execute(sql, params)
        return cursor.lastrowid

    def execute(self, sql: str, params: tuple = ()) -> sqlite3.Cursor:
        return self.conn.execute(sql, params)

    def executemany(self, sql: str, params: list[tuple]) -> sqlite3.Cursor:
        return self.conn.executemany(sql, params)

    def commit(self) -> None:
        self.conn.commit()

    def fetchone(self, sql: str, params: tuple = ()) -> sqlite3.Row | None:
        return self.conn.execute(sql, params).fetchone()

    def fetchall(self, sql: str, params: tuple = ()) -> list[sqlite3.Row]:
        return self.conn.execute(sql, params).fetchall()

    # Whitelist of valid table names to prevent SQL injection in count()
    _VALID_TABLES = frozenset({
        "crawl_targets", "crawl_runs", "crawl_results", "extracted_fees",
        "analysis_results", "users", "fee_reviews", "sessions",
        "institution_financials", "institution_complaints",
        "fee_snapshots", "fee_change_events", "coverage_snapshots",
        "fed_beige_book", "fed_content", "fed_economic_indicators",
        "discovery_cache", "community_submissions", "ops_jobs",
        "branch_deposits", "market_concentration", "demographics",
        "census_tracts", "leads", "pipeline_runs", "fee_index_cache",
    })

    def count(self, table: str) -> int:
        if table not in self._VALID_TABLES:
            raise ValueError(f"Invalid table name: {table}")
        row = self.fetchone(f"SELECT COUNT(*) as cnt FROM {table}")
        return row["cnt"] if row else 0

    def close(self) -> None:
        self.conn.close()


class PostgresDatabase:
    """Thin wrapper around psycopg2 with the same interface as Database.

    Used when DATABASE_URL is set (production/Supabase).
    Schema is managed by the Next.js migration scripts, not here.
    """

    def __init__(self) -> None:
        import psycopg2
        import psycopg2.extras
        self.conn = psycopg2.connect(os.environ["DATABASE_URL"])
        self.conn.autocommit = False
        self._cursor_factory = psycopg2.extras.RealDictCursor

    def __enter__(self) -> "PostgresDatabase":
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    @contextmanager
    def transaction(self):
        try:
            yield self
            self.conn.commit()
        except Exception:
            self.conn.rollback()
            raise

    def insert_returning_id(self, sql: str, params: tuple = ()) -> int:
        pg_sql = _sqlite_to_pg(sql) + " RETURNING id"
        cur = self.conn.cursor()
        cur.execute(pg_sql, params)
        row = cur.fetchone()
        return row[0] if row else 0

    def execute(self, sql: str, params: tuple = ()):
        pg_sql = _sqlite_to_pg(sql)
        cur = self.conn.cursor()
        cur.execute(pg_sql, params)
        return cur

    def executemany(self, sql: str, params: list[tuple]):
        pg_sql = _sqlite_to_pg(sql)
        cur = self.conn.cursor()
        cur.executemany(pg_sql, params)
        return cur

    def commit(self) -> None:
        self.conn.commit()

    def fetchone(self, sql: str, params: tuple = ()):
        pg_sql = _sqlite_to_pg(sql)
        cur = self.conn.cursor(cursor_factory=self._cursor_factory)
        cur.execute(pg_sql, params)
        return cur.fetchone()

    def fetchall(self, sql: str, params: tuple = ()) -> list:
        pg_sql = _sqlite_to_pg(sql)
        cur = self.conn.cursor(cursor_factory=self._cursor_factory)
        cur.execute(pg_sql, params)
        return cur.fetchall()

    _VALID_TABLES = Database._VALID_TABLES

    def count(self, table: str) -> int:
        if table not in self._VALID_TABLES:
            raise ValueError(f"Invalid table name: {table}")
        row = self.fetchone(f"SELECT COUNT(*) as cnt FROM {table}")
        return row["cnt"] if row else 0

    def close(self) -> None:
        self.conn.close()


def _sqlite_to_pg(sql: str) -> str:
    """Convert SQLite-specific SQL to Postgres-compatible SQL.

    Handles the most common differences:
    - ? placeholders -> %s
    - datetime('now') -> NOW()
    - datetime('now', '-N days') -> NOW() - INTERVAL 'N days'
    - INSERT OR IGNORE -> INSERT ... ON CONFLICT DO NOTHING
    - INSERT OR REPLACE -> INSERT ... ON CONFLICT DO UPDATE
    """
    import re
    s = sql
    # Placeholder: ? -> %s
    s = s.replace("?", "%s")
    # datetime functions
    s = re.sub(r"datetime\('now'\)", "NOW()", s)
    s = re.sub(r"datetime\('now',\s*'(-?\d+)\s*days?'\)", r"NOW() + INTERVAL '\1 days'", s)
    # INSERT OR IGNORE -> INSERT ... ON CONFLICT DO NOTHING
    if "INSERT OR IGNORE" in s:
        s = s.replace("INSERT OR IGNORE", "INSERT")
        if "ON CONFLICT" not in s:
            # Add ON CONFLICT DO NOTHING before any RETURNING clause
            if "RETURNING" in s:
                s = s.replace("RETURNING", "ON CONFLICT DO NOTHING RETURNING")
            else:
                s = s.rstrip().rstrip(";") + " ON CONFLICT DO NOTHING"
    # INSERT OR REPLACE -> INSERT ... ON CONFLICT (...) DO UPDATE
    # This is harder — we convert to a simple upsert by replacing with INSERT + ON CONFLICT DO NOTHING
    # Full upsert would require knowing the unique constraint columns
    if "INSERT OR REPLACE" in s:
        s = s.replace("INSERT OR REPLACE", "INSERT")
        if "ON CONFLICT" not in s:
            s = s.rstrip().rstrip(";") + " ON CONFLICT DO NOTHING"
    # strftime('%Y-%m-%d', col) -> DATE(col)
    s = re.sub(r"strftime\('%Y-%m-%d',\s*(\w+)\)", r"DATE(\1)", s)
    # BEGIN IMMEDIATE -> BEGIN (Postgres doesn't have IMMEDIATE mode)
    s = s.replace("BEGIN IMMEDIATE", "BEGIN")
    # PRAGMA statements -> no-op
    if s.strip().upper().startswith("PRAGMA"):
        return "SELECT 1"
    return s


def get_db(config: Config) -> Database | PostgresDatabase:
    """Get the appropriate database connection based on environment."""
    if os.environ.get("DATABASE_URL"):
        return PostgresDatabase()
    return Database(config)


def get_worker_db(config: Config) -> Database | PostgresDatabase:
    """Thread-local DB connection for worker threads. No migration overhead."""
    if os.environ.get("DATABASE_URL"):
        if not hasattr(_thread_local, "db") or _thread_local.db is None:
            _thread_local.db = PostgresDatabase()
        return _thread_local.db
    if not hasattr(_thread_local, "db") or _thread_local.db is None:
        _thread_local.db = Database(config, init_tables=False)
    return _thread_local.db
