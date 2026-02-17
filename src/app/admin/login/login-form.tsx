"use client";

import { useActionState } from "react";
import { loginAction } from "./actions";

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, null);

  return (
    <form action={formAction} className="space-y-4">
      {state?.error && (
        <div className="rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 px-3 py-2 text-sm text-red-700 dark:text-red-400">
          {state.error}
        </div>
      )}

      <div>
        <label
          htmlFor="username"
          className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
        >
          Username
        </label>
        <input
          id="username"
          name="username"
          type="text"
          autoComplete="username"
          required
          className="w-full rounded-md border border-gray-300 dark:border-white/[0.12] bg-white dark:bg-[oklch(0.18_0_0)] px-3 py-2 text-sm text-gray-900 dark:text-gray-100
                     focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      <div>
        <label
          htmlFor="password"
          className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
        >
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="w-full rounded-md border border-gray-300 dark:border-white/[0.12] bg-white dark:bg-[oklch(0.18_0_0)] px-3 py-2 text-sm text-gray-900 dark:text-gray-100
                     focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white
                   hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500
                   focus:ring-offset-2 dark:focus:ring-offset-[oklch(0.205_0_0)] disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {pending ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}
