const CHECKOUT_CANCELED = "canceled";

/**
 * Drops the `checkout` query param while keeping every other param intact.
 * Used to scrub `?checkout=1` from the URL bar right before handing off to
 * Stripe, so pressing browser Back never lands on an auto-redirecting URL.
 */
export function stripCheckoutParam(href: string): string {
  const url = new URL(href, "https://internal.invalid");
  url.searchParams.delete("checkout");
  const query = url.searchParams.toString();
  return `${url.pathname}${query ? `?${query}` : ""}`;
}

/** Detects Stripe's cancel-return leg (`?checkout=canceled`) among search params. */
export function checkoutNotice(
  params: Record<string, string | string[] | undefined>,
): "canceled" | null {
  return params.checkout === CHECKOUT_CANCELED ? CHECKOUT_CANCELED : null;
}
