import { NextResponse } from "next/server";
import { requirePlatformToken } from "@/lib/platform/tokens";
import { findUsers } from "@/lib/platform/support";
import { opsResponse } from "@/lib/platform/http";

export const dynamic = "force-dynamic";

// GET ?email= — busca usuarios por correo (exacto o parcial).
export async function GET(req: Request) {
  const ctx = await requirePlatformToken(req, "platform:read");
  if (ctx instanceof NextResponse) return ctx;
  return opsResponse(await findUsers(new URL(req.url).searchParams.get("email") ?? ""));
}
