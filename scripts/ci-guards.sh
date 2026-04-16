#!/usr/bin/env bash
# Phase 62a CI guards.
# Usage: scripts/ci-guards.sh <subcommand>
# Subcommands:
#   sqlite-kill   Fail if any sqlite3|better-sqlite3|DB_PATH reference remains in production paths.

set -euo pipefail

SUBCOMMAND="${1:-}"

sqlite_kill() {
  # Production paths only — tests are exempt during transition (removed in Wave 4 plans).
  local include_dirs=("fee_crawler" "src")
  local exclude_dirs=(
    ":(exclude)fee_crawler/tests"
    ":(exclude)fee_crawler/**/__pycache__"
    ":(exclude)src/app/api/_archive"
  )

  # Use git grep if in a repo (faster + respects .gitignore), else plain grep.
  local hits=""
  if git rev-parse --git-dir >/dev/null 2>&1; then
    hits=$(git grep -nE 'better-sqlite3|sqlite3|DB_PATH' -- \
      "${include_dirs[@]}" "${exclude_dirs[@]}" \
      | grep -v '^Binary file' || true)
  else
    hits=$(grep -rnE 'better-sqlite3|sqlite3|DB_PATH' \
      --include='*.py' --include='*.ts' --include='*.tsx' --include='*.js' --include='*.mjs' \
      --exclude-dir=__pycache__ --exclude-dir=node_modules --exclude-dir=tests \
      "${include_dirs[@]}" 2>/dev/null || true)
  fi

  if [[ -n "$hits" ]]; then
    echo "sqlite-kill: production SQLite references remain:" >&2
    echo "$hits" >&2
    exit 1
  fi

  echo "sqlite-kill: OK (zero production matches)"
  exit 0
}

case "$SUBCOMMAND" in
  sqlite-kill) sqlite_kill ;;
  "")
    echo "Usage: $0 <sqlite-kill>" >&2
    exit 2
    ;;
  *)
    echo "Unknown subcommand: $SUBCOMMAND" >&2
    echo "Usage: $0 <sqlite-kill>" >&2
    exit 2
    ;;
esac
