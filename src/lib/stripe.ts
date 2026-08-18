import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function normalizeStripeKey(raw: string | undefined): string {
  const key = (raw ?? "").trim();
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  return key;
}

export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(normalizeStripeKey(process.env.STRIPE_SECRET_KEY), { typescript: true });
  }
  return _stripe;
}

export function getWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not configured");
  }
  return secret;
}
