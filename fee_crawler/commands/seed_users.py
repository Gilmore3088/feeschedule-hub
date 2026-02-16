"""Seed users from config into the users table."""

import hashlib
import secrets

from fee_crawler.config import Config
from fee_crawler.db import Database


def hash_password(password: str) -> str:
    """Salted SHA-256 hash for MVP. Format: salt:hash."""
    salt = secrets.token_hex(16)
    hashed = hashlib.sha256(f"{salt}:{password}".encode()).hexdigest()
    return f"{salt}:{hashed}"


def verify_password(password: str, stored: str) -> bool:
    """Verify a password against a stored salt:hash."""
    salt, expected = stored.split(":", 1)
    actual = hashlib.sha256(f"{salt}:{password}".encode()).hexdigest()
    return actual == expected


def run(db: Database, config: Config) -> None:
    """Seed users from config. Skips existing usernames."""
    for user in config.auth.seed_users:
        existing = db.fetchone(
            "SELECT id FROM users WHERE username = ?",
            (user.username,),
        )
        if existing:
            print(f"  User '{user.username}' already exists, skipping")
            continue

        pw_hash = hash_password(user.password)
        db.execute(
            """INSERT INTO users (username, password_hash, display_name, role)
               VALUES (?, ?, ?, ?)""",
            (user.username, pw_hash, user.display_name, user.role),
        )
        print(f"  Created user '{user.username}' (role: {user.role})")

    db.commit()

    total = db.count("users")
    print(f"\nTotal users in database: {total}")
