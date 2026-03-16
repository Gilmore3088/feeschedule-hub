---
module: Deployment
date: 2026-03-15
problem_type: build_error
component: development_workflow
symptoms:
  - "SqliteError: no such table: crawl_targets during npm run build"
  - "EmptyGenerateStaticParamsError with cacheComponents enabled"
  - "Route segment config dynamic not compatible with cacheComponents"
  - "/app/public: not found in Docker runner stage"
root_cause: incomplete_setup
resolution_type: config_change
severity: critical
tags: [docker, fly-io, sqlite, next-js-16, prerender, cache-components, deployment]
---

# Docker Build Fails: SQLite + Next.js 16 Prerendering on Fly.io

## Symptom

`fly deploy` fails during `npm run build` inside the Docker container. Multiple cascading errors across 6 deploy attempts:

1. `Cannot find module 'typescript'` -- devDependencies stripped
2. `SqliteError: no such table: crawl_targets` -- no DB during build
3. `EmptyGenerateStaticParamsError` -- cacheComponents requires non-empty results
4. `Route segment config "dynamic" not compatible with cacheComponents` -- can't use force-dynamic
5. `no such column: ef.created_at` -- stub tables missing columns
6. `/app/public: not found` -- missing public directory

## Investigation

1. **Attempt 1:** Dockerfile had `npm ci --omit=dev` in deps stage, but builder stage needed TypeScript. Fix: single stage with `npm ci` (all deps).

2. **Attempt 2:** Build succeeded compilation but crashed at page data collection -- `better-sqlite3` tries to open `data/crawler.db` which doesn't exist in Docker. Fix: in-memory SQLite fallback when file missing.

3. **Attempt 3:** In-memory DB has no tables. Created stub table definitions in `connection.ts`. Passed page data collection but `generateStaticParams` for institutions returned empty array, which `cacheComponents` rejects.

4. **Attempt 4:** Tried `export const dynamic = "force-dynamic"` on layouts. Next.js 16 rejects this when `cacheComponents: true` is set.

5. **Attempt 5:** Removed `cacheComponents`. Build failed because `src/app/pro/page.tsx` uses `"use cache"` directive which requires `cacheComponents: true`.

6. **Attempt 6:** Re-enabled `cacheComponents`, included real `data/crawler.db` in Docker build context. Build succeeded but `/app/public` directory didn't exist. Created empty `public/.gitkeep`.

7. **Attempt 7:** All 2,288 pages prerendered successfully with real data. Deploy succeeded.

## Root Cause

Next.js 16 with `cacheComponents: true` aggressively prerenders pages at build time. When the SQLite database file doesn't exist in the Docker build environment, every DB query crashes. The constraints are:

- `cacheComponents: true` is required (pages use `"use cache"` directive)
- `force-dynamic` is incompatible with `cacheComponents`
- `generateStaticParams` must return non-empty arrays with `cacheComponents`
- Stub/in-memory tables miss columns that real queries depend on

The only reliable solution: **include the real database in the Docker build context**.

## Solution

### 1. Remove `data/` from `.dockerignore`:

```dockerfile
# .dockerignore
# data/ - not ignored; needed for build-time page generation
```

### 2. Explicitly COPY the DB in the Dockerfile:

```dockerfile
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Copy DB for build-time page generation (overridden at runtime by volume mount)
COPY data/crawler.db data/crawler.db
RUN npm run build
```

### 3. Create empty `public/` directory:

```bash
mkdir -p public && touch public/.gitkeep
```

### 4. Keep `cacheComponents: true` in next.config.ts (required by "use cache")

### 5. Add try/catch to `getPublicStats()` for resilience:

```typescript
export function getPublicStats(): PublicStats {
  try {
    // ... existing query
  } catch {
    return { total_observations: 0, total_institutions: 0, total_categories: 0, total_states: 0 };
  }
}
```

At runtime, Fly.io mounts the persistent volume at `/data` which overrides the build-time copy with the live database.

## Prevention

- Always test `fly deploy` early in a project -- don't wait until you have 2,288 pages to discover build issues
- When using `cacheComponents` in Next.js 16, ensure the build environment has access to all data sources pages depend on
- Never use `force-dynamic` with `cacheComponents: true`
- The Docker build context size increase (~94MB for the DB) is acceptable -- it's a one-time upload that gets cached

## Files Changed

- `Dockerfile` -- single build stage with `npm ci`, explicit DB COPY
- `.dockerignore` -- un-ignored `data/`
- `next.config.ts` -- kept `cacheComponents: true`
- `src/lib/crawler-db/connection.ts` -- clean singleton (no build-time hacks)
- `src/lib/crawler-db/core.ts` -- try/catch on `getPublicStats()`
- `public/.gitkeep` -- created empty directory

## Related

- Next.js 16 cacheComponents: https://nextjs.org/docs/app/api-reference/directives/use-cache
- Fly.io volumes: https://fly.io/docs/volumes/
- Next.js proxy.ts (replaces middleware.ts in v16): https://nextjs.org/docs/messages/middleware-to-proxy
