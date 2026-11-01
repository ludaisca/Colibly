import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserAccountIds, getUserChannelAccountIds } from "@/lib/shared-accounts";
import { forbidRoles } from "@/lib/roles";
import { chatCustomFieldDefinitionUpdateSchema } from "@/lib/validations";
import { publicErrorMessage } from "@/lib/api-errors";

async function ownedDefinition(userId: string, id: string) {
  const [waIds, channelIds] = await Promise.all([getUserAccountIds(userId), getUserChannelAccountIds(userId)]);
  return prisma.chatCustomFieldDefinition.findFirst({
    where: {
      id,
      OR: [
        { waAccountId: { in: waIds } },
        { channelAccountId: { in: channelIds } },
      ],
    },
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const denied = forbidRoles(session, ["ejecutivo"]);
    if (denied) return denied;

    const { id } = await params;
    const existing = await ownedDefinition(session.user.id, id);
    if (!existing) return NextResponse.json({ error: "Atributo no encontrado" }, { status: 404 });

    const parsed = chatCustomFieldDefinitionUpdateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

    const updated = await prisma.chatCustomFieldDefinition.update({
      where: { id },
      data: parsed.data,
    });
    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno del servidor") }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const denied = forbidRoles(session, ["ejecutivo"]);
    if (denied) return denied;

    const { id } = await params;
    const existing = await ownedDefinition(session.user.id, id);
    if (!existing) return NextResponse.json({ error: "Atributo no encontrado" }, { status: 404 });
    await prisma.chatCustomFieldDefinition.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno del servidor") }, { status: 500 });
  }
}
