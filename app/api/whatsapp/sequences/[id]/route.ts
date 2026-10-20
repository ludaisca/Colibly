import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserAccountIds, getUserChannelAccountIds } from "@/lib/shared-accounts";
import { sequenceUpdateSchema } from "@/lib/validations";
import { forbidRoles } from "@/lib/roles";
import { tagBelongsTo } from "@/lib/tags";
import { publicErrorMessage } from "@/lib/api-errors";

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
    const denied = forbidRoles(session, ["ejecutivo"]);
    if (denied) return denied;

    const { id } = await params;
    const existing = await getOwnedSequence(session.user.id, id);
    if (!existing) {
      return NextResponse.json({ error: "Secuencia no encontrada" }, { status: 404 });
    }

    const body = await req.json().catch(() => null);
    const parsed = sequenceUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const { steps, ...data } = parsed.data;

    const triggerType = data.triggerType ?? existing.triggerType;
    const triggerValue = data.triggerValue !== undefined ? data.triggerValue : existing.triggerValue;
    if (triggerType === "TAG_ADDED") {
      if (!triggerValue) return NextResponse.json({ error: "Selecciona una etiqueta" }, { status: 400 });
      const tag = await prisma.tag.findUnique({ where: { id: triggerValue } });
      if (!tag || !tagBelongsTo(tag, existing)) {
        return NextResponse.json({ error: "Etiqueta no encontrada" }, { status: 404 });
      }
    } else if (triggerType === "LEAD_STATUS_CHANGED" &&
      (!triggerValue || !["NEW", "CONTACTED", "QUALIFIED", "CUSTOMER", "LOST"].includes(triggerValue))) {
      return NextResponse.json({ error: "Estado de lead inválido" }, { status: 400 });
    }

    // currentStep apunta al índice del paso: no se puede sustituir la lista
    // mientras haya inscripciones activas sin cambiar el significado del índice.
    let replaceSteps = false;
    if (steps) {
      const currentSteps = await prisma.wASequenceStep.findMany({
        where: { sequenceId: id }, orderBy: { order: "asc" },
        select: { delayMinutes: true, message: true },
      });
      replaceSteps = JSON.stringify(currentSteps) !== JSON.stringify(steps);
      if (replaceSteps && await prisma.wASequenceEnrollment.count({ where: { sequenceId: id, status: "ACTIVE" } }) > 0) {
        return NextResponse.json({ error: "Hay inscripciones en curso. Espera a que terminen antes de cambiar los pasos." }, { status: 409 });
      }
    }
    const sequence = await prisma.wASequence.update({
      where: { id },
      data: {
        ...data,
        triggerValue: triggerType === "APPOINTMENT_COMPLETED" ? null : triggerValue,
        ...(replaceSteps && steps
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
    const message = publicErrorMessage(error, "Error interno del servidor");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
