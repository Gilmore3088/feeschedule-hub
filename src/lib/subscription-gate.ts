import { cookies } from "next/headers";
import { getCurrentSubscriber } from "@/lib/subscriber-auth";
import { getUsageCount } from "@/lib/subscriber-db";

const ANON_COOKIE = "bfi_anon";
const MONTH_MS = 30 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface GateResult {
  allowed: boolean;
  reason?: "limit_reached" | "subscription_required";
  remaining?: number;
  limit?: number;
  isSubscriber: boolean;
}

/** Get or create an anonymous tracking ID */
export async function getAnonymousId(): Promise<string> {
  const cookieStore = await cookies();
  let anonId = cookieStore.get(ANON_COOKIE)?.value;
  if (!anonId) {
    const { randomBytes } = await import("crypto");
    anonId = randomBytes(16).toString("hex");
    cookieStore.set(ANON_COOKIE, anonId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 365 * 24 * 60 * 60, // 1 year
      path: "/",
    });
  }
  return anonId;
}

/** Check if a user can access a metered resource */
export async function checkGate(
  eventType: string,
  limit: number,
  windowMs: number = MONTH_MS
): Promise<GateResult> {
  const subscriber = await getCurrentSubscriber();

  // Subscribers with active plans get unlimited access
  if (subscriber?.subscriptionActive) {
    return { allowed: true, isSubscriber: true };
  }

  const sinceDate = new Date(Date.now() - windowMs).toISOString();
  let usageCount: number;

  if (subscriber) {
    usageCount = getUsageCount(
      subscriber.organizationId,
      null,
      eventType,
      sinceDate
    );
  } else {
    const anonId = await getAnonymousId();
    usageCount = getUsageCount(null, anonId, eventType, sinceDate);
  }

  const remaining = Math.max(0, limit - usageCount);
  return {
    allowed: remaining > 0,
    reason: remaining <= 0 ? "limit_reached" : undefined,
    remaining,
    limit,
    isSubscriber: !!subscriber,
  };
}

/** Check research article gate: 3 free per month */
export async function checkResearchGate(): Promise<GateResult> {
  return checkGate("research_view", 3, MONTH_MS);
}

/** Check comparison gate: 1 free per day */
export async function checkCompareGate(): Promise<GateResult> {
  return checkGate("compare", 1, DAY_MS);
}

/** Check if the current user has an active subscription (server component helper) */
export async function hasActiveSubscription(): Promise<boolean> {
  const subscriber = await getCurrentSubscriber();
  return subscriber?.subscriptionActive ?? false;
}
