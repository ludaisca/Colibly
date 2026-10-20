import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserAccountIds, getUserChannelAccountIds } from "@/lib/shared-accounts";
import { afterContactTagAdded } from "@/lib/contacts/side-effects";
import { tagBelongsTo } from "@/lib/tags";
import { publicErrorMessage } from "@/lib/api-errors";

async function getOwnedContact(userId: string, contactId: string) {
  const [accountIds, channelAccountIds] = await Promise.all([getUserAccountIds(userId), getUserChannelAccountIds(userId)]);
  return prisma.contact.findFirst({
    where: { id: contactId, OR: [{ accountId: { in: accountIds } }, { channelAccountId: { in: channelAccountIds } }] },
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await params;
    const contact = await getOwnedContact(session.user.id, id);
    if (!contact) {
      return NextResponse.json({ error: "Contacto no encontrado" }, { status: 404 });
    }

    const body = await req.json().catch(() => null);
    const tagId = body?.tagId;
    if (!tagId || typeof tagId !== "string") {
      return NextResponse.json({ error: "tagId es requerido" }, { status: 400 });
    }

    const tag = await prisma.tag.findUnique({ where: { id: tagId } });
    // La etiqueta debe ser de la misma cuenta que el contacto.
    if (!tag || !tagBelongsTo(tag, { waAccountId: contact.accountId, channelAccountId: contact.channelAccountId })) {
      return NextResponse.json({ error: "Etiqueta no encontrada" }, { status: 404 });
    }

    const alreadyTagged = await prisma.contactTag.findUnique({
      where: { contactId_tagId: { contactId: id, tagId } },
      select: { tagId: true },
    });
    if (!alreadyTagged) {
      await prisma.contactTag.create({ data: { contactId: id, tagId } });
      // Secuencias + evento de dominio. Solo si la etiqueta es nueva: volver a
      // "agregar" una que ya tenía no es un hecho nuevo que disparar.
      await afterContactTagAdded(id, tag);
    }

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    const message =
      publicErrorMessage(error, "Error interno del servidor");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await params;
    const contact = await getOwnedContact(session.user.id, id);
    if (!contact) {
      return NextResponse.json({ error: "Contacto no encontrado" }, { status: 404 });
    }

    const { searchParams } = new URL(req.url);
    const tagId = searchParams.get("tagId");
    if (!tagId) {
      return NextResponse.json({ error: "tagId es requerido" }, { status: 400 });
    }

    await prisma.contactTag.deleteMany({ where: { contactId: id, tagId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message =
      publicErrorMessage(error, "Error interno del servidor");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
