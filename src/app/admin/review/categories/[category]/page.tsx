import { redirect } from "next/navigation";
import { buildLegacyAdminPath, type AdminSearchParams } from "@/lib/admin-legacy-redirect";

export default async function LegacyCategoryReviewDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ category: string }>;
  searchParams: Promise<AdminSearchParams>;
}) {
  const { category } = await params;
  redirect(buildLegacyAdminPath("/admin/knox", await searchParams, {
    queue: "fees",
    category,
  }));
}
