"use server";

import { login } from "@/lib/auth";
import { sanitizeInternalRedirect } from "@/lib/safe-redirect";

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

  const destination = sanitizeInternalRedirect(redirectTo, "/account");

  // Preserve admin bookmarks without allowing an external redirect or sending
  // a non-admin user into the protected operator console.
  if (user.role === "admin" || user.role === "analyst") {
    return {
      success: true,
      redirect: destination.startsWith("/admin") ? destination : "/admin",
    };
  }

  return {
    success: true,
    redirect: destination.startsWith("/admin") ? "/account" : destination,
  };
}
