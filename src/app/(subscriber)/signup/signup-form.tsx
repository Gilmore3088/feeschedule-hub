"use client";

import { useActionState } from "react";
import { signupAction } from "../actions";

export function SignupForm() {
  const [state, action, pending] = useActionState(signupAction, null);

  return (
    <form action={action} className="space-y-4">
      {state?.error && (
        <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.error}
        </div>
      )}

      <div>
        <label htmlFor="orgName" className="block text-sm font-medium text-slate-700">
          Institution Name
        </label>
        <input
          id="orgName"
          name="orgName"
          type="text"
          required
          placeholder="First National Bank"
          className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
        />
      </div>

      <div>
        <label htmlFor="name" className="block text-sm font-medium text-slate-700">
          Your Name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          placeholder="Jane Smith"
          className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
        />
      </div>

      <div>
        <label htmlFor="email" className="block text-sm font-medium text-slate-700">
          Work Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-slate-700">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
        />
        <p className="mt-1 text-xs text-slate-400">At least 8 characters</p>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 disabled:opacity-50"
      >
        {pending ? "Creating account..." : "Create account"}
      </button>

      <p className="text-center text-xs text-slate-400">
        By signing up you agree to our Terms of Service
      </p>
    </form>
  );
}
