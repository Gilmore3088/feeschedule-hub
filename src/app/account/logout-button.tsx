"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { logoutAction } from "./actions";

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);
    await logoutAction();
    router.push("/login");
  }

  return (
    <button
      onClick={handleClick}
      disabled={pending}
      className="text-[13px] font-medium text-[#7A7062] hover:text-[#C44B2E] transition-colors disabled:opacity-50"
    >
      {pending ? "Signing out..." : "Sign out"}
    </button>
  );
}
