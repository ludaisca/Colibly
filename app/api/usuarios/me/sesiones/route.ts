import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { auth, invalidateUserSessionCache } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { publicErrorMessage } from "@/lib/api-errors";
import { createSessionNonce } from "@/lib/session-nonce";

// "Cerrar las demás sesiones": sube sessionVersion (las demás caen en la
// siguiente revalidación, ≤ 60 s) y devuelve un nonce de un solo uso para que
// ESTA sesión adopte la versión nueva con `update({ sessionNonce })`.
const schema = z.object({ password: z.string().min(1).max(200) });

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const userId = session.user.id;
    if (!(await rateLimit(`close-sessions:${userId}`, 5, 300)).allowed) {
      return NextResponse.json({ error: "Demasiados intentos; espera unos minutos" }, { status: 429 });
    }
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Escribe tu contraseña" }, { status: 400 });
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { password: true } });
    if (!user?.password || !(await bcrypt.compare(parsed.data.password, user.password))) {
      return NextResponse.json({ error: "Contraseña incorrecta" }, { status: 400 });
    }
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { sessionVersion: { increment: 1 } },
      select: { sessionVersion: true },
    });
    invalidateUserSessionCache(userId);
    const sessionNonce = await createSessionNonce(userId, updated.sessionVersion);
    return NextResponse.json({ sessionNonce }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "No se pudieron cerrar las sesiones") }, { status: 500 });
  }
}
