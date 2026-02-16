"use client";

import { useTransition } from "react";
import { logoutAction } from "./logout-action";

export function LogoutButton() {
  const [pending, startTransition] = useTransition();

  return (
    <button
      onClick={() => startTransition(() => logoutAction())}
      disabled={pending}
      className="text-sm text-gray-500 hover:text-gray-900 disabled:opacity-50"
    >
      {pending ? "..." : "Sign out"}
    </button>
  );
}
