import { withApiRoutePolicy } from "@/lib/api-hardening/route-wrapper";
import { NextResponse } from "next/server";
import { logout } from "@/lib/auth";

async function handlePOST() {
  await logout();
  return NextResponse.redirect(new URL("/", process.env.BFI_APP_URL || "https://feeinsight.com"));
}

export const POST = withApiRoutePolicy("api.auth.logout", "POST", handlePOST);
