import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const secret = process.env.REVALIDATE_SECRET;

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { path?: string } = {};
  try {
    body = await request.json();
  } catch {
    // empty body is fine — revalidate all
  }

  const path = body.path || "/";
  revalidatePath(path, "layout");

  return NextResponse.json({
    revalidated: true,
    path,
    timestamp: new Date().toISOString(),
  });
}
