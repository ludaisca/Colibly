import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { getWhatsAppHealth } from "@/lib/platform/support";
import { opsResponse } from "@/lib/platform/http";

export const dynamic = "force-dynamic";

// Panel /plataforma → Soporte: salud de los números de WhatsApp contra Meta.
export async function GET(req: Request) {
  const admin = await requirePlatformAdmin();
  if (admin instanceof NextResponse) return admin;
  const url = new URL(req.url);
  const page = Number.parseInt(url.searchParams.get("page") ?? "1", 10);
  return opsResponse(
    await getWhatsAppHealth({
      organizationId: url.searchParams.get("organizationId") || undefined,
      page: Number.isFinite(page) ? page : 1,
    })
  );
}
