import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { publicErrorMessage } from "@/lib/api-errors";

// Compartir una ChannelAccount (Telegram, Messenger, Instagram, Web) con otro
// usuario — mismo contrato que /api/whatsapp/accounts/[id]/share: solo un
// admin, y solo sobre cuentas propias. El usuario con acceso ve y atiende los
// chats/contactos de la cuenta dentro de lo que su rol ya permite; no puede
// editarla ni eliminarla.

async function getOwnedAccount(accountId: string, userId: string) {
  return prisma.channelAccount.findFirst({ where: { id: accountId, userId }, select: { id: true, userId: true } });
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id || session.user.role !== "admin") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    const { id } = await params;
    if (!(await getOwnedAccount(id, session.user.id))) {
      return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
    }
    const shares = await prisma.channelAccountShare.findMany({
      where: { channelAccountId: id },
      select: { user: { select: { id: true, name: true, email: true, role: true } } },
    });
    return NextResponse.json(shares.map((s) => s.user));
  } catch (error) {
    const message = publicErrorMessage(error, "Error interno");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id || session.user.role !== "admin") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    const { allowed } = await rateLimit(`account-share:${session.user.id}`, 20, 60);
    if (!allowed) {
      return NextResponse.json({ error: "Demasiadas solicitudes, espera un momento" }, { status: 429 });
    }

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const userId = typeof body?.userId === "string" ? body.userId : null;
    if (!userId) {
      return NextResponse.json({ error: "userId requerido" }, { status: 400 });
    }

    const account = await getOwnedAccount(id, session.user.id);
    if (!account) {
      return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
    }
    if (userId === account.userId) {
      return NextResponse.json({ error: "El dueño ya tiene acceso a la cuenta" }, { status: 400 });
    }
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, disabledAt: true } });
    if (!user || user.disabledAt) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    await prisma.channelAccountShare.upsert({
      where: { channelAccountId_userId: { channelAccountId: id, userId } },
      create: { channelAccountId: id, userId },
      update: {},
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = publicErrorMessage(error, "Error interno");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id || session.user.role !== "admin") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    const { allowed } = await rateLimit(`account-share:${session.user.id}`, 20, 60);
    if (!allowed) {
      return NextResponse.json({ error: "Demasiadas solicitudes, espera un momento" }, { status: 429 });
    }

    const { id } = await params;
    const userId = new URL(req.url).searchParams.get("userId");
    if (!userId) {
      return NextResponse.json({ error: "userId requerido" }, { status: 400 });
    }
    await prisma.channelAccountShare.deleteMany({
      where: { channelAccountId: id, userId, channelAccount: { userId: session.user.id } },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = publicErrorMessage(error, "Error interno");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
