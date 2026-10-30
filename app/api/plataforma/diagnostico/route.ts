import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { getPlatformDiagnostics } from "@/lib/platform/diagnostics";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// Doctor interno: solo operadores con sesión. No hay variante pública.
export async function GET(req: Request) {
  const admin = await requirePlatformAdmin();
  if (admin instanceof NextResponse) return admin;

  const { allowed } = await rateLimit(`platform-diagnostico:${admin.email}`, 30, 60);
  if (!allowed) return NextResponse.json({ error: "Demasiadas solicitudes, espera un minuto" }, { status: 429 });

  const live = new URL(req.url).searchParams.get("live") === "1";
  const report = await getPlatformDiagnostics({ live });
  return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } });
}
