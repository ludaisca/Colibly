import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { encrypt } from "@/lib/crypto";
import { getWebchatCredentials } from "@/lib/webchat/account";
import { webchatAccountSchema } from "@/lib/validations";
import { publicErrorMessage } from "@/lib/api-errors";
import { accountManageWhere } from "@/lib/tenancy";
import { invalidateAccountScopes } from "@/lib/shared-accounts";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await params;
    const account = await prisma.channelAccount.findFirst({
      where: { id, ...(await accountManageWhere(session.user.id)), channel: "WEBCHAT" },
      select: { id: true, name: true, status: true, credentials: true, createdAt: true, _count: { select: { conversations: true } } },
    });
    if (!account) {
      return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
    }

    const { allowedOrigins } = getWebchatCredentials(account);
    return NextResponse.json({
      id: account.id,
      name: account.name,
      status: account.status,
      allowedOrigins,
      createdAt: account.createdAt,
      conversationCount: account._count.conversations,
    });
  } catch (error) {
    const message = publicErrorMessage(error, "Error interno del servidor");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    if (session.user.role === "ejecutivo") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const { allowed } = await rateLimit(`channel-account-mutate:${session.user.id}`, 20, 60);
    if (!allowed) {
      return NextResponse.json({ error: "Demasiadas solicitudes, espera un momento" }, { status: 429 });
    }

    const { id } = await params;
    const existing = await prisma.channelAccount.findFirst({ where: { id, ...(await accountManageWhere(session.user.id)), channel: "WEBCHAT" } });
    if (!existing) {
      return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
    }

    const body = await req.json().catch(() => null);
    const parsed = webchatAccountSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const account = await prisma.channelAccount.update({
      where: { id },
      data: {
        name: parsed.data.name,
        credentials: encrypt(JSON.stringify({ allowedOrigins: parsed.data.allowedOrigins })),
      },
      select: { id: true, name: true, status: true },
    });

    return NextResponse.json(account);
  } catch (error) {
    const message = publicErrorMessage(error, "Error interno del servidor");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    if (session.user.role === "ejecutivo") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const { allowed } = await rateLimit(`channel-account-mutate:${session.user.id}`, 20, 60);
    if (!allowed) {
      return NextResponse.json({ error: "Demasiadas solicitudes, espera un momento" }, { status: 429 });
    }

    const { id } = await params;
    const existing = await prisma.channelAccount.findFirst({ where: { id, ...(await accountManageWhere(session.user.id)), channel: "WEBCHAT" } });
    if (!existing) {
      return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
    }

    // A diferencia de Telegram/Messenger, no hay ningún webhook externo que
    // desregistrar — el widget simplemente empezará a recibir 404 en
    // /session la próxima vez que un visitante lo cargue.
    await prisma.channelAccount.delete({ where: { id } });
    invalidateAccountScopes();

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = publicErrorMessage(error, "Error interno del servidor");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
