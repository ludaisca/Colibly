import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserAccountIds, getUserChannelAccountIds } from "@/lib/shared-accounts";
import { contactCustomFieldDefinitionUpdateSchema } from "@/lib/validations";
import { publicErrorMessage } from "@/lib/api-errors";

async function getOwnedDefinition(userId: string, id: string) {
  const [accountIds, channelAccountIds] = await Promise.all([
    getUserAccountIds(userId),
    getUserChannelAccountIds(userId),
  ]);
  return prisma.contactCustomFieldDefinition.findFirst({
    where: {
      id,
      OR: [
        { waAccountId: { in: accountIds } },
        { channelAccountId: { in: channelAccountIds } },
      ],
    },
  });
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
    const existing = await getOwnedDefinition(session.user.id, id);
    if (!existing) {
      return NextResponse.json({ error: "Campo no encontrado" }, { status: 404 });
    }

    const body = await req.json();
    const parsed = contactCustomFieldDefinitionUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const nextType = parsed.data.type ?? existing.type;
    const updated = await prisma.contactCustomFieldDefinition.update({
      where: { id },
      data: {
        ...(parsed.data.label !== undefined ? { label: parsed.data.label } : {}),
        ...(parsed.data.type !== undefined ? { type: parsed.data.type } : {}),
        // Un campo que deja de ser SELECT no debe arrastrar opciones muertas;
        // uno que se vuelve SELECT sin lista explícita queda vacío (se llena
        // después) en vez de fallar la actualización.
        ...(parsed.data.options !== undefined || parsed.data.type !== undefined
          ? { options: nextType === "SELECT" ? (parsed.data.options ?? existing.options) : [] }
          : {}),
        ...(parsed.data.required !== undefined ? { required: parsed.data.required } : {}),
        ...(parsed.data.order !== undefined ? { order: parsed.data.order } : {}),
      },
    });

    return NextResponse.json(updated);
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

    const { id } = await params;
    const existing = await getOwnedDefinition(session.user.id, id);
    if (!existing) {
      return NextResponse.json({ error: "Campo no encontrado" }, { status: 404 });
    }

    // Cascade en ContactCustomFieldValue se encarga de los valores guardados
    // — borrar una definición borra silenciosamente lo capturado con ella,
    // mismo trade-off que borrar un Tag borra sus ContactTag.
    await prisma.contactCustomFieldDefinition.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = publicErrorMessage(error, "Error interno del servidor");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
