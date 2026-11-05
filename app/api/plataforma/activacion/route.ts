import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { getActivationReport, COHORT_DAYS } from "@/lib/activation/report";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// Embudo de activación (pestaña Activación de /plataforma). Solo operadores.
export async function GET(req: Request) {
  const admin = await requirePlatformAdmin();
  if (admin instanceof NextResponse) return admin;

  const { allowed } = await rateLimit(`platform-activacion:${admin.email}`, 30, 60);
  if (!allowed) return NextResponse.json({ error: "Demasiadas solicitudes, espera un minuto" }, { status: 429 });

  const requested = Number(new URL(req.url).searchParams.get("dias"));
  const days = (COHORT_DAYS as readonly number[]).includes(requested) ? requested : 30;
  const report = await getActivationReport(days);
  return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } });
}
