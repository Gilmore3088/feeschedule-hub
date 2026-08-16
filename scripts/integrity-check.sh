#!/bin/zsh
# Data-integrity battery for the fee catalog. Read-only.
# Usage: ./scripts/integrity-check.sh   (reads DATABASE_URL from .env.local)
# Exit code: 0 = all hard checks pass, 1 = at least one hard failure.
# Origin: docs/audits/2026-08-15-catalog-data-quality.md (the checks that caught
# the 72%-duplicate + provenance issues). Run nightly (cron/launchd) or pre-send.
set -euo pipefail
DIR="${0:a:h}/.."
DB="${DATABASE_URL:-$(grep '^DATABASE_URL=' "$DIR/.env.local" | cut -d= -f2- | tr -d '"')}"

fail=0
check() { # name expected_zero actual
  local name="$1" val="$2" hard="${3:-hard}"
  if [ "$val" = "0" ]; then
    echo "  PASS  $name"
  elif [ "$hard" = "hard" ]; then
    echo "✗ FAIL  $name = $val"; fail=1
  else
    echo "⚠ WARN  $name = $val"
  fi
}

echo "── integrity: lineage & structure (hard fails) ──"
check "published rows w/ broken verified lineage" "$(psql "$DB" -tAc "select count(*) from published_fee_records p where rolled_back_at is null and not exists (select 1 from verified_fee_observations v where v.fee_verified_id=p.lineage_ref)")"
check "verified rows w/ broken raw lineage" "$(psql "$DB" -tAc "select count(*) from verified_fee_observations v where not exists (select 1 from raw_fee_observations r where r.fee_raw_id=v.fee_raw_id)")"
check "published rows w/ unknown institution" "$(psql "$DB" -tAc "select count(*) from published_fee_records p where rolled_back_at is null and not exists (select 1 from institution_sources i where i.id=p.institution_id)")"
check "exact duplicate published rows" "$(psql "$DB" -tAc "select count(*)-count(distinct (institution_id,canonical_fee_key,fee_name,amount,coalesce(frequency,''),coalesce(variant_type,''),coalesce(source_url,''))) from published_fee_records where rolled_back_at is null")"
check "negative amounts" "$(psql "$DB" -tAc "select count(*) from published_fee_records where rolled_back_at is null and amount < 0")"
check "null-amount published rows" "$(psql "$DB" -tAc "select count(*) from published_fee_records where rolled_back_at is null and amount is null")"
check "registry rows missing state/charter/tier" "$(psql "$DB" -tAc "select count(*) from institution_sources where state_code is null or charter_type is null or asset_size_tier is null")"

echo "── integrity: provenance & freshness (warnings) ──"
check "published rows w/o any source link" "$(psql "$DB" -tAc "select count(*) from published_fee_records where rolled_back_at is null and source_url is null and document_r2_key is null")" soft
check "institutions fully unsourced" "$(psql "$DB" -tAc "select count(*) from (select institution_id from published_fee_records where rolled_back_at is null group by 1 having count(*) filter (where source_url is not null or document_r2_key is not null)=0) x")" soft
check "sources failing 5+ consecutive" "$(psql "$DB" -tAc "select count(*) from institution_sources where consecutive_failures >= 5")" soft
check "days since last successful crawl" "$(psql "$DB" -tAc "select coalesce(extract(day from now()-max(last_success_at))::int, 999) from institution_sources")" soft

echo "── snapshot ──"
psql "$DB" -tAc "select 'published rows: '||count(*)||' · institutions w/ fees: '||count(distinct institution_id) from published_fee_records where rolled_back_at is null"

exit $fail
