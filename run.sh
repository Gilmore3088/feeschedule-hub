#!/bin/sh
set -e

# If Litestream env vars are set, restore DB and replicate
if [ -n "$LITESTREAM_REPLICA_BUCKET" ]; then
  echo "Restoring database from Litestream replica..."
  litestream restore -if-replica-exists -config /etc/litestream.yml /data/crawler.db

  echo "Starting Litestream replication + Next.js..."
  exec litestream replicate -config /etc/litestream.yml -exec "node /app/server.js"
else
  echo "No LITESTREAM_REPLICA_BUCKET set, starting without backup..."
  exec node /app/server.js
fi
