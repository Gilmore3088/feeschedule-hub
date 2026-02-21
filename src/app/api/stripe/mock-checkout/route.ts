import { NextRequest, NextResponse } from "next/server";
import {
  createSubscription,
  updateOrganizationStripeCustomer,
} from "@/lib/subscriber-db";
import { refreshSubscriberSession } from "@/lib/subscriber-auth";

/**
 * Mock checkout endpoint for development without Stripe keys.
 * Simulates a successful checkout by creating a subscription directly.
 */
export async function GET(request: NextRequest) {
  if (process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json(
      { error: "Mock checkout disabled when Stripe is configured" },
      { status: 403 }
    );
  }

  const orgId = Number(request.nextUrl.searchParams.get("org_id"));
  const sessionId = request.nextUrl.searchParams.get("session_id") || "mock";

  if (!orgId) {
    return NextResponse.json({ error: "Missing org_id" }, { status: 400 });
  }

  // Create a mock subscription
  const mockCustomerId = `cus_mock_${orgId}`;
  updateOrganizationStripeCustomer(orgId, mockCustomerId);

  createSubscription({
    organization_id: orgId,
    stripe_subscription_id: `sub_mock_${sessionId}`,
    plan: "starter",
    status: "active",
    current_period_start: new Date().toISOString(),
    current_period_end: new Date(
      Date.now() + 365 * 24 * 60 * 60 * 1000
    ).toISOString(),
  });

  // Refresh the session cookie so the subscriber sees active status
  await refreshSubscriberSession(orgId);

  return NextResponse.redirect(
    new URL("/account?session_id=" + sessionId, request.url)
  );
}
