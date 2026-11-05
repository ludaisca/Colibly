import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { acceptInvitationSchema } from "@/lib/validations";
import { findValidAuthToken } from "@/lib/auth-tokens";
import { checkPlanLimit } from "@/lib/billing/gates";
import { BRAND_NAME } from "@/lib/brand";
import { clientIp } from "@/lib/net/client-ip";
import { defaultLicenseFor } from "@/lib/billing/user-license";

const INVALID = "La invitación no es válida o ya venció. Pide a tu administrador que te envíe una nueva.";


// Datos de la invitación para la pantalla de aceptar (público).
export async function GET(req: Request) {
  const { allowed } = await rateLimit(`invitation-view:${clientIp(req)}`, 30, 600);
  if (!allowed) return NextResponse.json({ error: "Demasiados intentos. Espera unos minutos." }, { status: 429 });

  const record = await findValidAuthToken(new URL(req.url).searchParams.get("token"), "INVITE");
  if (!record?.organizationId) return NextResponse.json({ error: INVALID }, { status: 404 });
  const [organization, inviter] = await Promise.all([
    prisma.organization.findUnique({ where: { id: record.organizationId }, select: { name: true, status: true } }),
    record.invitedById ? prisma.user.findUnique({ where: { id: record.invitedById }, select: { name: true } }) : null,
  ]);
  if (!organization || organization.status === "SUSPENDED") return NextResponse.json({ error: INVALID }, { status: 404 });
  return NextResponse.json({ email: record.email, role: record.role, organizationName: organization.name, inviterName: inviter?.name ?? null });
}

// Acepta la invitación: crea el usuario en la organización con el rol
// invitado. El correo queda verificado (el enlace llegó a esa bandeja).
export async function POST(req: Request) {
  try {
    const { allowed } = await rateLimit(`invitation-accept:${clientIp(req)}`, 10, 600);
    if (!allowed) return NextResponse.json({ error: "Demasiados intentos. Espera unos minutos." }, { status: 429 });

    const parsed = acceptInvitationSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

    const record = await findValidAuthToken(parsed.data.token, "INVITE");
    if (!record?.organizationId || !record.role) return NextResponse.json({ error: INVALID }, { status: 400 });
    const organizationId = record.organizationId;
    const role = record.role;
    // La invitación ya ocupa su lugar (cuenta como pendiente): aceptarla no
    // suma. Solo falla si el plan bajó después de invitar.
    const overLimit = await checkPlanLimit(organizationId, "seats", 0);
    if (overLimit) {
      return NextResponse.json({ error: "Tu equipo ya ocupó todos los asientos (ejecutivos) que paga. Pide a tu administrador que agregue un asiento o libere uno.", code: "plan_limit" }, { status: 402 });
    }
    const password = await bcrypt.hash(parsed.data.password, 12);

    // Consumir el token y crear el usuario juntos: si el alta falla (correo
    // ya registrado), el enlace sigue sirviendo después de resolverlo.
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.authToken.updateMany({
        where: { id: record.id, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });
      if (count !== 1) throw new InvitationError(INVALID);
      await tx.user.create({
        data: { name: parsed.data.name, email: record.email, password, role, organizationId, emailVerifiedAt: new Date(), license: record.license ?? (await defaultLicenseFor(organizationId)) },
      });
    });
    return NextResponse.json({ success: true, email: record.email }, { status: 201 });
  } catch (error) {
    if (error instanceof InvitationError) return NextResponse.json({ error: error.message }, { status: 400 });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: `Ese correo ya tiene una cuenta en ${BRAND_NAME}. Inicia sesión con él.` }, { status: 409 });
    }
    console.error("[invitacion]", error);
    return NextResponse.json({ error: "Error interno del servidor." }, { status: 500 });
  }
}

class InvitationError extends Error {}
