import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { getPlatformSettings, PLATFORM_SECRET_FIELDS } from "@/lib/platform-settings";
import { rateLimit } from "@/lib/rate-limit";

// Muestra al operador UN secreto de PlatformSettings ya descifrado, a pedido
// (botón "Mostrar" en /plataforma). Decisión del dueño (2026-10-20): el panel
// solo lo usa él y necesita consultar sus llaves a voluntad. El GET de la
// configuración sigue sin devolverlas, así que cargar la página no las expone;
// cada revelado queda en el log (el campo, nunca el valor) y no se cachea.

const schema = z.object({ field: z.enum(PLATFORM_SECRET_FIELDS) });

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

export async function POST(req: Request) {
  const admin = await requirePlatformAdmin();
  if (admin instanceof NextResponse) return admin;

  const { allowed } = await rateLimit(`plataforma-revelar:${admin.email}`, 60, 3600);
  if (!allowed) return NextResponse.json({ error: "Demasiadas consultas, espera un momento" }, { status: 429, headers: NO_STORE });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Campo no válido" }, { status: 400, headers: NO_STORE });

  const value = (await getPlatformSettings())[parsed.data.field];
  if (!value) return NextResponse.json({ error: "Este secreto no está configurado" }, { status: 404, headers: NO_STORE });

  console.log(`[plataforma] ${admin.email} → reveló ${parsed.data.field}`);
  return NextResponse.json({ value }, { headers: NO_STORE });
}
