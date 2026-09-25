import { NextResponse, after } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { sendVerificationEmail } from "@/lib/auth-emails";

// Reenvía el enlace de verificación al correo del usuario en sesión.
export async function POST() {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { allowed } = await rateLimit(`verify-email-resend:${session.user.id}`, 3, 600);
    if (!allowed) return NextResponse.json({ error: "Ya enviamos varios correos. Espera unos minutos y revisa spam." }, { status: 429 });

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, email: true, name: true, emailVerifiedAt: true },
    });
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (user.emailVerifiedAt) return NextResponse.json({ error: "Tu correo ya está confirmado." }, { status: 400 });

    after(() => sendVerificationEmail(user));
    return NextResponse.json({ success: true, email: user.email });
  } catch (error) {
    console.error("[verify-email/resend]", error);
    return NextResponse.json({ error: "Error interno del servidor." }, { status: 500 });
  }
}
