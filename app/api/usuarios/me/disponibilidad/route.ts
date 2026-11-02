import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { publicErrorMessage } from "@/lib/api-errors";
import { effectiveAvailability } from "@/lib/users/availability";

// Disponibilidad propia (cualquier rol). Vive bajo /api/usuarios para heredar
// la allowlist de solo lectura de proxy.ts: cambiar tu estado no es "escribir"
// datos de la organización.
const schema = z.object({ availability: z.enum(["ONLINE", "BUSY", "OFFLINE"]) });

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { availability: true, lastSeenAt: true } });
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    return NextResponse.json({ availability: user.availability, effective: effectiveAvailability(user, Date.now()) });
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno") }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Estado inválido" }, { status: 400 });
    const now = new Date();
    const user = await prisma.user.update({
      where: { id: session.user.id },
      // Cambiar el estado es actividad: cuenta como latido.
      data: { availability: parsed.data.availability, lastSeenAt: now },
      select: { availability: true, lastSeenAt: true },
    });
    return NextResponse.json({ availability: user.availability, effective: effectiveAvailability(user, now.getTime()) });
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "No se pudo cambiar tu estado") }, { status: 500 });
  }
}
