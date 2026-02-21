/**
 * Stripe integration for Bank Fee Index subscriptions.
 *
 * Set STRIPE_SECRET_KEY, STRIPE_STARTER_PRICE_ID, and STRIPE_WEBHOOK_SECRET
 * in your environment. When keys are missing the functions return mock data
 * so the rest of the app can run without a live Stripe account.
 */

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STARTER_PRICE_ID = process.env.STRIPE_STARTER_PRICE_ID || "price_mock_starter";
const PUBLIC_URL = process.env.NEXT_PUBLIC_URL || "http://localhost:3000";

function getStripe() {
  if (!STRIPE_SECRET_KEY) return null;
  // Dynamic import so the app doesn't crash when stripe isn't installed
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Stripe = require("stripe");
  return new Stripe(STRIPE_SECRET_KEY);
}

export interface CheckoutResult {
  url: string;
  sessionId: string;
  mock: boolean;
}

export async function createCheckoutSession(
  orgId: number,
  email: string
): Promise<CheckoutResult> {
  const stripe = getStripe();

  if (!stripe) {
    // Mock mode — return a URL that simulates completing checkout
    const mockSessionId = `cs_mock_${Date.now()}`;
    return {
      url: `${PUBLIC_URL}/api/stripe/mock-checkout?session_id=${mockSessionId}&org_id=${orgId}`,
      sessionId: mockSessionId,
      mock: true,
    };
  }

  const session = await stripe.checkout.sessions.create({
    customer_email: email,
    mode: "subscription",
    line_items: [{ price: STARTER_PRICE_ID, quantity: 1 }],
    success_url: `${PUBLIC_URL}/account?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${PUBLIC_URL}/pricing`,
    metadata: { org_id: String(orgId) },
  });

  return {
    url: session.url!,
    sessionId: session.id,
    mock: false,
  };
}

export async function createBillingPortalSession(
  stripeCustomerId: string
): Promise<{ url: string; mock: boolean }> {
  const stripe = getStripe();

  if (!stripe) {
    return {
      url: `${PUBLIC_URL}/account?mock_portal=true`,
      mock: true,
    };
  }

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: `${PUBLIC_URL}/account`,
  });

  return { url: portalSession.url, mock: false };
}

export async function constructWebhookEvent(
  body: string,
  signature: string
): Promise<{ type: string; data: { object: Record<string, unknown> }; id: string } | null> {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripe || !webhookSecret) return null;

  return stripe.webhooks.constructEvent(body, signature, webhookSecret);
}
