"""Configuration loader using Pydantic."""

import os
from pathlib import Path

import yaml
from pydantic import BaseModel


class DatabaseConfig(BaseModel):
    type: str = "sqlite"
    path: str = "data/crawler.db"


class FDICConfig(BaseModel):
    base_url: str = "https://api.fdic.gov/banks"
    page_size: int = 1000


class NCUAConfig(BaseModel):
    base_url: str = "https://www.ncua.gov/files/publications/analysis"
    mapping_api_url: str = "https://mapping.ncua.gov/api/CreditUnionDetails/GetCreditUnionDetails"


class CrawlConfig(BaseModel):
    delay_seconds: float = 2.0
    max_retries: int = 3
    user_agent: str = (
        "FeeScheduleHub/1.0 (fee-benchmarking; contact@feeschedulehub.com)"
    )
    respect_robots_txt: bool = True
    concurrent_per_domain: int = 1


class ClaudeConfig(BaseModel):
    model: str = "claude-sonnet-4-5-20250929"
    max_tokens: int = 4096
    # API key read from ANTHROPIC_API_KEY env var by the anthropic package


class ExtractionConfig(BaseModel):
    confidence_auto_stage_threshold: float = 0.85
    confidence_approve_threshold: float = 0.90
    outlier_std_dev_threshold: float = 3.0
    document_storage_dir: str = "data/documents"
    model: str = "claude-haiku-4-5-20251001"
    max_tokens: int = 2048
    use_batch_api: bool = True
    daily_budget_usd: float = 20.0


class FedContentConfig(BaseModel):
    crawl_delay: float = 2.0
    speeches_feed: str = "https://www.federalreserve.gov/feeds/speeches.xml"
    beige_book_base_url: str = "https://www.federalreserve.gov/monetarypolicy"


class FREDConfig(BaseModel):
    # api_key intentionally omitted — use FRED_API_KEY env var exclusively
    base_url: str = "https://api.stlouisfed.org/fred"
    series: list[str] = [
        "UNRATE",           # Unemployment Rate (monthly)
        "FEDFUNDS",         # Effective Federal Funds Rate (monthly)
        "CPIAUCSL",         # Consumer Price Index, Urban All Items (monthly)
        "DPSACBM027NBOG",   # Deposits, All Commercial Banks (monthly)
        "QBPQYNTIY",        # Net Interest Income (quarterly, QBP)
        "QBPQYTNIY",        # Total Noninterest Income (quarterly, QBP)
        "QBPQYTNIYSRVDP",   # Service Charges on Deposit Accounts (quarterly, QBP)
        "QBPQYNTYBKNI",     # Net Income (quarterly, QBP)
        "UMCSENT",          # Consumer Sentiment (monthly)
    ]


class SeedUser(BaseModel):
    username: str
    password: str
    display_name: str
    role: str = "viewer"


class AuthConfig(BaseModel):
    session_ttl_hours: int = 24
    seed_users: list[SeedUser] = [
        SeedUser(
            username="admin",
            password=os.environ.get("BFI_ADMIN_PASSWORD", ""),
            display_name="Admin",
            role="admin",
        ),
        SeedUser(
            username="analyst",
            password=os.environ.get("BFI_ANALYST_PASSWORD", ""),
            display_name="Analyst",
            role="analyst",
        ),
    ]


class Config(BaseModel):
    database: DatabaseConfig = DatabaseConfig()
    fdic_api: FDICConfig = FDICConfig()
    ncua_api: NCUAConfig = NCUAConfig()
    crawl: CrawlConfig = CrawlConfig()
    claude: ClaudeConfig = ClaudeConfig()
    extraction: ExtractionConfig = ExtractionConfig()
    auth: AuthConfig = AuthConfig()
    fed_content: FedContentConfig = FedContentConfig()
    fred: FREDConfig = FREDConfig()


def load_config(path: Path | None = None) -> Config:
    """Load config from YAML file. Falls back to defaults if file missing."""
    candidates = [
        path,
        Path("config.local.yaml"),
        Path("fee_crawler/config.local.yaml"),
        Path("fee_crawler/config.yaml"),
    ]
    for candidate in candidates:
        if candidate and candidate.exists():
            with open(candidate) as f:
                raw = yaml.safe_load(f) or {}
            return Config(**raw)
    return Config()
