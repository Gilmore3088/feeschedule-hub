"use server";

import { getStripe } from "@/lib/stripe";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { headers } from "next/headers";

export async function createCheckoutSession(
  priceId: string,
  mode: "subscription" | "payment" = "subscription",
): Promise<{ url: string | null }> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  if (!priceId) throw new Error("Price ID is required");

  const stripe = getStripe();
  const origin = (await headers()).get("origin") || process.env.NEXT_PUBLIC_SITE_URL;

  const session = await stripe.checkout.sessions.create({
    mode,
    line_items: [{ price: priceId, quantity: 1 }],
    customer: user.stripe_customer_id || undefined,
    customer_email: user.stripe_customer_id ? undefined : (user.email || user.username),
    success_url: `${origin}/account?success=true`,
    cancel_url: `${origin}/subscribe`,
    metadata: {
      user_id: String(user.id),
      email: user.email || user.username,
    },
  });

  return { url: session.url };
}

export async function createPortalSession(): Promise<void> {
  const user = await getCurrentUser();
  if (!user || !user.stripe_customer_id) {
    throw new Error("No billing account found");
  }

  const stripe = getStripe();
  const origin = (await headers()).get("origin") || process.env.NEXT_PUBLIC_SITE_URL;

  const session = await stripe.billingPortal.sessions.create({
    customer: user.stripe_customer_id,
    return_url: `${origin}/account`,
  });

  redirect(session.url);
}
