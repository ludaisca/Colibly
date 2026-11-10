import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { contactScopeWhere } from "@/lib/contacts/scope";
import { contactUpdateSchema } from "@/lib/validations";
import { afterLeadStatusChanged } from "@/lib/contacts/side-effects";
import { publicErrorMessage } from "@/lib/api-errors";
import { requireOrgId } from "@/lib/tenancy";
import { leadStatusForStage } from "@/lib/pipeline/stages";
import { recordContactActivity } from "@/lib/contacts/activity";
import { formatMxn, pesosToCents } from "@/lib/money";

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
    const scope = await contactScopeWhere(session.user.id);

    const contact = await prisma.contact.findFirst({
      where: { id, ...scope },
      select: {
        id: true,
        accountId: true,
        remoteJid: true,
        name: true,
        leadStatus: true,
        optedOutMarketing: true,
        optedOutAt: true,
        overLimit: true,
        dealValueCents: true,
        expectedCloseAt: true,
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
    const scope = await contactScopeWhere(session.user.id);

    const existing = await prisma.contact.findFirst({
      where: { id, ...scope },
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

    const organizationId = await requireOrgId(session.user.id);
    let leadStatus = parsed.data.leadStatus;
    let pipelineStageId: string | undefined;
    if (parsed.data.pipelineStageId) {
      const stage = await prisma.pipelineStage.findFirst({
        where: { id: parsed.data.pipelineStageId, pipeline: { organizationId } },
      });
      if (!stage) return NextResponse.json({ error: "Etapa no encontrada" }, { status: 404 });
      leadStatus = leadStatusForStage(stage, existing.leadStatus);
      pipelineStageId = stage.id;
    } else if (leadStatus && leadStatus !== existing.leadStatus) {
      const stage = await prisma.pipelineStage.findFirst({
        where: { leadStatus, pipeline: { organizationId, isDefault: true } },
      });
      if (stage) pipelineStageId = stage.id;
    }

    const { pipelineStageId: _ignored, dealValue, expectedCloseAt, ...rest } = parsed.data;
    const dealValueCents = dealValue === undefined ? undefined : dealValue === null ? null : pesosToCents(dealValue);
    const closeAt = expectedCloseAt === undefined ? undefined : expectedCloseAt === null ? null : new Date(expectedCloseAt);
    const updated = await prisma.contact.update({
      where: { id },
      // Un nombre puesto a mano ya no lo pisan la libreta ni el perfil de WhatsApp.
      data: {
        ...rest,
        ...(dealValueCents !== undefined ? { dealValueCents } : {}),
        ...(closeAt !== undefined ? { expectedCloseAt: closeAt } : {}),
        ...(leadStatus ? { leadStatus } : {}),
        ...(pipelineStageId ? { pipelineStageId } : {}),
        ...(parsed.data.name !== undefined ? { nameSource: "user" } : {}),
      },
      select: {
        id: true,
        accountId: true,
        remoteJid: true,
        name: true,
        leadStatus: true,
        pipelineStageId: true,
        dealValueCents: true,
        expectedCloseAt: true,
        updatedAt: true,
      },
    });

    // Línea de tiempo: solo si el valor del trato cambió de verdad.
    if (dealValueCents !== undefined && dealValueCents !== existing.dealValueCents) {
      await recordContactActivity({
        contactId: id,
        type: "DEAL_UPDATED",
        title: dealValueCents === null ? "Valor del trato borrado" : `Valor del trato: ${formatMxn(dealValueCents)}`,
        body: existing.dealValueCents !== null ? `Antes: ${formatMxn(existing.dealValueCents)}` : null,
        actorId: session.user.id,
        metadata: { from: existing.dealValueCents, to: dealValueCents },
      });
    }

    // Meta Ads (CAPI), secuencias y evento de dominio — compartido con la API
    // pública y las automatizaciones.
    if (leadStatus) {
      await afterLeadStatusChanged(existing, existing.leadStatus, leadStatus);
    }

    return NextResponse.json(updated);
  } catch (error) {
    const message =
      publicErrorMessage(error, "Error interno del servidor");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
