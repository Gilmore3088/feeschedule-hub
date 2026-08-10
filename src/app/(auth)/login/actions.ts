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

  let user;
  try {
    user = await login(username, password);
  } catch (err) {
    // login() can throw on a server misconfiguration (e.g. BFI_COOKIE_SECRET
    // unset in production) or a DB error. Never let it bubble to the client as
    // an unhandled rejection (which hangs the form); log it and return a clean
    // message so the user sees something and the cause is in the server logs.
    console.error("[login] sign-in failed:", err instanceof Error ? err.message : err);
    return {
      success: false,
      error: "Sign-in is temporarily unavailable. Please try again shortly.",
    };
  }
  if (!user) {
    return { success: false, error: "Invalid email or password" };
  }

  // Route admins/analysts to admin hub, everyone else to their destination
  if (user.role === "admin" || user.role === "analyst") {
    return { success: true, redirect: "/admin" };
  }

  return { success: true, redirect: redirectTo || "/account" };
}
