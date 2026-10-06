import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserAccountIds, getUserChannelAccountIds } from "@/lib/shared-accounts";
import { contactUpdateSchema } from "@/lib/validations";
import { publicErrorMessage } from "@/lib/api-errors";
import { forbidRoles } from "@/lib/roles";
import { rateLimit } from "@/lib/rate-limit";
import { deleteContactData } from "@/lib/contacts/delete";

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
        personId: true,
        optedOutMarketing: true,
        optedOutAt: true,
        createdAt: true,
        updatedAt: true,
        tags: { select: { tag: { select: { id: true, name: true, color: true } } } },
        chat: { select: { id: true } },
        // Negocios abiertos de la persona (el viejo "estado del lead").
        person: { select: { deals: { where: { status: "OPEN", archivedAt: null }, orderBy: { stageEnteredAt: "desc" }, take: 5, select: { id: true, title: true, amount: true, ownerId: true, stage: { select: { id: true, name: true, color: true } }, pipeline: { select: { id: true, name: true } } } } } },
      },
    });

    if (!contact) {
      return NextResponse.json({ error: "Contacto no encontrado" }, { status: 404 });
    }

    const { person, ...rest } = contact;
    return NextResponse.json({ ...rest, deals: person.deals.map((d) => ({ ...d, amount: Number(d.amount) })) });
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

    const body = await req.json();
    const parsed = contactUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const updated = await prisma.contact.update({
      where: { id },
      data: parsed.data,
      select: {
        id: true,
        accountId: true,
        remoteJid: true,
        name: true,
        updatedAt: true,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    const message =
      publicErrorMessage(error, "Error interno del servidor");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Borrado definitivo del contacto y de toda su conversación (derecho de
// cancelación de datos personales). Solo admin: `user` y `ejecutivo` pueden
// trabajar el contacto pero no destruirlo. Irreversible, por eso el cliente
// debe confirmar antes de llamar.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    const denied = forbidRoles(session, ["user", "ejecutivo"]);
    if (denied) return denied;

    const limit = await rateLimit(`contact-delete:${session.user.id}`, 30, 60);
    if (!limit.allowed) {
      return NextResponse.json({ error: "Demasiadas solicitudes. Intenta de nuevo en un momento." }, { status: 429 });
    }

    const { id } = await params;
    const [accountIds, channelAccountIds] = await Promise.all([
      getUserAccountIds(session.user.id),
      getUserChannelAccountIds(session.user.id),
    ]);
    const existing = await prisma.contact.findFirst({
      where: { id, OR: [{ accountId: { in: accountIds } }, { channelAccountId: { in: channelAccountIds } }] },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Contacto no encontrado" }, { status: 404 });
    }

    const result = await deleteContactData(existing.id);
    console.log(`[contactos] ${session.user.email} → eliminó el contacto ${existing.id} (${result?.messages ?? 0} mensajes)`);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = publicErrorMessage(error, "Error interno del servidor");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
