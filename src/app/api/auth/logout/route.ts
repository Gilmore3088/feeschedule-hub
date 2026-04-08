import { NextResponse } from "next/server";
import { logout } from "@/lib/auth";

export async function POST() {
  await logout();
  return NextResponse.redirect(new URL("/", process.env.BFI_APP_URL || "https://feeinsight.com"));
}
