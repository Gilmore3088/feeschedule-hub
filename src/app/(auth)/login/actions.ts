"use server";

import { login, getCurrentUser } from "@/lib/auth";

export async function loginAction(
  formData: FormData,
  redirectTo: string,
): Promise<{ success: boolean; redirect?: string; error?: string }> {
  const username = formData.get("username") as string;
  const password = formData.get("password") as string;

  if (!username || !password) {
    return { success: false, error: "Username and password are required" };
  }

  const user = await login(username, password);
  if (!user) {
    return { success: false, error: "Invalid email or password" };
  }

  // Route admins/analysts to admin hub, everyone else to their destination
  if (user.role === "admin" || user.role === "analyst") {
    return { success: true, redirect: "/admin" };
  }

  return { success: true, redirect: redirectTo || "/account" };
}
