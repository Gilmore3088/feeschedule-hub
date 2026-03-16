"use client";

import { createCheckoutSession } from "@/lib/stripe-actions";
import { useState } from "react";

interface SubscribeButtonProps {
  priceId: string;
  mode?: "subscription" | "payment";
  label: string;
  className?: string;
}

export function SubscribeButton({
  priceId,
  mode = "subscription",
  label,
  className,
}: SubscribeButtonProps) {
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);
    try {
      const { url } = await createCheckoutSession(priceId, mode);
      if (url) {
        window.location.href = url;
      }
    } catch {
      setPending(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={pending}
      className={
        className ||
        "w-full rounded-md bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      }
    >
      {pending ? "Redirecting to checkout..." : label}
    </button>
  );
}
