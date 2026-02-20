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

_CREATE_ARTICLES = """
CREATE TABLE IF NOT EXISTS articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    article_type TEXT NOT NULL,
    fee_category TEXT,
    fed_district INTEGER,
    status TEXT NOT NULL DEFAULT 'draft',
    review_tier INTEGER NOT NULL DEFAULT 2,
    content_md TEXT NOT NULL,
    data_context TEXT NOT NULL,
    summary TEXT,
    model_id TEXT,
    prompt_hash TEXT,
    generated_at TEXT NOT NULL,
    reviewed_by TEXT,
    reviewed_at TEXT,
    published_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
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
        self.conn.executescript(_CREATE_ARTICLES)
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
            "CREATE INDEX IF NOT EXISTS idx_articles_status ON articles(status)",
            "CREATE INDEX IF NOT EXISTS idx_articles_type ON articles(article_type, fee_category)",
            "CREATE INDEX IF NOT EXISTS idx_articles_published ON articles(published_at)",
            "CREATE INDEX IF NOT EXISTS idx_articles_slug ON articles(slug)",
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

    def count(self, table: str) -> int:
        row = self.fetchone(f"SELECT COUNT(*) as cnt FROM {table}")
        return row["cnt"] if row else 0

    def close(self) -> None:
        self.conn.close()
