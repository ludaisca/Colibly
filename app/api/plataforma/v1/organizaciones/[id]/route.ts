import { NextResponse } from "next/server";
import { requirePlatformToken } from "@/lib/platform/tokens";
import { getOrganization } from "@/lib/platform/ops";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePlatformToken(req, "platform:read");
  if (ctx instanceof NextResponse) return ctx;

  const { id } = await params;
  const org = await getOrganization(id);
  if (!org) return NextResponse.json({ error: { code: "not_found", message: "Organización no encontrada" } }, { status: 404 });
  return NextResponse.json({ ok: true, data: org }, { headers: { "Cache-Control": "no-store" } });
}
