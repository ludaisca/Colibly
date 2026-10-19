import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { instagramAccountSchema } from "@/lib/validations";
import { rateLimit } from "@/lib/rate-limit";
import { createMetaChannelAccount } from "@/lib/meta-messaging/account-crud";
import { publicErrorMessage } from "@/lib/api-errors";
import { getUserChannelAccountIds } from "@/lib/shared-accounts";
import { requireVerifiedEmail } from "@/lib/auth-emails";
import { checkPlanLimit } from "@/lib/billing/gates";
import { requireOrgId } from "@/lib/tenancy";
import { assertChannelEnabled } from "@/lib/channel-flags";

function isForbiddenRole(role: string | undefined): boolean {
  return role === "ejecutivo";
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    if (isForbiddenRole(session.user.role)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const unverified = await requireVerifiedEmail(session.user.id);
    if (unverified) return unverified;
    const organizationId = await requireOrgId(session.user.id);
    const channelDisabled = await assertChannelEnabled(organizationId, "INSTAGRAM");
    if (channelDisabled) return channelDisabled;
    const overLimit = await checkPlanLimit(organizationId, "instagram");
    if (overLimit) return overLimit;

    const { allowed } = await rateLimit(`channel-account-create:${session.user.id}`, 10, 60);
    if (!allowed) {
      return NextResponse.json({ error: "Demasiadas solicitudes, espera un momento" }, { status: 429 });
    }

    const body = await req.json();
    const parsed = instagramAccountSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const { account, verifyToken } = await createMetaChannelAccount({
      userId: session.user.id,
      channel: "INSTAGRAM",
      ...parsed.data,
    });

    return NextResponse.json({ ...account, verifyToken }, { status: 201 });
  } catch (error) {
    const message = publicErrorMessage(error, "Error interno del servidor");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const accounts = await prisma.channelAccount.findMany({
      // Propias + compartidas: editar/eliminar sigue siendo solo del dueño.
      where: { channel: "INSTAGRAM", id: { in: await getUserChannelAccountIds(session.user.id) } },
      select: {
        id: true,
        userId: true,
        name: true,
        channel: true,
        status: true,
        errorMessage: true,
        lastActivity: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { conversations: true } },
      },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json(accounts);
  } catch (error) {
    const message = publicErrorMessage(error, "Error interno del servidor");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
