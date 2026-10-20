import { NextResponse } from "next/server";
import { checkWebchatAccess } from "@/lib/billing/gates";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { webchatAccountSchema } from "@/lib/validations";
import { encrypt } from "@/lib/crypto";
import { rateLimit } from "@/lib/rate-limit";
import { publicErrorMessage } from "@/lib/api-errors";
import { requireOrgId } from "@/lib/tenancy";
import { getUserChannelAccountIds } from "@/lib/shared-accounts";
import { requireVerifiedEmail } from "@/lib/auth-emails";
import { assertChannelEnabled } from "@/lib/channel-flags";

// Mismo criterio de rol que Telegram/Messenger/Instagram — "ejecutivo" tiene
// /webchat/cuentas bloqueado en proxy.ts, este 403 cierra el acceso directo
// a la API (defensa en profundidad).
function isForbiddenRole(role: string | undefined): boolean {
  return role === "ejecutivo";
}

const ACCOUNT_SELECT = {
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
} as const;

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
    const channelDisabled = await assertChannelEnabled(organizationId, "WEBCHAT");
    if (channelDisabled) return channelDisabled;
    const notInPlan = await checkWebchatAccess(organizationId);
    if (notInPlan) return notInPlan;

    const { allowed } = await rateLimit(`channel-account-create:${session.user.id}`, 10, 60);
    if (!allowed) {
      return NextResponse.json({ error: "Demasiadas solicitudes, espera un momento" }, { status: 429 });
    }

    const body = await req.json().catch(() => null);
    const parsed = webchatAccountSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const { name, allowedOrigins } = parsed.data;

    // A diferencia de Telegram/Messenger, no hay proveedor externo que
    // validar ni webhook que registrar — "nosotros somos el proveedor", así
    // que la cuenta queda CONNECTED de inmediato.
    const account = await prisma.channelAccount.create({
      data: {
        userId: session.user.id,
        organizationId,
        channel: "WEBCHAT",
        name,
        credentials: encrypt(JSON.stringify({ allowedOrigins })),
        status: "CONNECTED",
        lastActivity: new Date(),
      },
      select: ACCOUNT_SELECT,
    });

    return NextResponse.json(account, { status: 201 });
  } catch (error) {
    const message = publicErrorMessage(error, "Error interno del servidor");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// GET abierto a todos los roles (igual que /api/telegram/accounts) — el
// rail de cuentas del inbox lo necesita para "ejecutivo" también.
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const accounts = await prisma.channelAccount.findMany({
      // Propias + compartidas: editar/eliminar sigue siendo solo del dueño.
      where: { channel: "WEBCHAT", id: { in: await getUserChannelAccountIds(session.user.id) } },
      select: ACCOUNT_SELECT,
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json(accounts);
  } catch (error) {
    const message = publicErrorMessage(error, "Error interno del servidor");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
