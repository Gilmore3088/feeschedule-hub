import { NextRequest, NextResponse } from "next/server";
import { constructWebhookEvent } from "@/lib/stripe";
import {
  isStripeEventProcessed,
  markStripeEventProcessed,
  createSubscription,
  updateSubscription,
  updateOrganizationStripeCustomer,
  getOrganizationByStripeCustomer,
} from "@/lib/subscriber-db";

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const event = await constructWebhookEvent(body, signature);
  if (!event) {
    return NextResponse.json({ error: "Invalid event" }, { status: 400 });
  }

  // Idempotent: skip already-processed events
  if (isStripeEventProcessed(event.id)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  const obj = event.data.object as Record<string, unknown>;

  switch (event.type) {
    case "checkout.session.completed": {
      const orgId = Number(
        (obj.metadata as Record<string, string>)?.org_id
      );
      const customerId = obj.customer as string;
      const subscriptionId = obj.subscription as string;

      if (orgId && customerId) {
        updateOrganizationStripeCustomer(orgId, customerId);
      }

      if (subscriptionId && orgId) {
        createSubscription({
          organization_id: orgId,
          stripe_subscription_id: subscriptionId,
          plan: "starter",
          status: "active",
          current_period_start: new Date().toISOString(),
          current_period_end: new Date(
            Date.now() + 365 * 24 * 60 * 60 * 1000
          ).toISOString(),
        });
      }
      break;
    }

    case "invoice.paid": {
      const subscriptionId = obj.subscription as string;
      if (subscriptionId) {
        const periodEnd = obj.lines
          ? new Date(
              (
                (obj.lines as { data: { period: { end: number } }[] })
                  .data[0]?.period?.end ?? Date.now() / 1000
              ) * 1000
            ).toISOString()
          : new Date(
              Date.now() + 365 * 24 * 60 * 60 * 1000
            ).toISOString();

        updateSubscription(subscriptionId, {
          status: "active",
          current_period_end: periodEnd,
        });
      }
      break;
    }

    case "customer.subscription.updated": {
      const subId = obj.id as string;
      const status = obj.status as string;
      const cancelAtEnd = obj.cancel_at_period_end as boolean;

      updateSubscription(subId, {
        status: status === "active" ? "active" : status === "past_due" ? "past_due" : "canceled",
        cancel_at_period_end: cancelAtEnd ? 1 : 0,
      });
      break;
    }

    case "customer.subscription.deleted": {
      const subId = obj.id as string;
      updateSubscription(subId, { status: "canceled" });
      break;
    }
  }

  markStripeEventProcessed(event.id, event.type);
  return NextResponse.json({ received: true });
}
