#!/usr/bin/env bash
# Phase 62a CI guards.
# Usage: scripts/ci-guards.sh <subcommand>
# Subcommands:
#   sqlite-kill   Fail if any sqlite3|better-sqlite3|DB_PATH reference remains in runtime src.
#   modal-kill    Fail if runtime TypeScript/JavaScript/Edge code can call Modal endpoints.
#   legacy-kill   Fail if runtime TypeScript/JavaScript can call retired execution surfaces.
#   fee-read-model-kill
#                 Fail if product/runtime fee reads bypass published_fee_observations.
#   script-kill   Fail if retired one-off data/process scripts are reintroduced.
#   config-kill   Fail if active CI/deploy/env-example config references retired surfaces.
#   artifact-kill Fail if local agent worktrees or stale tool output are tracked.
#   provider-kill Fail if provider construction is bypassing src/lib/ai-provider.ts.
#   legacy-name-kill
#                 Fail if active code/docs reintroduce retired module names.

set -euo pipefail

SUBCOMMAND="${1:-}"

sqlite_kill() {
  local include_dirs=("src")
  local exclude_paths=(
    ":(exclude)src/app/api/_archive"
    ":(exclude)src/**/node_modules/**"
  )

  # Use git grep if in a repo (faster + respects .gitignore), else plain grep.
  local hits=""
  if git rev-parse --git-dir >/dev/null 2>&1; then
    hits=$(git grep -nE 'better-sqlite3|sqlite3|DB_PATH' -- \
      "${include_dirs[@]}" "${exclude_paths[@]}" \
      | grep -v '^Binary file' || true)
  else
    hits=$(grep -rnE 'better-sqlite3|sqlite3|DB_PATH' \
      --include='*.py' --include='*.ts' --include='*.tsx' --include='*.js' --include='*.mjs' \
      --exclude-dir=__pycache__ --exclude-dir=node_modules \
      --exclude='SQLITE_AUDIT.md' \
      --exclude='test_sc4_no_sqlite.py' \
      "${include_dirs[@]}" 2>/dev/null || true)
  fi

  if [[ -n "$hits" ]]; then
    echo "sqlite-kill: runtime SQLite references remain:" >&2
    echo "$hits" >&2
    exit 1
  fi

  echo "sqlite-kill: OK (zero matches in runtime src/)"
  exit 0
}

modal_kill() {
  local include_dirs=("src" "supabase/functions" ".github")
  local exclude_paths=(
    ":(exclude)src/**/node_modules/**"
  )
  local pattern='modal\.run|process\.env\.(OPS_RUN_URL|OPS_CANCEL_URL|MODAL_[A-Z0-9_]*|DARWIN_SIDECAR_URL|MAGELLAN_SIDECAR_URL|EXTRACT_SINGLE_URL)|MODAL_REPORT_URL|MODAL_DISCOVER_URL'
  local hits=""

  if git rev-parse --git-dir >/dev/null 2>&1; then
    hits=$(git grep -nE "$pattern" -- \
      "${include_dirs[@]}" "${exclude_paths[@]}" \
      | grep -v '^Binary file' || true)
  else
    hits=$(grep -rnE "$pattern" \
      --include='*.ts' --include='*.tsx' --include='*.js' --include='*.mjs' \
      --exclude-dir=node_modules \
      "${include_dirs[@]}" 2>/dev/null || true)
  fi

  if [[ -n "$hits" ]]; then
    echo "modal-kill: runtime Modal endpoint/env references remain:" >&2
    echo "$hits" >&2
    exit 1
  fi

  echo "modal-kill: OK (no runtime Modal endpoint/env references in src/, supabase/functions/, or .github/)"
  exit 0
}

legacy_kill() {
  local include_dirs=("src" "supabase/functions" ".github")
  local exclude_paths=(
    ":(exclude)src/**/node_modules/**"
    ":(exclude)src/**/*.test.ts"
    ":(exclude)src/**/*.test.tsx"
    ":(exclude)src/lib/execution-backend.ts"
  )
  local pattern='spawnJob\(|from ['\''"]@/lib/job-runner['\''"]|from ['\''"][^'\'']*/job-runner['\''"]|\bops_jobs\b|\bops_job_id\b|\bmodal_call_id\b|modalCallId|python -m fee_crawler|process\.env\.(OPS_RUN_URL|OPS_CANCEL_URL|MODAL_[A-Z0-9_]*|DARWIN_SIDECAR_URL|MAGELLAN_SIDECAR_URL|EXTRACT_SINGLE_URL)|modal\.run'
  local hits=""

  if git rev-parse --git-dir >/dev/null 2>&1; then
    hits=$(git grep -nE "$pattern" -- \
      "${include_dirs[@]}" "${exclude_paths[@]}" \
      | grep -v '^Binary file' || true)
  else
    hits=$(grep -rnE "$pattern" \
      --include='*.ts' --include='*.tsx' --include='*.js' --include='*.mjs' \
      --exclude-dir=node_modules \
      "${include_dirs[@]}" 2>/dev/null || true)
  fi

  if [[ -n "$hits" ]]; then
    echo "legacy-kill: retired execution references remain in runtime src:" >&2
    echo "$hits" >&2
    exit 1
  fi

  echo "legacy-kill: OK (no retired execution references in runtime src/, supabase/functions/, or .github/)"
  exit 0
}

