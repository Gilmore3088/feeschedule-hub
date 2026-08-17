"use server";

import { login } from "@/lib/auth";
import { resolvePostLoginRedirect, sanitizeInternalRedirect } from "@/lib/safe-redirect";

export async function loginAction(
  formData: FormData,
  redirectTo: string,
): Promise<{ success: boolean; redirect?: string; error?: string }> {
  const username = formData.get("username") as string;
  const password = formData.get("password") as string;

  if (!username || !password) {
    return { success: false, error: "Email and password are required" };
  }

  const user = await login(username, password);
  if (!user) {
    return { success: false, error: "Invalid email or password" };
  }

  const destination = sanitizeInternalRedirect(redirectTo, "/account");

  return {
    success: true,
    redirect: resolvePostLoginRedirect(destination, user.role),
  };
}
