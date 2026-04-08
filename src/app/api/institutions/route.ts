import { NextRequest, NextResponse } from "next/server";
import { autocompleteInstitutions } from "@/lib/crawler-db/search";

// Simple in-memory rate limiter for autocomplete: 60 requests/minute per IP
const searchBuckets = new Map<string, { count: number; resetAt: number }>();

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of searchBuckets) {
    if (bucket.resetAt <= now) searchBuckets.delete(key);
  }
}, 5 * 60 * 1000);

function checkSearchRateLimit(ip: string): boolean {
  const now = Date.now();
  const windowMs = 60 * 1000;
  const maxRequests = 60;
  const bucket = searchBuckets.get(ip);
  if (!bucket || bucket.resetAt <= now) {
    searchBuckets.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= maxRequests) return false;
  bucket.count++;
  return true;
}

export async function GET(request: NextRequest) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";

  if (!checkSearchRateLimit(ip)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const q = request.nextUrl.searchParams.get("q") || "";
  const results = await autocompleteInstitutions(q, 8);
  return NextResponse.json(results);
}
