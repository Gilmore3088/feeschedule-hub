"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth";

export async function revalidateAdmin() {
  await requireAuth("manage_users");

  revalidatePath("/", "layout");
  revalidatePath("/fees", "layout");
  revalidatePath("/admin", "layout");

  return { success: true, timestamp: new Date().toISOString() };
}
