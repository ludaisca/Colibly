import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserAccountIds, getUserChannelAccountIds } from "@/lib/shared-accounts";
import { contactUpdateSchema } from "@/lib/validations";
import { metaConversionsQueue } from "@/lib/queue";
import { enrollContactInTrigger } from "@/lib/sequences";

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
      error instanceof Error ? error.message : "Error interno del servidor";
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
        leadStatus: true,
        updatedAt: true,
      },
    });

    // Feedback loop de calificación hacia Meta Ads: solo si leadStatus
    // realmente cambió y el contacto viene de un anuncio (no ORGANIC). La
    // resolución de la MetaAdsAccount (incluyendo el chequeo de status
    // CONNECTED) vive enteramente en sendLeadConversionEvent — para CTWA se
    // resuelve dinámicamente por waAccountId, no hay un campo aquí que
    // consultar de antemano. jobId determinístico como segunda capa de
    // dedupe junto al @@unique([contactId, leadStatus]) de MetaConversionEvent.
    if (
      parsed.data.leadStatus &&
      parsed.data.leadStatus !== existing.leadStatus &&
      existing.leadOrigin !== "ORGANIC"
    ) {
      await metaConversionsQueue
        .add(
          "send-event",
          { contactId: id, leadStatus: parsed.data.leadStatus },
          { jobId: `meta-conversion-${id}-${parsed.data.leadStatus}` }
        )
        .catch((err) => console.error("[contacts] meta-conversions enqueue failed:", err));
    }

    // Trigger de secuencias (roadmap P3-a) — independiente del feedback loop
    // de Meta Ads de arriba, corre para cualquier leadStatus nuevo sin
    // importar leadOrigin.
    if (parsed.data.leadStatus && parsed.data.leadStatus !== existing.leadStatus) {
      await enrollContactInTrigger("LEAD_STATUS_CHANGED", parsed.data.leadStatus, id).catch((err) =>
        console.error("[contacts] enrollContactInTrigger falló:", err)
      );
    }

    return NextResponse.json(updated);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Error interno del servidor";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
