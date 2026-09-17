import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserAccountIds, getUserChannelAccountIds } from "@/lib/shared-accounts";
import { sequenceUpdateSchema } from "@/lib/validations";
import { forbidRoles } from "@/lib/roles";

async function getOwnedSequence(userId: string, sequenceId: string) {
  const [accountIds, channelAccountIds] = await Promise.all([
    getUserAccountIds(userId),
    getUserChannelAccountIds(userId),
  ]);
  return prisma.wASequence.findFirst({
    where: {
      id: sequenceId,
      OR: [{ waAccountId: { in: accountIds } }, { channelAccountId: { in: channelAccountIds } }],
    },
  });
}

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
    const existing = await getOwnedSequence(session.user.id, id);
    if (!existing) {
      return NextResponse.json({ error: "Secuencia no encontrada" }, { status: 404 });
    }

    const sequence = await prisma.wASequence.findUnique({
      where: { id },
      include: { steps: { orderBy: { order: "asc" } } },
    });

    return NextResponse.json(sequence);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno del servidor";
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
    const denied = forbidRoles(session, ["ejecutivo"]);
    if (denied) return denied;

    const { id } = await params;
    const existing = await getOwnedSequence(session.user.id, id);
    if (!existing) {
      return NextResponse.json({ error: "Secuencia no encontrada" }, { status: 404 });
    }

    const body = await req.json();
    const parsed = sequenceUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const { steps, ...data } = parsed.data;

    if (data.triggerType === "TAG_ADDED" && data.triggerValue) {
      const tag = await prisma.tag.findUnique({ where: { id: data.triggerValue } });
      if (!tag) {
        return NextResponse.json({ error: "Etiqueta no encontrada" }, { status: 404 });
      }
    }

    // Reemplazo total de los pasos en vez de un diff — más simple y seguro
    // dado que no tienen identidad propia fuera del orden. Advertencia: si
    // la secuencia tiene inscripciones ACTIVE en curso, cambiar el número/
    // orden de pasos puede corromber lo que su `currentStep` apunta a
    // significar — se recomienda desactivar (`active: false`) antes de
    // editar pasos de una secuencia con inscripciones en curso; no se
    // bloquea la edición para mantener esta primera versión simple.
    const sequence = await prisma.wASequence.update({
      where: { id },
      data: {
        ...data,
        triggerValue: data.triggerType === "APPOINTMENT_COMPLETED" ? null : data.triggerValue,
        ...(steps
          ? {
              steps: {
                deleteMany: {},
                create: steps.map((s, i) => ({ ...s, order: i })),
              },
            }
          : {}),
      },
      include: { steps: { orderBy: { order: "asc" } } },
    });

    return NextResponse.json(sequence);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno del servidor";
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
    const denied = forbidRoles(session, ["ejecutivo"]);
    if (denied) return denied;

    const { id } = await params;
    const existing = await getOwnedSequence(session.user.id, id);
    if (!existing) {
      return NextResponse.json({ error: "Secuencia no encontrada" }, { status: 404 });
    }

    await prisma.wASequence.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno del servidor";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
