"use client";

import { useTransition } from "react";
import { logoutAction } from "./logout-action";

export function LogoutButton() {
  const [pending, startTransition] = useTransition();

  return (
    <button
      onClick={() => startTransition(() => logoutAction())}
      disabled={pending}
      aria-label="Sign out"
      className="inline-flex items-center justify-center min-h-11 min-w-11 px-2.5 rounded-md text-sm text-gray-500 hover:text-gray-900 hover:bg-gray-100 dark:hover:bg-white/[0.06] disabled:opacity-50 transition-colors"
    >
      {pending ? "..." : "Sign out"}
    </button>
  );
}
