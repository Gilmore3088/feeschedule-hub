import { FeeDetailView } from "@/app/admin/review/[id]/page";

export const dynamic = "force-dynamic";

export default async function KnoxFeeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <FeeDetailView feeId={id} />;
}
