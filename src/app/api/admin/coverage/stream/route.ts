import { getCurrentUser, hasPermission } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user, "trigger_jobs")) {
    return new Response("forbidden", { status: 403 });
  }
  return Response.json(
    { error: "Direct Magellan streams are retired; queue a repair from /admin/magellan" },
    { status: 410 },
  );
}
