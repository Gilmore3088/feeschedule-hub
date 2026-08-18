"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { resetPasswordAction } from "./actions";

const REDIRECT_DELAY_MS = 2000;

interface ResetPasswordFormProps {
  token: string;
}

export function ResetPasswordForm({ token }: ResetPasswordFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);

    const formData = new FormData(e.currentTarget);
    const result = await resetPasswordAction(formData);

    if (result.success) {
      setDone(true);
      setTimeout(() => router.push("/login"), REDIRECT_DELAY_MS);
    } else {
      setError(result.error || "Something went wrong. Please try again.");
      setPending(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-6 text-center text-sm text-emerald-700">
        Password updated. Redirecting you to sign in...
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-[#FFFDF9] rounded-lg border border-[#E8DFD1] shadow-sm p-6 space-y-4">
      <input type="hidden" name="token" value={token} />

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-[#1A1815] mb-1">
          New password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="w-full rounded-md border border-[#D5CBBF] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C44B2E] focus:border-transparent"
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-[#C44B2E] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#A83D25] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {pending ? "Updating..." : "Update password"}
      </button>
    </form>
  );
}
