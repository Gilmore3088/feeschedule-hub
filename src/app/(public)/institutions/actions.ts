"use server";

import { headers } from "next/headers";
import { searchInstitutions } from "@/lib/crawler-db/institutions";
import type { InstitutionSearchResult } from "@/lib/crawler-db/institutions";

const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_IP = 30;

const ipRequests = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = ipRequests.get(ip);

  if (!entry || now > entry.resetAt) {
    ipRequests.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  entry.count++;
  return entry.count > MAX_REQUESTS_PER_IP;
}

export async function searchInstitutionsAction(
  query: string
): Promise<InstitutionSearchResult[]> {
  if (!query || query.trim().length < 2) return [];

  const headersList = await headers();
  const ip =
    headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headersList.get("x-real-ip") ??
    "unknown";

  if (isRateLimited(ip)) return [];

  return searchInstitutions(query.trim().slice(0, 100), 10);
}
