import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserAccountIds, getUserChannelAccountIds } from "@/lib/shared-accounts";
import { contactUpdateSchema } from "@/lib/validations";
import { afterLeadStatusChanged } from "@/lib/contacts/side-effects";
import { publicErrorMessage } from "@/lib/api-errors";

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
    const [accountIds, channelAccountIds] = await Promise.all([
      getUserAccountIds(session.user.id),
      getUserChannelAccountIds(session.user.id),
    ]);

    const contact = await prisma.contact.findFirst({
      where: { id, OR: [{ accountId: { in: accountIds } }, { channelAccountId: { in: channelAccountIds } }] },
      select: {
        id: true,
        accountId: true,
        remoteJid: true,
        name: true,
        leadStatus: true,
        optedOutMarketing: true,
        optedOutAt: true,
        overLimit: true,
        createdAt: true,
        updatedAt: true,
        tags: { select: { tag: { select: { id: true, name: true, color: true } } } },
        chat: { select: { id: true } },
      },
    });

    if (!contact) {
      return NextResponse.json({ error: "Contacto no encontrado" }, { status: 404 });
    }

    return NextResponse.json(contact);
  } catch (error) {
    const message =
      publicErrorMessage(error, "Error interno del servidor");
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

    const { id } = await params;
    const [accountIds, channelAccountIds] = await Promise.all([
      getUserAccountIds(session.user.id),
      getUserChannelAccountIds(session.user.id),
    ]);

    const existing = await prisma.contact.findFirst({
      where: { id, OR: [{ accountId: { in: accountIds } }, { channelAccountId: { in: channelAccountIds } }] },
    });
    if (!existing) {
      return NextResponse.json({ error: "Contacto no encontrado" }, { status: 404 });
    }

    const body = await req.json().catch(() => null);
    const parsed = contactUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const updated = await prisma.contact.update({
      where: { id },
      // Un nombre puesto a mano ya no lo pisan la libreta ni el perfil de WhatsApp.
      data: { ...parsed.data, ...(parsed.data.name !== undefined ? { nameSource: "user" } : {}) },
      select: {
        id: true,
        accountId: true,
        remoteJid: true,
        name: true,
        leadStatus: true,
        updatedAt: true,
      },
    });

    // Meta Ads (CAPI), secuencias y evento de dominio — compartido con la API
    // pública y las automatizaciones.
    if (parsed.data.leadStatus) {
      await afterLeadStatusChanged(existing, existing.leadStatus, parsed.data.leadStatus);
    }

    return NextResponse.json(updated);
  } catch (error) {
    const message =
      publicErrorMessage(error, "Error interno del servidor");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
