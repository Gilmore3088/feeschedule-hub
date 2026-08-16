"use server";

import { revalidatePath, updateTag } from "next/cache";
import { requireAuth } from "@/lib/auth";
import {
  ADMIN_ATLAS_COMMAND_CENTER_CACHE_TAG,
  ADMIN_ATLAS_STATE_LANE_DISPATCH_CACHE_TAG,
} from "@/lib/admin-dashboard-cache";
import { clearSourceSubmissionCountsCache } from "@/lib/admin-queries";

export async function revalidateAdmin() {
  await requireAuth("manage_users");

  revalidatePath("/", "layout");
  revalidatePath("/fees", "layout");
  revalidatePath("/admin", "layout");
  updateTag(ADMIN_ATLAS_COMMAND_CENTER_CACHE_TAG);
  updateTag(ADMIN_ATLAS_STATE_LANE_DISPATCH_CACHE_TAG);
  clearSourceSubmissionCountsCache();

  return { success: true, timestamp: new Date().toISOString() };
}