fee_read_model_kill() {
  local include_dirs=("src" "supabase/functions")
  local exclude_paths=(
    ":(exclude)src/**/node_modules/**"
    ":(exclude)src/**/*.test.ts"
    ":(exclude)src/**/*.test.tsx"
  )
  local hits=""

  if git rev-parse --git-dir >/dev/null 2>&1; then
    hits=$(git grep --untracked -nE '\bextracted_fees\b' -- \
      "${include_dirs[@]}" "${exclude_paths[@]}" \
      | grep -v '^Binary file' || true)
  else
    hits=$(grep -rnE '\bextracted_fees\b' \
      --include='*.ts' --include='*.tsx' --include='*.js' --include='*.mjs' \
      --exclude-dir=node_modules \
      "${include_dirs[@]}" 2>/dev/null || true)
  fi

  if [[ -n "$hits" ]]; then
    echo "fee-read-model-kill: runtime extracted_fees references remain:" >&2
    echo "$hits" >&2
    exit 1
  fi

  echo "fee-read-model-kill: OK (zero runtime extracted_fees references in src/ or supabase/functions/)"
  exit 0
}

script_kill() {
  local include_dirs=("scripts")
  local exclude_paths=(
    ":(exclude)scripts/ci-guards.sh"
    ":(exclude)scripts/check-admin-production-routes.mjs"
  )
  local pattern='fee_crawler|python3? -m fee_crawler|\bops_jobs\b|\bops_job_id\b|\bmodal_call_id\b|modalCallId|\bextracted_fees\b|process\.env\.(OPS_RUN_URL|OPS_CANCEL_URL|MODAL_[A-Z0-9_]*|DARWIN_SIDECAR_URL|MAGELLAN_SIDECAR_URL|EXTRACT_SINGLE_URL)|MODAL_REPORT_URL|modal\.run'
  local hits=""

  if [[ ! -d scripts ]]; then
    echo "script-kill: OK (scripts/ is absent)"
    exit 0
  fi

  if git rev-parse --git-dir >/dev/null 2>&1; then
    hits=$(git grep -nE "$pattern" -- \
      "${include_dirs[@]}" "${exclude_paths[@]}" \
      | grep -v '^Binary file' || true)
  else
    hits=$(grep -rnE "$pattern" \
      --include='*.ts' --include='*.tsx' --include='*.js' --include='*.mjs' --include='*.py' --include='*.sh' \
      --exclude='ci-guards.sh' --exclude='check-admin-production-routes.mjs' \
      "${include_dirs[@]}" 2>/dev/null || true)
  fi

  if [[ -n "$hits" ]]; then
    echo "script-kill: retired data/process scripts remain:" >&2
    echo "$hits" >&2
    exit 1
  fi

  echo "script-kill: OK (no retired data/process scripts)"
  exit 0
}

config_kill() {
  local include_paths=(
    ".env.example"
    ".github"
    "next.config.ts"
    "package.json"
    "supabase/functions"
    "vercel.json"
  )
  local exclude_paths=(
    ":(exclude).github/**/node_modules/**"
  )
  local pattern='fee_crawler|python3? -m fee_crawler|\bops_jobs\b|\bops_job_id\b|\bmodal_call_id\b|modalCallId|\bextracted_fees\b|process\.env\.(OPS_RUN_URL|OPS_CANCEL_URL|MODAL_[A-Z0-9_]*|DARWIN_SIDECAR_URL|MAGELLAN_SIDECAR_URL|EXTRACT_SINGLE_URL)|MODAL_REPORT_URL|MODAL_DISCOVER_URL|DARWIN_SIDECAR_URL|MAGELLAN_SIDECAR_URL|EXTRACT_SINGLE_URL|modal\.run'
  local hits=""

  if git rev-parse --git-dir >/dev/null 2>&1; then
    hits=$(git grep -nE "$pattern" -- \
      "${include_paths[@]}" "${exclude_paths[@]}" \
      | grep -v '^Binary file' || true)
  else
    hits=$(grep -rnE "$pattern" \
      --include='*.ts' --include='*.tsx' --include='*.js' --include='*.mjs' --include='*.json' --include='*.yml' --include='*.yaml' --include='.env.example' \
      --exclude-dir=node_modules \
      "${include_paths[@]}" 2>/dev/null || true)
  fi

  if [[ -n "$hits" ]]; then
    echo "config-kill: active config references retired execution/data surfaces:" >&2
    echo "$hits" >&2
    exit 1
  fi

  echo "config-kill: OK (no retired execution/data surfaces in active config)"
  exit 0
}

