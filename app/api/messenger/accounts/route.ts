import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { messengerAccountSchema } from "@/lib/validations";
import { rateLimit } from "@/lib/rate-limit";
import { createMetaChannelAccount } from "@/lib/meta-messaging/account-crud";

// Mismo criterio de rol que /api/telegram/accounts: "ejecutivo" tiene
// /messenger/cuentas bloqueado en proxy.ts, este 403 cierra la API directa.
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

    const { allowed } = await rateLimit(`channel-account-create:${session.user.id}`, 10, 60);
    if (!allowed) {
      return NextResponse.json({ error: "Demasiadas solicitudes, espera un momento" }, { status: 429 });
    }

    const body = await req.json();
    const parsed = messengerAccountSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const { account, verifyToken } = await createMetaChannelAccount({
      userId: session.user.id,
      channel: "MESSENGER",
      ...parsed.data,
    });

    // verifyToken solo se guarda hasheado — esta es la única respuesta
    // donde el llamador lo ve en claro, para copiarlo al webhook de Meta.
    return NextResponse.json({ ...account, verifyToken }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno del servidor";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// GET abierto a todos los roles a propósito, igual que /api/telegram/accounts
// — chat-workspace.tsx lo usa para el rail de cuentas del inbox.
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const accounts = await prisma.channelAccount.findMany({
      // Propias + compartidas: editar/eliminar sigue siendo solo del dueño.
      where: { channel: "MESSENGER", OR: [{ userId: session.user.id }, { sharedWith: { some: { userId: session.user.id } } }] },
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
    const message = error instanceof Error ? error.message : "Error interno del servidor";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
