#!/usr/bin/env bash
#
# modal-deploy.sh — bootstrap and deploy Modal serverless workers.
#
# Reads .env.local (or .env), validates all secrets the Modal app references,
# creates/updates the `bfi-secrets` Modal Secret, then deploys both apps.
# Idempotent; safe to re-run.
#
# Prerequisites:
#   - modal CLI installed (pip install modal)
#   - MODAL_TOKEN_ID + MODAL_TOKEN_SECRET set (run `modal token new` once)
#   - All secrets present in .env.local (see REQUIRED_KEYS below)
#
# Usage: bash scripts/modal-deploy.sh              # deploy
#        bash scripts/modal-deploy.sh --preflight  # just run readiness checks
#        bash scripts/modal-deploy.sh --secrets    # just (re)create the Secret
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
ok()   { printf '  \033[32mOK\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!!\033[0m %s\n' "$*"; }
fail() { printf '  \033[31mFAIL\033[0m %s\n' "$*" >&2; exit 1; }

# Load env
if [[ -f .env.local ]]; then
  set -a; . ./.env.local; set +a
elif [[ -f .env ]]; then
  set -a; . ./.env; set +a
else
  fail ".env.local not found (copy .env.example and fill in)"
fi

REQUIRED_KEYS=(
  DATABASE_URL
  R2_ENDPOINT
  R2_ACCESS_KEY_ID
  R2_SECRET_ACCESS_KEY
  R2_BUCKET
  ANTHROPIC_API_KEY
  FRED_API_KEY
  BFI_APP_URL
  REPORT_INTERNAL_SECRET
  REPORT_CRON_SECRET
)

mode="${1:-deploy}"

# ---------- 1. Toolchain ----------
bold "1/4  Toolchain"
command -v modal >/dev/null 2>&1 || fail "modal CLI not found (pip install modal)"
ok "modal $(modal --version 2>&1 | grep -oE '[0-9.]+')"

if ! modal token current >/dev/null 2>&1; then
  fail "modal not authenticated. Run: modal token new"
fi
ok "modal authenticated"

# ---------- 2. Validate secrets ----------
bold "2/4  Validating .env keys"
missing=()
for k in "${REQUIRED_KEYS[@]}"; do
  if [[ -z "${!k:-}" ]]; then
    missing+=("$k")
  else
    ok "$k present (${#k} chars)"
  fi
done

# Generate REPORT_*_SECRET if missing (these are internal-only)
for k in REPORT_INTERNAL_SECRET REPORT_CRON_SECRET; do
  if [[ -z "${!k:-}" ]]; then
    val=$(openssl rand -hex 32)
    export "$k=$val"
    warn "generated $k=$val — add this to .env.local + Modal Secret"
    # Drop from missing list
    missing=("${missing[@]/$k}")
  fi
done

# Filter empties
filtered=()
for k in "${missing[@]}"; do
  [[ -n "$k" ]] && filtered+=("$k")
done
missing=("${filtered[@]}")

if [[ ${#missing[@]} -gt 0 ]]; then
  fail "missing required keys: ${missing[*]}"
fi

if [[ "$mode" == "--preflight" ]]; then
  bold "3/4  Running preflight checks"
  modal run fee_crawler/modal_preflight.py::preflight
  exit 0
fi

# ---------- 3. (Re)create Modal Secret ----------
bold "3/4  Modal Secret: bfi-secrets"
secret_args=()
for k in "${REQUIRED_KEYS[@]}"; do
  secret_args+=("$k=${!k}")
done

# `modal secret create` errors if exists; use `--force` to replace
if modal secret list 2>&1 | grep -q "^bfi-secrets\s"; then
  warn "bfi-secrets exists; replacing"
  modal secret create bfi-secrets --force "${secret_args[@]}"
else
  modal secret create bfi-secrets "${secret_args[@]}"
fi
ok "bfi-secrets ready (${#REQUIRED_KEYS[@]} keys)"

if [[ "$mode" == "--secrets" ]]; then
  exit 0
fi

# ---------- 4. Deploy ----------
bold "4/4  Deploy"
modal deploy fee_crawler/modal_app.py
ok "bank-fee-index-workers deployed"

modal deploy fee_crawler/modal_preflight.py
ok "bank-fee-index-preflight deployed"

bold ""
bold "Done. Verify with:"
echo "  modal app list                                                        # confirm both apps present"
echo "  modal run fee_crawler/modal_app.py::test_connection                   # smoke test DB"
echo "  modal run fee_crawler/modal_preflight.py::preflight                   # full readiness check"
echo "  modal app logs bank-fee-index-workers --follow                        # tail logs"
