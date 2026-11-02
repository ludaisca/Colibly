import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { findUsers } from "@/lib/platform/support";
import { opsResponse } from "@/lib/platform/http";

export const dynamic = "force-dynamic";

// Panel /plataforma → Soporte: buscar usuarios por correo.
export async function GET(req: Request) {
  const admin = await requirePlatformAdmin();
  if (admin instanceof NextResponse) return admin;
  return opsResponse(await findUsers(new URL(req.url).searchParams.get("email") ?? ""));
}
