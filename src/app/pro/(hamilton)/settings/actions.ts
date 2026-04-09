"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { sql } from "@/lib/crawler-db/connection";

const ProfileSchema = z.object({
  institution_name: z.string().min(1).max(200).trim(),
  institution_type: z.enum(["bank", "credit_union"]).nullable(),
  asset_tier: z.enum(["a", "b", "c", "d", "e", "f"]).nullable(),
  state_code: z.string().length(2).toUpperCase().nullable(),
  fed_district: z.coerce.number().int().min(1).max(12).nullable(),
});

export type ProfileFormState = {
  success: boolean;
  error?: string;
};

export async function updateInstitutionProfile(
  _prev: ProfileFormState,
  formData: FormData
): Promise<ProfileFormState> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  const raw = {
    institution_name: formData.get("institution_name"),
    institution_type: formData.get("institution_type") || null,
    asset_tier: formData.get("asset_tier") || null,
    state_code: formData.get("state_code") || null,
    fed_district: formData.get("fed_district") || null,
  };

  const parsed = ProfileSchema.safeParse(raw);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return {
      success: false,
      error: firstIssue
        ? `${firstIssue.path.join(".")}: ${firstIssue.message}`
        : "Invalid input",
    };
  }

  const { institution_name, institution_type, asset_tier, state_code, fed_district } =
    parsed.data;

  // Idempotent migration — ensures column exists before write
  try {
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS fed_district INT`;
  } catch {
    // Column may already exist or DB doesn't support IF NOT EXISTS — ignore
  }

  await sql`
    UPDATE users
    SET
      institution_name = ${institution_name},
      institution_type = ${institution_type},
      asset_tier       = ${asset_tier},
      state_code       = ${state_code},
      fed_district     = ${fed_district}
    WHERE id = ${user.id}
  `;

  revalidatePath("/pro");

  return { success: true };
}
