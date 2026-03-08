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
    outlier_std_dev_threshold: float = 3.0
    document_storage_dir: str = "data/documents"


class FedContentConfig(BaseModel):
    crawl_delay: float = 2.0
    speeches_feed: str = "https://www.federalreserve.gov/feeds/speeches.xml"
    beige_book_base_url: str = "https://www.federalreserve.gov/monetarypolicy"


class FREDConfig(BaseModel):
    api_key: str = ""  # Or FRED_API_KEY env var
    base_url: str = "https://api.stlouisfed.org/fred"
    series: list[str] = [
        "UNRATE",
        "USNIM",
        "EQTA",
        "DPSACBM027NBOG",
    ]


class SeedUser(BaseModel):
    username: str
    password: str
    display_name: str
    role: str = "viewer"


_BANNED_PASSWORDS = frozenset([
    "changeme", "password", "admin", "123456", "password1",
    "admin123", "letmein", "welcome", "monkey", "master",
])

_MIN_PASSWORD_LENGTH = 10


class AuthConfig(BaseModel):
    session_ttl_hours: int = 24
    seed_users: list[SeedUser] = []

    @staticmethod
    def from_env() -> list[SeedUser]:
        """Build seed users from environment variables."""
        users: list[SeedUser] = []
        admin_user = os.environ.get("BFI_ADMIN_USERNAME", "")
        admin_pass = os.environ.get("BFI_ADMIN_PASSWORD", "")
        if admin_user and admin_pass:
            users.append(SeedUser(
                username=admin_user, password=admin_pass,
                display_name="Admin", role="admin",
            ))
        analyst_user = os.environ.get("BFI_ANALYST_USERNAME", "")
        analyst_pass = os.environ.get("BFI_ANALYST_PASSWORD", "")
        if analyst_user and analyst_pass:
            users.append(SeedUser(
                username=analyst_user, password=analyst_pass,
                display_name="Analyst", role="analyst",
            ))
        return users

    @staticmethod
    def validate_password(password: str) -> None:
        """Validate password meets security requirements."""
        if password.lower() in _BANNED_PASSWORDS:
            raise ValueError(f"Password is too common and not allowed")
        if len(password) < _MIN_PASSWORD_LENGTH:
            raise ValueError(
                f"Password must be at least {_MIN_PASSWORD_LENGTH} characters"
            )


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
