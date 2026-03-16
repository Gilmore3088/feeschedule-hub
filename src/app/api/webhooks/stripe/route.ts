import { getStripe, getWebhookSecret } from "@/lib/stripe";
import { getWriteDb } from "@/lib/crawler-db/connection";
import { headers } from "next/headers";
import type Stripe from "stripe";

export async function POST(req: Request) {
  const body = await req.text();
  const signature = (await headers()).get("stripe-signature");

  if (!signature) {
    return new Response("Missing stripe-signature header", { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(
      body,
      signature,
      getWebhookSecret()
    );
  } catch (err) {
    console.error("[stripe-webhook] Signature verification failed:", err instanceof Error ? err.message : err);
    return new Response("Invalid signature", { status: 400 });
  }

  console.log(`[stripe-webhook] Received ${event.type} (${event.id})`);

  // Process synchronously -- SQLite writes take ~1ms
  const db = getWriteDb();
  try {
    db.transaction(() => {
      // Atomic idempotency: INSERT OR IGNORE + check changes
      const result = db
        .prepare(
          `INSERT OR IGNORE INTO stripe_events (id, event_type, stripe_customer_id, payload_json)
           VALUES (?, ?, ?, ?)`
        )
        .run(
          event.id,
          event.type,
          extractCustomerId(event),
          JSON.stringify(event)
        );

      if (result.changes === 0) return; // Already processed

      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session;
          const customerId =
            typeof session.customer === "string"
              ? session.customer
              : session.customer?.id;
          const email = session.customer_email || session.metadata?.email;

          console.log(`[stripe-webhook] checkout.session.completed: customer=${customerId}, email=${email}, metadata=${JSON.stringify(session.metadata)}`);

          if (customerId && email) {
            const result2 = db.prepare(
              `UPDATE users SET subscription_status = 'active', role = 'premium', stripe_customer_id = ?
               WHERE (email = ? OR username = ?) AND role NOT IN ('admin', 'analyst')`
            ).run(customerId, email, email);
            console.log(`[stripe-webhook] Updated ${result2.changes} user(s) for ${email}`);
          }
          break;
        }

        case "customer.subscription.updated": {
          const sub = event.data.object as Stripe.Subscription;
          const customerId =
            typeof sub.customer === "string" ? sub.customer : sub.customer.id;
          const status = mapStripeStatus(sub.status);
          db.prepare(
            `UPDATE users SET subscription_status = ?
             WHERE stripe_customer_id = ?`
          ).run(status, customerId);
          break;
        }

        case "customer.subscription.deleted": {
          const sub = event.data.object as Stripe.Subscription;
          const customerId =
            typeof sub.customer === "string" ? sub.customer : sub.customer.id;
          // Only downgrade viewer/premium -- never touch analyst/admin
          db.prepare(
            `UPDATE users SET subscription_status = 'canceled'
             WHERE stripe_customer_id = ? AND role IN ('viewer', 'premium')`
          ).run(customerId);
          break;
        }

        case "invoice.payment_failed": {
          const invoice = event.data.object as Stripe.Invoice;
          const customerId =
            typeof invoice.customer === "string"
              ? invoice.customer
              : invoice.customer?.id;
          if (customerId) {
            db.prepare(
              `UPDATE users SET subscription_status = 'past_due'
               WHERE stripe_customer_id = ?`
            ).run(customerId);
          }
          break;
        }
      }
    })();
  } catch (err) {
    console.error(`[stripe-webhook] Failed to process ${event.id} (${event.type}):`, err);
    return new Response("Processing failed", { status: 500 });
  } finally {
    db.close();
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 });
}

function extractCustomerId(event: Stripe.Event): string | null {
  const obj = event.data.object as unknown as Record<string, unknown>;
  const customer = obj.customer;
  if (typeof customer === "string") return customer;
  if (customer && typeof customer === "object" && "id" in (customer as object)) {
    return (customer as { id: string }).id;
  }
  return null;
}

type SubscriptionStatus = "none" | "active" | "past_due" | "canceled";

function mapStripeStatus(stripeStatus: string): SubscriptionStatus {
  switch (stripeStatus) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
      return "canceled";
    default:
      return "none";
  }
}
