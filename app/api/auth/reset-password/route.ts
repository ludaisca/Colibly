import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { resetPasswordSchema } from "@/lib/validations";
import { consumeAuthToken, findValidAuthToken } from "@/lib/auth-tokens";
import { invalidateUserSessionCache } from "@/lib/auth";
import { clientIp } from "@/lib/net/client-ip";

// Fija una contraseña nueva con el enlace del correo. Cierra todas las
// sesiones abiertas (sessionVersion + 1) — si alguien más tenía acceso, lo
// pierde — y, como abrir el enlace prueba el correo, lo da por verificado.
export async function POST(req: Request) {
  try {
    const ip = clientIp(req);
    const { allowed } = await rateLimit(`reset-password:${ip}`, 10, 900);
    if (!allowed) return NextResponse.json({ error: "Demasiados intentos. Espera unos minutos." }, { status: 429 });

    const parsed = resetPasswordSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

    const record = await findValidAuthToken(parsed.data.token, "PASSWORD_RESET");
    if (!record?.userId) {
      return NextResponse.json({ error: "El enlace no es válido o ya venció. Pide uno nuevo." }, { status: 400 });
    }
    const user = await prisma.user.findUnique({ where: { id: record.userId }, select: { id: true, email: true, emailVerifiedAt: true } });
    if (!user || user.email !== record.email || !(await consumeAuthToken(record.id))) {
      return NextResponse.json({ error: "El enlace no es válido o ya venció. Pide uno nuevo." }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: await bcrypt.hash(parsed.data.password, 12),
        sessionVersion: { increment: 1 },
        emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
      },
    });
    invalidateUserSessionCache(user.id);
    return NextResponse.json({ success: true, email: user.email });
  } catch (error) {
    console.error("[reset-password]", error);
    return NextResponse.json({ error: "Error interno del servidor." }, { status: 500 });
  }
}
