"use client";

import { useState } from "react";
import { forgotPasswordAction } from "./actions";
import { CONTACT_EMAIL } from "@/lib/constants";

const CONFIRMATION_MESSAGE_SENT = "If that email is on file, a reset link is on its way.";

/**
 * When lead/transactional email isn't configured, `issueReset` still creates
 * the reset token but no email goes out — so the copy must not promise a
 * message that was never sent. Mirrors the Task 2 pattern in
 * for-institutions/report-offer.tsx (emailConfigured prop from the server).
 */
function getConfirmationMessage(emailConfigured: boolean): string {
  if (emailConfigured) return CONFIRMATION_MESSAGE_SENT;
  return (
    "If that email is on file, we'll reset your password — if you don't hear from us " +
    `within a few minutes, email ${CONTACT_EMAIL}.`
  );
}

interface ForgotPasswordFormProps {
  emailConfigured: boolean;
}

export function ForgotPasswordForm({ emailConfigured }: ForgotPasswordFormProps) {
  const [status, setStatus] = useState<"idle" | "loading" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setStatus("loading");

    const formData = new FormData(e.currentTarget);

    try {
      const result = await forgotPasswordAction(formData);
      if (result.success) {
        setStatus("done");
      } else {
        setError(result.error || "Something went wrong. Please try again.");
        setStatus("idle");
      }
    } catch {
      setError("Something went wrong. Please try again.");
      setStatus("idle");
    }
  }

  if (status === "done") {
    return (
      <div className="rounded-lg border border-[#E8DFD1] bg-[#FFFDF9] p-6 text-center text-sm text-[#1A1815]">
        {getConfirmationMessage(emailConfigured)}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-[#FFFDF9] rounded-lg border border-[#E8DFD1] shadow-sm p-6 space-y-4">
      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="email" className="block text-sm font-medium text-[#1A1815] mb-1">
          Work email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          required
          autoComplete="email"
          className="w-full rounded-md border border-[#D5CBBF] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C44B2E] focus:border-transparent"
        />
      </div>

      <button
        type="submit"
        disabled={status === "loading"}
        className="w-full rounded-md bg-[#C44B2E] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#A83D25] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {status === "loading" ? "Sending..." : "Send reset link"}
      </button>
    </form>
  );
}
