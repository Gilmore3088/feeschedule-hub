import { sql } from "@/lib/crawler-db/connection";

const TIER_LIMITS: Record<string, number> = {
  free: 100,
  pro: 10_000,
  enterprise: Infinity,
};

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  reset: Date;
}

function getMonthReset(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

function getMonthStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export async function checkRateLimit(
  organizationId: number | null,
  anonymousId: string | null
): Promise<RateLimitResult> {
  // Determine tier from caller context (set by api-auth before this runs)
  // Enterprise has no limit
  const tier = organizationId ? "pro" : "free";
  const limit = TIER_LIMITS[tier];

  if (limit === Infinity) {
    return { allowed: true, remaining: Infinity, limit: Infinity, reset: getMonthReset() };
  }

  const monthStart = getMonthStart();

  let rows;
  if (organizationId) {
    rows = await sql`
      SELECT COUNT(*)::int AS cnt
      FROM usage_events
      WHERE organization_id = ${organizationId}
        AND created_at >= ${monthStart.toISOString()}
    `;
  } else {
    rows = await sql`
      SELECT COUNT(*)::int AS cnt
      FROM usage_events
      WHERE anonymous_id = ${anonymousId}
        AND organization_id IS NULL
        AND created_at >= ${monthStart.toISOString()}
    `;
  }

  const used = rows[0]?.cnt ?? 0;
  const remaining = Math.max(0, limit - used);

  return {
    allowed: used < limit,
    remaining,
    limit,
    reset: getMonthReset(),
  };
}

export async function checkRateLimitWithTier(
  organizationId: number | null,
  anonymousId: string | null,
  tier: string
): Promise<RateLimitResult> {
  const limit = TIER_LIMITS[tier] ?? TIER_LIMITS.free;

  if (limit === Infinity) {
    return { allowed: true, remaining: Infinity, limit: Infinity, reset: getMonthReset() };
  }

  const monthStart = getMonthStart();

  let rows;
  if (organizationId) {
    rows = await sql`
      SELECT COUNT(*)::int AS cnt
      FROM usage_events
      WHERE organization_id = ${organizationId}
        AND created_at >= ${monthStart.toISOString()}
    `;
  } else {
    rows = await sql`
      SELECT COUNT(*)::int AS cnt
      FROM usage_events
      WHERE anonymous_id = ${anonymousId}
        AND organization_id IS NULL
        AND created_at >= ${monthStart.toISOString()}
    `;
  }

  const used = rows[0]?.cnt ?? 0;
  const remaining = Math.max(0, limit - used);

  return {
    allowed: used < limit,
    remaining,
    limit,
    reset: getMonthReset(),
  };
}
