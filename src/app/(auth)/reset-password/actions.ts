"use server";

import { consumeReset } from "@/lib/password-reset";

const MIN_PASSWORD_LENGTH = 8;

export async function resetPasswordAction(
  formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  const token = formData.get("token");
  const password = formData.get("password");

  if (typeof token !== "string" || !token.trim()) {
    return { success: false, error: "This reset link is invalid or has already been used." };
  }
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    return { success: false, error: "Password must be at least 8 characters" };
  }

  const result = await consumeReset(token.trim(), password);

  if (result === "invalid") {
    return { success: false, error: "This reset link is invalid or has already been used." };
  }
  if (result === "expired") {
    return { success: false, error: "This reset link has expired. Request a new one." };
  }

  return { success: true };
}
