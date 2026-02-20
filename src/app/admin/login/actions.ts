"use server";

import { login } from "@/lib/auth";
import { redirect } from "next/navigation";

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

const loginAttempts = new Map<string, { count: number; resetAt: number }>();

function isLoginRateLimited(username: string): boolean {
  const now = Date.now();
  const key = username.toLowerCase();
  const entry = loginAttempts.get(key);

  if (!entry || now > entry.resetAt) {
    loginAttempts.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  entry.count++;
  return entry.count > MAX_ATTEMPTS;
}

export async function loginAction(
  _prev: { error: string } | null,
  formData: FormData
): Promise<{ error: string } | null> {
  const username = formData.get("username") as string;
  const password = formData.get("password") as string;

  if (!username || !password) {
    return { error: "Username and password are required." };
  }

  if (isLoginRateLimited(username)) {
    return { error: "Too many login attempts. Please try again in 15 minutes." };
  }

  const user = await login(username, password);
  if (!user) {
    return { error: "Invalid username or password." };
  }

  redirect("/admin");
}