artifact_kill() {
  local hits=""

  if git rev-parse --git-dir >/dev/null 2>&1; then
    hits=$(git ls-files -- \
      'fee_crawler/**' \
      '.claude/worktrees/**' \
      '.superpowers/**' \
      '.pytest_cache/**' \
      '.ruff_cache/**' \
      '__pycache__/**' \
      '*.pyc' \
      '*.pyo' \
      '*.db' \
      '*.sqlite' \
      '*.sqlite3' \
      | while IFS= read -r path; do
          [[ -e "$path" ]] && printf '%s\n' "$path"
        done \
      | sed '/^$/d' || true)
  fi

  if [[ -n "$hits" ]]; then
    echo "artifact-kill: tracked local/legacy artifacts remain:" >&2
    echo "$hits" >&2
    exit 1
  fi

  echo "artifact-kill: OK (no tracked local agent worktrees, stale tool output, or crawler artifacts)"
  exit 0
}

provider_kill() {
  local include_dirs=("src")
  local exclude_paths=(
    ":(exclude)src/lib/ai-provider.ts"
    ":(exclude)src/**/*.test.ts"
    ":(exclude)src/**/*.test.tsx"
    ":(exclude)src/**/node_modules/**"
  )
  local pattern='from ['\''"]@anthropic-ai/sdk['\''"]|from ['\''"]@ai-sdk/anthropic['\''"]|new Anthropic\('
  local hits=""

  if git rev-parse --git-dir >/dev/null 2>&1; then
    hits=$(git grep -nE "$pattern" -- \
      "${include_dirs[@]}" "${exclude_paths[@]}" \
      | grep -v '^Binary file' || true)
  else
    hits=$(grep -rnE "$pattern" \
      --include='*.ts' --include='*.tsx' --include='*.js' --include='*.mjs' \
      --exclude='ai-provider.ts' --exclude-dir=node_modules \
      "${include_dirs[@]}" 2>/dev/null || true)
  fi

  if [[ -n "$hits" ]]; then
    echo "provider-kill: direct provider construction/imports remain outside src/lib/ai-provider.ts:" >&2
    echo "$hits" >&2
    exit 1
  fi

  echo "provider-kill: OK (provider construction is centralized in src/lib/ai-provider.ts)"
  exit 0
}

legacy_name_kill() {
  local include_paths=("src" "CLAUDE.md" ".planning" "docs/plans" "README.md")
  local exclude_paths=(
    ":(exclude)src/**/node_modules/**"
  )
  local hits=""

  if git rev-parse --git-dir >/dev/null 2>&1; then
    hits=$(git grep --untracked -nF 'crawler-db' -- \
      "${include_paths[@]}" "${exclude_paths[@]}" \
      | grep -v '^Binary file' || true)
  else
    hits=$(grep -rnF 'crawler-db' \
      --include='*.ts' --include='*.tsx' --include='*.js' --include='*.mjs' --include='*.md' \
      --exclude-dir=node_modules --exclude-dir=archive \
      "${include_paths[@]}" 2>/dev/null || true)
  fi

  if [[ -n "$hits" ]]; then
    echo "legacy-name-kill: retired data module name remains in active code/docs:" >&2
    echo "$hits" >&2
    exit 1
  fi

  echo "legacy-name-kill: OK (no active crawler-db module references)"
  exit 0
}

case "$SUBCOMMAND" in
  sqlite-kill) sqlite_kill ;;
  modal-kill) modal_kill ;;
  legacy-kill) legacy_kill ;;
  fee-read-model-kill) fee_read_model_kill ;;
  script-kill) script_kill ;;
  config-kill) config_kill ;;
  artifact-kill) artifact_kill ;;
  provider-kill) provider_kill ;;
  legacy-name-kill) legacy_name_kill ;;
  "")
    echo "Usage: $0 <sqlite-kill|modal-kill|legacy-kill|fee-read-model-kill|script-kill|config-kill|artifact-kill|provider-kill|legacy-name-kill>" >&2
    exit 2
    ;;
  *)
    echo "Unknown subcommand: $SUBCOMMAND" >&2
    echo "Usage: $0 <sqlite-kill|modal-kill|legacy-kill|fee-read-model-kill|script-kill|config-kill|artifact-kill|provider-kill|legacy-name-kill>" >&2
    exit 2
    ;;
esac
