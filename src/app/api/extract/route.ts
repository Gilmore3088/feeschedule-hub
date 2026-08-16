import { withApiRoutePolicy } from "@/lib/api-hardening/route-wrapper";
import { NextRequest, NextResponse } from "next/server";
import { extractInstitutionCommand } from "@/lib/institution-commands";

async function handlePOST(req: NextRequest) {
  const { targetId } = await req.json();
  if (!Number.isInteger(targetId) || targetId < 1) {
    return NextResponse.json({ error: "targetId required" }, { status: 400 });
  }

  const result = await extractInstitutionCommand(targetId);
  return NextResponse.json(result, { status: result.success ? 202 : 400 });
}

export const POST = withApiRoutePolicy("api.extract", "POST", handlePOST);
