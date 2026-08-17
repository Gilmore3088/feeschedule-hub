import { sanitizeInternalRedirect } from "@/lib/safe-redirect";
import type { ProPlan } from "@/app/subscribe/pricing";

const SUBSCRIBE_PATH = "/subscribe";

/**
 * Where a ?plan= signup lands: /subscribe with the plan preselected and
 * checkout=1 so the page starts Stripe checkout without another click.
 * Any other sanitized ?from= is carried along as the post-checkout return path.
 */
export function checkoutPathFor(plan: ProPlan, from: string | null | undefined): string {
  const fallback = `${SUBSCRIBE_PATH}?plan=${plan}`;
  const sanitized = sanitizeInternalRedirect(from, fallback);
  const url = new URL(sanitized, "https://internal.invalid");
  if (url.pathname !== SUBSCRIBE_PATH) {
    const params = new URLSearchParams({ plan, checkout: "1", from: sanitized });
    return `${SUBSCRIBE_PATH}?${params.toString()}`;
  }
  url.searchParams.set("plan", plan);
  url.searchParams.set("checkout", "1");
  return `${url.pathname}?${url.searchParams.toString()}`;
}
