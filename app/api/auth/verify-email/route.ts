import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { consumeAuthToken, findValidAuthToken } from "@/lib/auth-tokens";
import { invalidateUserSessionCache } from "@/lib/auth";

// Confirma el correo con el enlace recibido. Público: el enlace puede abrirse
// en otro navegador, sin sesión.
export async function POST(req: Request) {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const { allowed } = await rateLimit(`verify-email:${ip}`, 20, 600);
    if (!allowed) return NextResponse.json({ error: "Demasiados intentos. Espera unos minutos." }, { status: 429 });

    const body = (await req.json().catch(() => null)) as { token?: unknown } | null;
    const record = await findValidAuthToken(typeof body?.token === "string" ? body.token : null, "EMAIL_VERIFY");
    if (!record?.userId || !(await consumeAuthToken(record.id))) {
      return NextResponse.json({ error: "El enlace no es válido o ya venció. Pide uno nuevo desde la app." }, { status: 400 });
    }
    // Solo si el correo sigue siendo el mismo al que se envió el enlace.
    const { count } = await prisma.user.updateMany({
      where: { id: record.userId, email: record.email, emailVerifiedAt: null },
      data: { emailVerifiedAt: new Date() },
    });
    invalidateUserSessionCache(record.userId);
    return NextResponse.json({ success: true, alreadyVerified: count === 0 });
  } catch (error) {
    console.error("[verify-email]", error);
    return NextResponse.json({ error: "Error interno del servidor." }, { status: 500 });
  }
}
