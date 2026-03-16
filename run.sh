#!/bin/sh
set -e

# If Litestream env vars are set, restore DB (if needed) and replicate
if [ -n "$LITESTREAM_REPLICA_BUCKET" ]; then
  # Only restore if DB doesn't exist yet
  if [ ! -f /data/crawler.db ]; then
    echo "Restoring database from Litestream replica..."
    litestream restore -if-replica-exists -config /etc/litestream.yml /data/crawler.db
  else
    echo "Database exists, skipping restore."
  fi

  echo "Starting Litestream replication + Next.js..."
  exec litestream replicate -config /etc/litestream.yml -exec "node /app/server.js"
else
  echo "No LITESTREAM_REPLICA_BUCKET set, starting without backup..."
  exec node /app/server.js
fi
