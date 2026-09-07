"use client";

import Link from "next/link";
import { useSessionChrome } from "./use-session-chrome";

/**
 * The account corner of the consumer nav.
 *
 * A client island so the nav — and every static page under it — renders without
 * reading the session. Renders the signed-out shape until the session is known, which
 * is the common case and matches the server HTML exactly, so anonymous readers never see
 * a flash.
 */
export function NavAccount() {
  const session = useSessionChrome();

  if (session?.signedIn) {
    return (
      <Link
        href="/account"
        className="flex items-center gap-2 text-[13px] font-medium text-[#7A7062] hover:text-[#1A1815] transition-colors"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#1A1815] text-[10px] font-bold text-white">
          {session.initial ?? "U"}
        </span>
        <span className="hidden lg:inline">Account</span>
      </Link>
    );
  }

  return (
    <>
      <Link
        href="/login"
        className="text-[13px] font-medium text-[#7A7062] hover:text-[#1A1815] transition-colors mr-2"
      >
        Sign in
      </Link>
      <Link
        href="/subscribe"
        className="inline-flex items-center px-3 py-1.5 rounded-md text-[12px] font-semibold bg-[#C44B2E] text-white hover:bg-[#A83A22] transition-colors"
      >
        Get Pro Access
      </Link>
    </>
  );
}
