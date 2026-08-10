"use server";

import { login } from "@/lib/auth";
import { redirect } from "next/navigation";

export async function loginAction(
  _prev: { error: string } | null,
  formData: FormData
): Promise<{ error: string } | null> {
  const username = formData.get("username") as string;
  const password = formData.get("password") as string;

  if (!username || !password) {
    return { error: "Username and password are required." };
  }

  let user;
  try {
    user = await login(username, password);
  } catch (err) {
    // A thrown login() (e.g. BFI_COOKIE_SECRET unset in production, or a DB
    // error) would otherwise crash into the error boundary. Log it and return
    // a message so the admin sees a recoverable error, not a 500.
    console.error("[admin login] sign-in failed:", err instanceof Error ? err.message : err);
    return { error: "Sign-in is temporarily unavailable. Please try again shortly." };
  }
  if (!user) {
    return { error: "Invalid username or password." };
  }

  // redirect() throws NEXT_REDIRECT by design — keep it OUTSIDE the try/catch
  // above so it is not swallowed.
  redirect("/admin");
}
