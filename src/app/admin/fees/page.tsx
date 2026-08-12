import { redirect } from "next/navigation";
import { buildLegacyAdminPath, type AdminSearchParams } from "@/lib/admin-legacy-redirect";

export default async function LegacyFeesPage({
  searchParams,
}: {
  searchParams: Promise<AdminSearchParams>;
}) {
  redirect(buildLegacyAdminPath("/admin/fees/catalog", await searchParams));
}
