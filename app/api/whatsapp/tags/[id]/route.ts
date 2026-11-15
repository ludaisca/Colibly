import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { forbidRoles } from "@/lib/roles";
import { getUserAccountIds, getUserChannelAccountIds } from "@/lib/shared-accounts";
import { requireOrgId } from "@/lib/tenancy";
import { publicErrorMessage } from "@/lib/api-errors";
import { isTagColor, type TagUsage } from "@/lib/tags-shared";
import { normalize } from "@/lib/automations/match-reply";

// Administrador de etiquetas (Configuración → Etiquetas, QA-018): renombrar,
// cambiar color y eliminar; GET dice qué secuencias y automatizaciones la usan
// como disparador (para avisarlo antes de eliminar). Solo admin. La etiqueta debe ser de una cuenta a
// la que la persona tiene acceso o de su organización (contactos sin canal);
// cualquier otra responde 404.
const updateSchema = z.object({
  name: z.string().trim().min(1, "Escribe el nombre de la etiqueta").max(50).optional(),
  color: z.string().refine(isTagColor, "Color no válido").optional(),
});

async function findOwnTag(userId: string, id: string) {
  const [accountIds, channelAccountIds, organizationId] = await Promise.all([
    getUserAccountIds(userId),
    getUserChannelAccountIds(userId),
    requireOrgId(userId),
  ]);
  return prisma.tag.findFirst({
    where: {
      id,
      OR: [
        { waAccountId: { in: accountIds } },
        { channelAccountId: { in: channelAccountIds } },
        { organizationId, waAccountId: null, channelAccountId: null },
      ],
    },
    select: { id: true, name: true, waAccountId: true, channelAccountId: true },
  });
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const forbidden = forbidRoles(session, ["user", "ejecutivo"]);
    if (forbidden) return forbidden;

    const { id } = await params;
    const tag = await findOwnTag(session.user.id, id);
    if (!tag) return NextResponse.json({ error: "Etiqueta no encontrada" }, { status: 404 });

    // Una etiqueta sin cuenta (contactos sin canal) no dispara nada: las
    // secuencias y automatizaciones cuelgan de una cuenta.
    const account = tag.waAccountId ? { waAccountId: tag.waAccountId } : tag.channelAccountId ? { channelAccountId: tag.channelAccountId } : null;
    if (!account) return NextResponse.json({ sequences: [], automations: [] } satisfies TagUsage);

    const [sequences, automations] = await Promise.all([
      // Secuencias: triggerValue = Tag.id.
      prisma.wASequence.findMany({ where: { ...account, triggerType: "TAG_ADDED", triggerValue: tag.id }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
      // Automatizaciones publicadas: comparan por nombre normalizado (dispatch.ts).
      prisma.automation.findMany({ where: { ...account, triggerType: "tag_added" }, select: { id: true, name: true, triggerConfig: true }, orderBy: { name: "asc" } }),
    ]);
    const target = normalize(tag.name);
    const usage: TagUsage = {
      sequences,
      automations: automations
        .filter((automation) => normalize(String((automation.triggerConfig as { tagName?: unknown } | null)?.tagName ?? "")) === target)
        .map(({ id: automationId, name }) => ({ id: automationId, name })),
    };
    return NextResponse.json(usage);
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno del servidor") }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const forbidden = forbidRoles(session, ["user", "ejecutivo"]);
    if (forbidden) return forbidden;

    const parsed = updateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

    const { id } = await params;
    const tag = await findOwnTag(session.user.id, id);
    if (!tag) return NextResponse.json({ error: "Etiqueta no encontrada" }, { status: 404 });

    try {
      const updated = await prisma.tag.update({
        where: { id: tag.id },
        data: parsed.data,
        select: { id: true, name: true, color: true, waAccountId: true, channelAccountId: true, organizationId: true },
      });
      return NextResponse.json(updated);
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") {
        return NextResponse.json({ error: "Ya hay una etiqueta con ese nombre en esta cuenta" }, { status: 409 });
      }
      throw error;
    }
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno del servidor") }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const forbidden = forbidRoles(session, ["user", "ejecutivo"]);
    if (forbidden) return forbidden;

    const { id } = await params;
    const tag = await findOwnTag(session.user.id, id);
    if (!tag) return NextResponse.json({ error: "Etiqueta no encontrada" }, { status: 404 });

    // ContactTag y ChatTag caen en cascada con la etiqueta.
    await prisma.tag.delete({ where: { id: tag.id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno del servidor") }, { status: 500 });
  }
}
