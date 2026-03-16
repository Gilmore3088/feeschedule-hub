"use client";

import { createCheckoutSession } from "@/lib/stripe-actions";
import { useState } from "react";
import { useRouter } from "next/navigation";

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
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setPending(true);
    setError(null);
    try {
      const { url } = await createCheckoutSession(priceId, mode);
      if (url) {
        window.location.href = url;
      } else {
        setError("Could not create checkout. Please try again.");
        setPending(false);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong";
      if (msg.includes("Not authenticated")) {
        router.push("/register?from=/subscribe");
      } else {
        setError(msg);
        setPending(false);
      }
    }
  }

  return (
    <div>
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
      {error && (
        <p className="mt-2 text-xs text-red-600">{error}</p>
      )}
    </div>
  );
}
