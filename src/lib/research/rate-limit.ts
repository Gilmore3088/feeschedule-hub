/**
 * In-memory rate limiter for research agents.
 * Tracks requests per IP (public) or per user ID (admin).
 */

interface RateBucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, RateBucket>();

// Clean up stale buckets every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}, 5 * 60 * 1000);

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

const LIMITS: Record<string, RateLimitConfig> = {
  public: { maxRequests: 10, windowMs: 60 * 1000 }, // 10/min
  public_daily: { maxRequests: 50, windowMs: 24 * 60 * 60 * 1000 }, // 50/day
  analyst: { maxRequests: 50, windowMs: 24 * 60 * 60 * 1000 }, // 50/day
  admin: { maxRequests: 200, windowMs: 24 * 60 * 60 * 1000 }, // 200/day
};

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

function check(key: string, config: RateLimitConfig): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + config.windowMs });
    return { allowed: true, remaining: config.maxRequests - 1, resetAt: now + config.windowMs };
  }

  if (bucket.count >= config.maxRequests) {
    return { allowed: false, remaining: 0, resetAt: bucket.resetAt };
  }

  bucket.count++;
  return {
    allowed: true,
    remaining: config.maxRequests - bucket.count,
    resetAt: bucket.resetAt,
  };
}

export function checkPublicRateLimit(ip: string): RateLimitResult {
  // Check per-minute limit
  const minuteResult = check(`pub:min:${ip}`, LIMITS.public);
  if (!minuteResult.allowed) return minuteResult;

  // Check daily limit
  return check(`pub:day:${ip}`, LIMITS.public_daily);
}

export function checkAdminRateLimit(
  userId: number,
  role: "analyst" | "admin"
): RateLimitResult {
  const config = LIMITS[role] ?? LIMITS.analyst;
  return check(`admin:${userId}`, config);
}
