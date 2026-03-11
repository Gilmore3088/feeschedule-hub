#!/usr/bin/env bash
# run_pipeline.sh — Automated fee crawler pipeline with lockfile protection.
#
# Usage:
#   ./scripts/run_pipeline.sh [--tier large|medium|small|all] [--max-cost 50] [--workers 4]
#
# Tiered frequency (designed for cron):
#   Monthly:        institutions with $10B+ assets
#   Quarterly:      institutions with $1B-$10B assets
#   Semi-annually:  institutions with <$1B assets
#
# Cron examples:
#   # Large banks: 1st of every month at 2am
#   0 2 1 * * /path/to/scripts/run_pipeline.sh --tier large --workers 4
#   # Medium banks: 1st of Jan/Apr/Jul/Oct at 3am
#   0 3 1 1,4,7,10 * /path/to/scripts/run_pipeline.sh --tier medium --workers 4
#   # Small banks: 1st of Jan/Jul at 4am
#   0 4 1 1,7 * /path/to/scripts/run_pipeline.sh --tier small --workers 8

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOCKFILE="$PROJECT_DIR/data/pipeline.lock"
LOG_DIR="$PROJECT_DIR/data/logs"
MAX_COST=50
WORKERS=4
TIER="all"

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --tier)     TIER="$2"; shift 2 ;;
        --max-cost) MAX_COST="$2"; shift 2 ;;
        --workers)  WORKERS="$2"; shift 2 ;;
        *)          echo "Unknown option: $1"; exit 1 ;;
    esac
done

# Ensure directories exist
mkdir -p "$LOG_DIR" "$(dirname "$LOCKFILE")"

# Timestamp for log files
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_FILE="$LOG_DIR/pipeline_${TIER}_${TIMESTAMP}.log"

# JSON structured logging helper
log_json() {
    local level="$1" message="$2"
    shift 2
    local extra=""
    while [[ $# -gt 0 ]]; do
        extra="${extra}, \"$1\": \"$2\""
        shift 2
    done
    echo "{\"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\", \"level\": \"$level\", \"message\": \"$message\"${extra}}" >> "$LOG_FILE"
}

# PID-based stale lockfile detection
check_lockfile() {
    if [ -f "$LOCKFILE" ]; then
        local pid
        pid=$(cat "$LOCKFILE" 2>/dev/null)
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            log_json "warn" "Pipeline already running" "pid" "$pid"
            echo "Pipeline already running (PID $pid). Exiting."
            exit 0
        else
            log_json "info" "Removing stale lockfile" "stale_pid" "$pid"
            rm -f "$LOCKFILE"
        fi
    fi
}

# Cleanup on exit
cleanup() {
    rm -f "$LOCKFILE"
    log_json "info" "Pipeline finished" "tier" "$TIER"
}

# Main
check_lockfile
echo $$ > "$LOCKFILE"
trap cleanup EXIT

cd "$PROJECT_DIR"

log_json "info" "Pipeline started" "tier" "$TIER" "max_cost" "$MAX_COST" "workers" "$WORKERS"
echo "Pipeline started: tier=$TIER, max_cost=\$$MAX_COST, workers=$WORKERS"
echo "Log: $LOG_FILE"

# Step 1: URL Discovery (tiered by asset size)
run_discover() {
    local tier_label="$1"
    local state_filter="$2"  # unused for now, reserved

    log_json "info" "Starting discovery" "tier" "$tier_label"

    python -m fee_crawler discover \
        --workers "$WORKERS" \
        --max-search-cost "$MAX_COST" \
        2>&1 | tee -a "$LOG_FILE"

    log_json "info" "Discovery complete" "tier" "$tier_label"
}

# Step 2: Crawl + Extract (tiered by asset size)
run_crawl() {
    local tier_label="$1"

    log_json "info" "Starting crawl" "tier" "$tier_label"

    python -m fee_crawler crawl \
        --workers "$WORKERS" \
        2>&1 | tee -a "$LOG_FILE"

    log_json "info" "Crawl complete" "tier" "$tier_label"
}

# Step 3: Categorize extracted fees
run_categorize() {
    log_json "info" "Starting categorization"

    python -m fee_crawler categorize \
        2>&1 | tee -a "$LOG_FILE"

    log_json "info" "Categorization complete"
}

# Execute based on tier
case "$TIER" in
    large)
        echo "Running pipeline for large institutions ($10B+)..."
        run_discover "large"
        run_crawl "large"
        run_categorize
        ;;
    medium)
        echo "Running pipeline for medium institutions ($1B-$10B)..."
        run_discover "medium"
        run_crawl "medium"
        run_categorize
        ;;
    small)
        echo "Running pipeline for small institutions (<$1B)..."
        run_discover "small"
        run_crawl "small"
        run_categorize
        ;;
    all)
        echo "Running full pipeline (all tiers)..."
        run_discover "all"
        run_crawl "all"
        run_categorize
        ;;
    *)
        echo "Unknown tier: $TIER (use large, medium, small, or all)"
        exit 1
        ;;
esac

# Print summary
echo ""
echo "Pipeline complete. Log: $LOG_FILE"
python -m fee_crawler stats 2>&1 | tee -a "$LOG_FILE"
