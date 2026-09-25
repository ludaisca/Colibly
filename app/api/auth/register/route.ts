import { NextResponse, after } from "next/server";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { registerSchema } from "@/lib/validations";
import { rateLimit } from "@/lib/rate-limit";
import { createOrganizationWithOwner } from "@/lib/organizations";
import { sendVerificationEmail } from "@/lib/auth-emails";
import { sendMetaSignupEvent } from "@/lib/analytics/meta-capi";
import { appUrl } from "@/lib/app-url";

// Registro público (SaaS): cada registro crea un cliente nuevo — su
// organización en prueba gratis y su usuario dueño. Los demás miembros de un
// equipo entran por invitación de su admin, nunca por aquí.
export async function POST(req: Request) {
  try {
    const forwarded = req.headers.get("x-forwarded-for");
    const ip = forwarded?.split(",")[0]?.trim() ?? "unknown";

    // Por IP (ráfagas) y global por hora (un script creando cuentas en masa).
    const [perIp, global] = await Promise.all([rateLimit(`register:${ip}`, 5, 60), rateLimit("register:global", 300, 3600)]);
    if (!perIp.allowed || !global.allowed) {
      return NextResponse.json({ error: "Demasiados intentos. Intenta de nuevo en un minuto." }, { status: 429 });
    }

    const parsed = registerSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const { name, email, password, businessName } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "Este email ya está registrado. Inicia sesión o recupera tu contraseña." }, { status: 409 });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    // Serializable: dos registros simultáneos con el mismo email no deben
    // dejar una organización huérfana (el unique de email aborta uno).
    const { owner } = await prisma.$transaction(
      (tx) => createOrganizationWithOwner(tx, { businessName, name, email, hashedPassword }),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
    after(() => sendVerificationEmail(owner));
    // Solo llega si el visitante aceptó cookies (lo manda la página de registro).
    const analyticsEventId = req.headers.get("x-analytics-event-id");
    if (analyticsEventId && /^[\w-]{8,64}$/.test(analyticsEventId)) {
      after(() => sendMetaSignupEvent(req, { eventId: analyticsEventId, email, sourceUrl: appUrl("/register") }));
    }

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2034" || error.code === "P2002")) {
      return NextResponse.json({ error: "Este email ya está registrado. Inicia sesión o recupera tu contraseña." }, { status: 409 });
    }
    console.error("[register]", error);
    return NextResponse.json({ error: "Error interno del servidor." }, { status: 500 });
  }
}
