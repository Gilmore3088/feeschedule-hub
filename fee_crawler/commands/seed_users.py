"""Seed users from config into the users table."""

import hashlib
import os

from fee_crawler.config import AuthConfig, Config
from fee_crawler.db import Database


def hash_password(password: str) -> str:
    """Hash password with scrypt. Format: salt_hex:dk_hex."""
    salt = os.urandom(16)
    dk = hashlib.scrypt(
        password.encode(), salt=salt, n=16384, r=8, p=1, dklen=64,
    )
    return f"{salt.hex()}:{dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    """Verify a password against a stored scrypt salt:hash."""
    salt_hex, dk_hex = stored.split(":", 1)
    salt = bytes.fromhex(salt_hex)
    dk = hashlib.scrypt(
        password.encode(), salt=salt, n=16384, r=8, p=1, dklen=64,
    )
    return dk.hex() == dk_hex


def run(db: Database, config: Config) -> None:
    """Seed users from config + environment variables. Skips existing usernames."""
    # Merge config-based and env-based users
    users = list(config.auth.seed_users) + AuthConfig.from_env()

    if not users:
        print("  No seed users configured.")
        print("  Set BFI_ADMIN_USERNAME and BFI_ADMIN_PASSWORD env vars to create admin user.")
        return

    for user in users:
        existing = db.fetchone(
            "SELECT id FROM users WHERE username = ?",
            (user.username,),
        )
        if existing:
            print(f"  User '{user.username}' already exists, skipping")
            continue

        try:
            AuthConfig.validate_password(user.password)
        except ValueError as e:
            print(f"  Skipping user '{user.username}': {e}")
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
