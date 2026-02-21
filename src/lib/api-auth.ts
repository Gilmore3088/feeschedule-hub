import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  getApiKeyByHash,
  touchApiKeyUsage,
  getUsageCount,
  trackUsage,
} from "@/lib/subscriber-db";

const MONTHLY_LIMIT = 1000;
const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

export interface ApiAuthResult {
  organizationId: number;
  orgSlug: string;
  keyPrefix: string;
}

/** In-memory rate limit cache to avoid DB hits on every request */
const rateLimitCache = new Map<number, { count: number; reset: number }>();

function hashKey(rawKey: string): string {
  return crypto.createHash("sha256").update(rawKey).digest("hex");
}

export function authenticateApiKey(
  request: NextRequest
): ApiAuthResult | NextResponse {
  const authHeader = request.headers.get("authorization");
  const queryKey = request.nextUrl.searchParams.get("api_key");

  const rawKey = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : queryKey;

  if (!rawKey) {
    return NextResponse.json(
      { error: "Missing API key. Pass via Authorization: Bearer <key> or ?api_key=<key>" },
      { status: 401 }
    );
  }

  const keyHash = hashKey(rawKey);
  const keyRecord = getApiKeyByHash(keyHash);

  if (!keyRecord) {
    return NextResponse.json(
      { error: "Invalid API key" },
      { status: 401 }
    );
  }

  // Rate limiting
  const now = Date.now();
  const cached = rateLimitCache.get(keyRecord.organization_id);

  if (cached && now < cached.reset) {
    if (cached.count >= MONTHLY_LIMIT) {
      return NextResponse.json(
        {
          error: "Rate limit exceeded",
          limit: MONTHLY_LIMIT,
          reset: new Date(cached.reset).toISOString(),
        },
        { status: 429 }
      );
    }
    cached.count++;
  } else {
    // Check DB for actual count
    const sinceDate = new Date(now - MONTH_MS).toISOString();
    const dbCount = getUsageCount(
      keyRecord.organization_id,
      null,
      "api_call",
      sinceDate
    );

    if (dbCount >= MONTHLY_LIMIT) {
      rateLimitCache.set(keyRecord.organization_id, {
        count: dbCount,
        reset: now + 60 * 60 * 1000, // recheck in 1 hour
      });
      return NextResponse.json(
        { error: "Rate limit exceeded", limit: MONTHLY_LIMIT },
        { status: 429 }
      );
    }

    rateLimitCache.set(keyRecord.organization_id, {
      count: dbCount + 1,
      reset: now + 5 * 60 * 1000, // cache for 5 minutes
    });
  }

  // Track and update
  touchApiKeyUsage(keyHash);
  trackUsage({
    organization_id: keyRecord.organization_id,
    event_type: "api_call",
    metadata: { path: request.nextUrl.pathname },
  });

  return {
    organizationId: keyRecord.organization_id,
    orgSlug: keyRecord.org_slug,
    keyPrefix: keyRecord.key_prefix,
  };
}
