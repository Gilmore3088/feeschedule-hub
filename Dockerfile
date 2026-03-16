# syntax=docker/dockerfile:1

# ── Stage 1: Build the application ──
FROM node:20-slim AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Copy DB for build-time page generation (overridden at runtime by volume mount)
COPY data/crawler.db data/crawler.db
RUN npm run build

# ── Stage 3: Production runner ──
FROM node:20-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Install Litestream for continuous SQLite backup
ADD https://github.com/benbjohnson/litestream/releases/download/v0.3.13/litestream-v0.3.13-linux-amd64.tar.gz /tmp/litestream.tar.gz
RUN tar -C /usr/local/bin -xzf /tmp/litestream.tar.gz && rm /tmp/litestream.tar.gz

# Install Python for crawler commands (refresh-data, run-pipeline via SSH)
RUN apt-get update -qq && \
    apt-get install -y --no-install-recommends python3 python3-pip python3-venv && \
    rm -rf /var/lib/apt/lists/*

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Install Python crawler dependencies
COPY requirements.txt /app/requirements.txt
RUN pip3 install --break-system-packages -r /app/requirements.txt

# Copy crawler code
COPY fee_crawler /app/fee_crawler

# Copy standalone output
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy Litestream config and entrypoint
COPY litestream.yml /etc/litestream.yml
COPY run.sh /app/run.sh
RUN chmod +x /app/run.sh

EXPOSE 3000

CMD ["/app/run.sh"]
