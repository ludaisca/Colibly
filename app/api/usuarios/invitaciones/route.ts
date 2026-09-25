import { NextResponse, after } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { invitationSchema } from "@/lib/validations";
import { publicErrorMessage } from "@/lib/api-errors";
import { requireOrgId } from "@/lib/tenancy";
import { issueAuthToken } from "@/lib/auth-tokens";
import { sendInvitationEmail } from "@/lib/auth-emails";

// Invitaciones pendientes de la organización (solo admin).
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id || session.user.role !== "admin") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    const invitations = await prisma.authToken.findMany({
      where: { type: "INVITE", organizationId: await requireOrgId(session.user.id), usedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, email: true, role: true, createdAt: true, expiresAt: true, invitedBy: { select: { name: true, email: true } } },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(invitations);
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno") }, { status: 500 });
  }
}

// Invita (o reinvita: el enlace anterior deja de servir) a un correo a la
// organización con un rol. Un usuario pertenece a una sola organización, así
// que un correo que ya tiene cuenta no se puede invitar.
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id || session.user.role !== "admin") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    const { allowed } = await rateLimit(`invite:${session.user.id}`, 20, 3600);
    if (!allowed) return NextResponse.json({ error: "Enviaste muchas invitaciones. Espera un poco." }, { status: 429 });

    const parsed = invitationSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    const { email, role } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email }, select: { organizationId: true } });
    if (existing) {
      const organizationId = await requireOrgId(session.user.id);
      const message = existing.organizationId === organizationId ? "Esa persona ya es parte de tu equipo." : "Ese correo ya tiene una cuenta en SundayCRM con otra empresa.";
      return NextResponse.json({ error: message }, { status: 409 });
    }

    const inviter = await prisma.user.findUniqueOrThrow({
      where: { id: session.user.id },
      select: { name: true, organization: { select: { id: true, name: true } } },
    });
    const { token, record } = await issueAuthToken({
      type: "INVITE",
      email,
      role,
      organizationId: inviter.organization.id,
      invitedById: session.user.id,
    });
    after(() => sendInvitationEmail({ token, email, role, organizationName: inviter.organization.name, inviterName: inviter.name }));

    return NextResponse.json({ id: record.id, email, role, createdAt: record.createdAt, expiresAt: record.expiresAt }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno") }, { status: 500 });
  }
}
