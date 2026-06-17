#!/usr/bin/env bash
#
# dev-setup.sh — one-shot bootstrap for a fresh checkout.
#
# Brings a developer from `git clone` to a working admin login. Idempotent;
# safe to re-run. Stops at the first failure so the error is visible.
#
# Prerequisites checked:
#   - Node 20+, npm
#   - Python 3.11+, pip
#   - DATABASE_URL set in .env.local (Postgres, transaction-mode pooler)
#   - BFI_ADMIN_PASSWORD and BFI_ANALYST_PASSWORD set in .env.local
#
# Steps:
#   1. Verify toolchain versions
#   2. npm install (skip if node_modules is current)
#   3. pip install -r requirements.txt
#   4. Apply pending Supabase migrations
#   5. Seed admin + analyst users
#
# Usage: npm run setup    # or: bash scripts/dev-setup.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
ok()   { printf '  \033[32mOK\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!!\033[0m %s\n' "$*"; }
fail() { printf '  \033[31mFAIL\033[0m %s\n' "$*" >&2; exit 1; }

# ---------- 1. Toolchain ----------
bold "1/5  Checking toolchain"

if ! command -v node >/dev/null 2>&1; then fail "node not found (need 20+)"; fi
node_major=$(node -p 'process.versions.node.split(".")[0]')
if [[ "$node_major" -lt 20 ]]; then fail "node 20+ required (have $(node -v))"; fi
ok "node $(node -v)"

if ! command -v npm >/dev/null 2>&1; then fail "npm not found"; fi
ok "npm $(npm -v)"

if command -v python3 >/dev/null 2>&1; then PY=python3
elif command -v python >/dev/null 2>&1; then PY=python
else fail "python not found (need 3.11+)"
fi
py_ver=$($PY -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
ok "python $py_ver ($PY)"

if ! command -v pip >/dev/null 2>&1 && ! $PY -m pip --version >/dev/null 2>&1; then
  fail "pip not available"
fi

# ---------- 2. Env file ----------
bold "2/5  Checking .env.local"

if [[ ! -f .env.local ]]; then
  warn ".env.local missing — copying .env.example as a starting point"
  cp .env.example .env.local
  warn "Edit .env.local to set DATABASE_URL, BFI_ADMIN_PASSWORD, BFI_ANALYST_PASSWORD, ANTHROPIC_API_KEY, then re-run this script."
  exit 1
fi

# shellcheck disable=SC1091
set -a; . ./.env.local; set +a

[[ -n "${DATABASE_URL:-}" ]]        || fail "DATABASE_URL not set in .env.local"
[[ -n "${BFI_ADMIN_PASSWORD:-}" ]]  || fail "BFI_ADMIN_PASSWORD not set in .env.local"
[[ -n "${BFI_ANALYST_PASSWORD:-}" ]] || fail "BFI_ANALYST_PASSWORD not set in .env.local"
ok "required env vars present"

# ---------- 3. Node deps ----------
bold "3/5  Installing Node dependencies"
if [[ ! -d node_modules ]] || [[ package-lock.json -nt node_modules/.package-lock-stamp ]]; then
  npm install
  touch node_modules/.package-lock-stamp
  ok "npm install complete"
else
  ok "node_modules up to date (skipping)"
fi

# ---------- 4. Python deps ----------
bold "4/5  Installing Python dependencies"
$PY -m pip install --quiet --disable-pip-version-check -r requirements.txt
ok "pip install complete"

# ---------- 5. Database ----------
bold "5/5  Database: migrations + seed users"
npm run db:migrate
npm run db:seed
ok "database ready"

bold ""
bold "Setup complete. Next:"
echo "  npm run dev        # http://localhost:3000"
echo "  Login as 'admin' (password: \$BFI_ADMIN_PASSWORD)"
