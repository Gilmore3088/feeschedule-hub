"use server";

import { login } from "@/lib/auth";

export async function loginAction(
  formData: FormData,
  redirectTo: string,
): Promise<{ success: boolean; redirect?: string; error?: string }> {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { success: false, error: "Email and password are required" };
  }

  const user = await login(email, password);
  if (!user) {
    return { success: false, error: "Invalid email or password" };
  }

  return { success: true, redirect: redirectTo };
}
