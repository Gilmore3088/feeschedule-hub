"use client";

import { createCheckoutSession } from "@/lib/stripe-actions";
import { CONTACT_EMAIL } from "@/lib/constants";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { stripCheckoutParam } from "./checkout-url";

interface SubscribeButtonProps {
  priceId: string;
  mode?: "subscription" | "payment";
  label: string;
  className?: string;
  returnTo?: string;
  /** Start checkout as soon as the button mounts (post-signup hand-off). */
  autoStart?: boolean;
}

const DEFAULT_CLASS =
  "w-full rounded-md bg-[#C44B2E] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#A93D25] disabled:opacity-50 disabled:cursor-not-allowed transition-colors";

const NO_PRICE_ID_ERROR = `Checkout is not available right now. Email ${CONTACT_EMAIL} and we'll set up your seat.`;

export function SubscribeButton({
  priceId,
  mode = "subscription",
  label,
  className,
  returnTo,
  autoStart = false,
}: SubscribeButtonProps) {
  const router = useRouter();
  // A misconfigured price id is knowable at mount time from props alone, so
  // it is derived here rather than discovered inside an effect.
  const missingAutoStartPriceId = autoStart && !priceId;
  // When auto-starting with a usable price id, render as pending from the first paint.
  const [pending, setPending] = useState(autoStart && !missingAutoStartPriceId);
  const [error, setError] = useState<string | null>(
    missingAutoStartPriceId ? NO_PRICE_ID_ERROR : null,
  );
  const autoStarted = useRef(false);

  const startCheckout = useCallback(async () => {
    setPending(true);
    setError(null);
    try {
      const { url } = await createCheckoutSession(priceId, mode, returnTo);
      if (url) {
        // Replace the current history entry with the checkout-stripped URL
        // first, so pressing Back after the Stripe hand-off never returns to
        // an auto-redirecting `?checkout=1` URL.
        window.history.replaceState(
          null,
          "",
          stripCheckoutParam(window.location.pathname + window.location.search),
        );
        window.location.assign(url);
      } else {
        setError("Could not create checkout. Please try again.");
        setPending(false);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong";
      if (msg.includes("Not authenticated")) {
        const registerFrom = returnTo
          ? `/subscribe?from=${encodeURIComponent(returnTo)}`
          : "/subscribe";
        router.push(`/register?from=${encodeURIComponent(registerFrom)}`);
      } else {
        setError(msg);
        setPending(false);
      }
    }
  }, [priceId, mode, returnTo, router]);

  useEffect(() => {
    if (!autoStart || autoStarted.current || !priceId) return;
    // Deferred so the hand-off to Stripe happens after mount, not inside the effect body.
    const timer = window.setTimeout(() => {
      autoStarted.current = true;
      void startCheckout();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [autoStart, priceId, startCheckout]);

  return (
    <div>
      <button onClick={startCheckout} disabled={pending} className={className || DEFAULT_CLASS}>
        {pending ? "Redirecting to checkout..." : label}
      </button>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
