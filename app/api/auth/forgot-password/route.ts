import { NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { forgotPasswordSchema } from "@/lib/validations";
import { sendPasswordResetEmail } from "@/lib/auth-emails";
import { clientIp } from "@/lib/net/client-ip";

// Pide un enlace para restablecer la contraseña. Responde lo mismo exista o no
// el correo, y el envío corre después de responder (after): ni el cuerpo ni el
// tiempo de respuesta revelan qué correos tienen cuenta.
export async function POST(req: Request) {
  try {
    const ip = clientIp(req);
    const parsed = forgotPasswordSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    const { email } = parsed.data;

    const [perIp, perEmail] = await Promise.all([
      rateLimit(`forgot-password:${ip}`, 5, 900),
      rateLimit(`forgot-password:${email}`, 3, 3600),
    ]);
    if (!perIp.allowed) return NextResponse.json({ error: "Demasiados intentos. Espera unos minutos." }, { status: 429 });

    if (perEmail.allowed) {
      after(async () => {
        const user = await prisma.user.findUnique({
          where: { email },
          select: { id: true, email: true, name: true, disabledAt: true, organization: { select: { status: true } } },
        });
        if (!user || user.disabledAt || user.organization.status === "SUSPENDED") return;
        await sendPasswordResetEmail(user);
      });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[forgot-password]", error);
    return NextResponse.json({ error: "Error interno del servidor." }, { status: 500 });
  }
}
