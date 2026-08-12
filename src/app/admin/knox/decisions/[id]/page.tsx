import { KnoxDecisionDetailView } from "@/app/admin/agents/knox/reviews/[id]/page";

export const dynamic = "force-dynamic";

export default async function KnoxDecisionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <KnoxDecisionDetailView id={id} />;
}
