"use server";

import { issueReset } from "@/lib/password-reset";

export async function forgotPasswordAction(
  formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  const email = formData.get("email");

  if (typeof email !== "string" || !email.trim()) {
    return { success: false, error: "Email is required" };
  }

  // Always resolves regardless of whether the email matches an account —
  // the caller shows the same confirmation copy either way.
  await issueReset(email);

  return { success: true };
}
