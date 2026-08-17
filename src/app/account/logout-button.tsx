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
      className="text-[13px] font-medium text-[#6B6255] hover:text-[#A93D25] transition-colors disabled:opacity-50"
    >
      {pending ? "Signing out..." : "Sign out"}
    </button>
  );
}
