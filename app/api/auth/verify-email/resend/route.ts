import { NextResponse, after } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { sendVerificationEmail } from "@/lib/auth-emails";
import { clientIp } from "@/lib/net/client-ip";

// Reenvía el enlace de verificación. Dos caminos:
//   - con sesión: al correo del usuario en sesión (comportamiento original).
//   - sin sesión: recibe { email } desde el login cuando la cuenta todavía no
//     está confirmada. Responde siempre lo mismo para no revelar si existe.
const GENERIC = "Si la cuenta existe y no está verificada, te enviamos un enlace.";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (session?.user?.id) {
      const { allowed } = await rateLimit(`verify-email-resend:${session.user.id}`, 3, 600);
      if (!allowed) {
        return NextResponse.json({ error: "Ya enviamos varios correos. Espera unos minutos y revisa spam." }, { status: 429 });
      }

      const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { id: true, email: true, name: true, emailVerifiedAt: true },
      });
      if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
      if (user.emailVerifiedAt) return NextResponse.json({ error: "Tu correo ya está confirmado." }, { status: 400 });

      after(() => sendVerificationEmail(user));
      return NextResponse.json({ success: true, email: user.email });
    }

    const body = (await req.json().catch(() => null)) as { email?: unknown } | null;
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!email) return NextResponse.json({ error: "Falta el correo." }, { status: 400 });

    const ip = clientIp(req);
    const [ipLimit, emailLimit] = await Promise.all([
      rateLimit(`verify-email-resend-ip:${ip}`, 10, 3600),
      rateLimit(`verify-email-resend-email:${email}`, 3, 600),
    ]);
    if (!ipLimit.allowed || !emailLimit.allowed) {
      return NextResponse.json({ error: "Demasiados intentos. Espera unos minutos." }, { status: 429 });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true, emailVerifiedAt: true, disabledAt: true },
    });
    if (user && !user.emailVerifiedAt && !user.disabledAt) {
      after(() => sendVerificationEmail(user));
    }
    return NextResponse.json({ success: true, message: GENERIC });
  } catch (error) {
    console.error("[verify-email/resend]", error);
    return NextResponse.json({ error: "Error interno del servidor." }, { status: 500 });
  }
}
