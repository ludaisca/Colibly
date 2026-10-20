import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserAccountIds, getUserChannelAccountIds } from "@/lib/shared-accounts";
import { contactCustomFieldValuesSchema } from "@/lib/validations";
import { publicErrorMessage } from "@/lib/api-errors";

async function getOwnedContact(userId: string, contactId: string) {
  const [accountIds, channelAccountIds] = await Promise.all([getUserAccountIds(userId), getUserChannelAccountIds(userId)]);
  return prisma.contact.findFirst({
    where: { id: contactId, OR: [{ accountId: { in: accountIds } }, { channelAccountId: { in: channelAccountIds } }] },
    select: { id: true, accountId: true, channelAccountId: true },
  });
}

// Devuelve las definiciones de la cuenta del contacto junto con los valores
// ya guardados para ESTE contacto — la UI (ContactDrawer) arma el formulario
// dinámico a partir de esto en una sola llamada en vez de cruzar dos fetch.
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
    const contact = await getOwnedContact(session.user.id, id);
    if (!contact) {
      return NextResponse.json({ error: "Contacto no encontrado" }, { status: 404 });
    }

    const [definitions, values] = await Promise.all([
      prisma.contactCustomFieldDefinition.findMany({
        where: contact.accountId
          ? { waAccountId: contact.accountId }
          : { channelAccountId: contact.channelAccountId! },
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      }),
      prisma.contactCustomFieldValue.findMany({
        where: { contactId: id },
        select: { definitionId: true, value: true },
      }),
    ]);

    return NextResponse.json({
      definitions,
      values: Object.fromEntries(values.map((v) => [v.definitionId, v.value])),
    });
  } catch (error) {
    const message = publicErrorMessage(error, "Error interno del servidor");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Upsert en bloque — value null/"" borra el registro en vez de guardar una
// fila vacía (evita acumular filas ContactCustomFieldValue sin contenido
// real por cada campo que el usuario tocó y dejó en blanco).
export async function PUT(
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
    const parsed = contactCustomFieldValuesSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const definitionIds = Object.keys(parsed.data.values);
    if (definitionIds.length === 0) {
      return NextResponse.json({ success: true });
    }

    // Los ids de definición deben pertenecer a la misma cuenta del contacto
    // — sin esto, un id de otra cuenta (ajena o de otro usuario) colaría un
    // ContactCustomFieldValue huérfano vía FK válida pero fuera de alcance.
    const validDefinitions = await prisma.contactCustomFieldDefinition.findMany({
      where: {
        id: { in: definitionIds },
        ...(contact.accountId ? { waAccountId: contact.accountId } : { channelAccountId: contact.channelAccountId! }),
      },
      select: { id: true },
    });
    const validIds = new Set(validDefinitions.map((d) => d.id));

    await prisma.$transaction(
      definitionIds
        .filter((defId) => validIds.has(defId))
        .map((defId) => {
          const value = parsed.data.values[defId];
          if (value === null || value === "") {
            return prisma.contactCustomFieldValue.deleteMany({
              where: { contactId: id, definitionId: defId },
            });
          }
          return prisma.contactCustomFieldValue.upsert({
            where: { contactId_definitionId: { contactId: id, definitionId: defId } },
            create: { contactId: id, definitionId: defId, value },
            update: { value },
          });
        })
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = publicErrorMessage(error, "Error interno del servidor");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
