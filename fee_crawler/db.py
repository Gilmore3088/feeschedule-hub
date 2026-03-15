"""Database layer. SQLite for dev, PostgreSQL/Supabase for production."""

import sqlite3
from pathlib import Path

from fee_crawler.config import Config

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


class Database:
    """Thin wrapper around SQLite for local dev."""

    def __init__(self, config: Config) -> None:
        db_path = Path(config.database.path)
        db_path.parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(str(db_path), timeout=30)
        self.conn.row_factory = sqlite3.Row
        self._set_pragmas()
        self._init_tables()

    def _set_pragmas(self) -> None:
        """Enable WAL mode and performance PRAGMAs."""
        self.conn.execute("PRAGMA journal_mode=WAL")
        self.conn.execute("PRAGMA busy_timeout=30000")
        self.conn.execute("PRAGMA synchronous=NORMAL")
        self.conn.execute("PRAGMA cache_size=-32000")
        self.conn.execute("PRAGMA mmap_size=268435456")
        self.conn.execute("PRAGMA temp_store=memory")

    def _init_tables(self) -> None:
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
        self._run_migrations()
        self._create_indexes()
        self.conn.commit()

    def _create_indexes(self) -> None:
        """Create indexes for analytical queries (idempotent)."""
        indexes = [
            "CREATE INDEX IF NOT EXISTS idx_fees_review_status ON extracted_fees(review_status)",
            "CREATE INDEX IF NOT EXISTS idx_fees_target_id ON extracted_fees(crawl_target_id)",
            "CREATE INDEX IF NOT EXISTS idx_fees_category ON extracted_fees(fee_category)",
            "CREATE INDEX IF NOT EXISTS idx_targets_charter_tier ON crawl_targets(charter_type, asset_size_tier)",
            "CREATE INDEX IF NOT EXISTS idx_targets_fee_url ON crawl_targets(fee_schedule_url) WHERE fee_schedule_url IS NOT NULL",
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
        "fee_snapshots", "fee_change_events",
        "fed_beige_book", "fed_content", "fed_economic_indicators",
        "discovery_cache", "community_submissions", "ops_jobs",
    })

    def count(self, table: str) -> int:
        if table not in self._VALID_TABLES:
            raise ValueError(f"Invalid table name: {table}")
        row = self.fetchone(f"SELECT COUNT(*) as cnt FROM {table}")
        return row["cnt"] if row else 0

    def close(self) -> None:
        self.conn.close()
