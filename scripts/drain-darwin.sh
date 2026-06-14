#!/bin/bash
# Drain Darwin backlog in 5000-fee batches until pending=0 or budget exceeded.
# Each batch reports promoted/cached_low_conf/rejected counts and cumulative cost.
# Logs to /tmp/darwin-drain.log
#
# Stop conditions:
#  - pending == 0
#  - cumulative cost exceeds $30 (safety brake above $20 expected)
#  - 25 batches without progress
#  - non-2xx HTTP response

set -uo pipefail
BATCH_SIZE=5000
MAX_BATCHES=25
MAX_USD=30.00
ENDPOINT="https://gilmore3088--bank-fee-index-workers-darwin-api.modal.run/darwin/classify-batch"
STATUS_URL="https://gilmore3088--bank-fee-index-workers-darwin-api.modal.run/darwin/status"
LOG=/tmp/darwin-drain.log
date | tee "$LOG"

total_cost=0
total_promoted=0
total_processed=0

for i in $(seq 1 $MAX_BATCHES); do
  pending=$(curl -s -m 30 "$STATUS_URL" | grep -oE '"pending":[0-9]+' | head -1 | cut -d: -f2)
  if [ -z "$pending" ] || [ "$pending" -le 0 ] 2>/dev/null; then
    echo "[$(date +%T)] pending=$pending — drain complete" | tee -a "$LOG"
    break
  fi

  echo "[$(date +%T)] batch $i/$MAX_BATCHES — pending=$pending, cumulative_cost=\$$total_cost, total_promoted=$total_promoted" | tee -a "$LOG"

  raw=$(curl -sN -X POST "$ENDPOINT" \
    -H "Content-Type: application/json" \
    -d "{\"size\": $BATCH_SIZE}" \
    -m 2700 2>&1 | grep '"type": "done"' | tail -1)

  if [ -z "$raw" ]; then
    echo "[$(date +%T)] batch $i: no 'done' event; aborting" | tee -a "$LOG"
    break
  fi

  promoted=$(echo "$raw" | grep -oE '"promoted": [0-9]+' | cut -d' ' -f2)
  cached=$(echo "$raw" | grep -oE '"cached_low_conf": [0-9]+' | cut -d' ' -f2)
  rejected=$(echo "$raw" | grep -oE '"rejected": [0-9]+' | cut -d' ' -f2)
  cost=$(echo "$raw" | grep -oE '"cost_usd": [0-9.]+' | cut -d' ' -f2)
  processed=$(echo "$raw" | grep -oE '"processed": [0-9]+' | cut -d' ' -f2)

  total_cost=$(echo "$total_cost + $cost" | bc -l)
  total_promoted=$((total_promoted + promoted))
  total_processed=$((total_processed + processed))

  echo "[$(date +%T)] batch $i done: processed=$processed promoted=$promoted cached=$cached rejected=$rejected batch_cost=\$$cost" | tee -a "$LOG"

  exceeded=$(echo "$total_cost > $MAX_USD" | bc -l)
  if [ "$exceeded" = "1" ]; then
    echo "[$(date +%T)] BUDGET HIT (\$$total_cost > \$$MAX_USD) — halting drain" | tee -a "$LOG"
    break
  fi
done

date | tee -a "$LOG"
echo "" | tee -a "$LOG"
echo "==== SUMMARY ====" | tee -a "$LOG"
echo "total processed: $total_processed" | tee -a "$LOG"
echo "total promoted:  $total_promoted" | tee -a "$LOG"
echo "total cost USD:  \$$total_cost" | tee -a "$LOG"
