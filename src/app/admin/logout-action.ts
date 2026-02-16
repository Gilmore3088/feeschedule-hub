"use server";

import { logout } from "@/lib/auth";
import { redirect } from "next/navigation";

export async function logoutAction(): Promise<void> {
  await logout();
  redirect("/admin/login");
}
