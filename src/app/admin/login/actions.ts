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

  const user = await login(username, password);
  if (!user) {
    return { error: "Invalid username or password." };
  }

  redirect("/admin");
}
