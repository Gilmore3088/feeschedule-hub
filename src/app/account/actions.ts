"use server";

import { logout, getCurrentUser } from "@/lib/auth";
import { sql } from "@/lib/data-store/connection";

export async function logoutAction() {
  await logout();
}

export async function updateProfile(formData: FormData): Promise<{
  success: boolean;
  error?: string;
}> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const institutionName = formData.get("institution_name") as string | null;
  const institutionType = formData.get("institution_type") as string | null;
  const assetTier = formData.get("asset_tier") as string | null;
  const stateCode = formData.get("state_code") as string | null;
  const jobRole = formData.get("job_role") as string | null;

  try {
    await sql`
      UPDATE users SET institution_name = ${institutionName?.trim() || null},
       institution_type = ${institutionType || null},
       asset_tier = ${assetTier || null},
       state_code = ${stateCode || null},
       job_role = ${jobRole || null}
       WHERE id = ${user.id}`;
    return { success: true };
  } catch {
    return { success: false, error: "Failed to update profile" };
  }
}
