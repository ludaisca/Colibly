import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { backupFreshness } from "@/lib/backups/freshness";

export const dynamic = "force-dynamic";

// Para el monitor externo (UptimeRobot, Better Stack…): 200 solo si el último
// respaldo correcto tiene menos de 36 h. Es el "interruptor del hombre muerto"
// de los respaldos — si dejan de correr sin que nadie lo note, el monitor avisa.
// Va APARTE de /api/health a propósito: ese es el healthcheck del contenedor y un
// respaldo atrasado no debe hacer que Coolify lo dé por caído. Público, pero no
// revela fechas ni tamaños: solo el estado.
export async function GET() {
  try {
    const [settings, last] = await Promise.all([
      prisma.platformSettings.findUnique({ where: { id: "platform" }, select: { backupEnabled: true } }),
      prisma.platformBackupRun.findFirst({ where: { status: "SUCCESS" }, orderBy: { finishedAt: "desc" }, select: { finishedAt: true } }),
    ]);
    const status = backupFreshness({ enabled: settings?.backupEnabled ?? false, lastSuccessAt: last?.finishedAt ?? null, now: new Date() });
    return NextResponse.json({ respaldos: status }, { status: status === "ok" ? 200 : 503, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ respaldos: "error" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
