"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { loginAction } from "./actions";

export function LoginForm({ redirectTo }: { redirectTo: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);

    const formData = new FormData(e.currentTarget);
    const result = await loginAction(formData, redirectTo);

    if (result.success && result.redirect) {
      router.push(result.redirect);
    } else {
      setError(result.error || "Invalid username or password");
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-[#FFFDF9] rounded-lg border border-[#E8DFD1] shadow-sm p-6 space-y-4">
      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="username" className="block text-sm font-medium text-[#1A1815] mb-1">
          Username
        </label>
        <input
          id="username"
          name="username"
          type="text"
          required
          autoComplete="username"
          className="w-full rounded-md border border-[#D5CBBF] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C44B2E] focus:border-transparent"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-[#1A1815] mb-1">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="w-full rounded-md border border-[#D5CBBF] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C44B2E] focus:border-transparent"
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-[#C44B2E] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#A83D25] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {pending ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}
