import { prisma } from "@/lib/prisma";
import { metaConversionsQueue } from "@/lib/queue";
import { enrollContactInTrigger } from "@/lib/sequences";
import { emitDomainEvent } from "@/lib/events/emit";
import { eventRefsForContact } from "@/lib/events/refs";
import type { DealEventData } from "@/lib/events/types";

// Efectos de que un negocio nazca o cambie de etapa. Un único lugar para que
// el tablero, la API, las automatizaciones y la alta automática de contactos
// nuevos disparen exactamente lo mismo (antes vivía en `afterLeadStatusChanged`).
// Se llaman DESPUÉS de confirmar la transacción y nunca lanzan: el hecho ya
// ocurrió y no debe revertirse porque Redis falle.

async function loadContext(dealId: string) {
  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    select: {
      id: true,
      organizationId: true,
      title: true,
      amount: true,
      personId: true,
      ownerId: true,
      contactId: true,
      status: true,
      stageEnteredAt: true,
      stage: { select: { id: true, name: true, outcome: true, metaEvent: true } },
      pipeline: { select: { id: true, name: true } },
      lostReason: { select: { id: true, name: true } },
      organization: { select: { currency: true } },
      contact: { select: { leadOrigin: true } },
    },
  });
  return deal;
}

type Ctx = NonNullable<Awaited<ReturnType<typeof loadContext>>>;

function eventData(deal: Ctx, from: { id: string; name: string } | null): DealEventData {
  return {
    dealId: deal.id,
    title: deal.title,
    amount: Number(deal.amount),
    currency: deal.organization.currency,
    personId: deal.personId,
    ownerId: deal.ownerId,
    pipeline: deal.pipeline,
    stage: { id: deal.stage.id, name: deal.stage.name, status: deal.stage.outcome },
    fromStage: from,
    lostReason: deal.lostReason,
  };
}

// Feedback loop hacia Meta Ads: solo negocios cuyo contacto vino de un anuncio y
// cuya etapa tiene un evento configurado. El jobId incluye la hora de entrada a
// la etapa: reintentos del mismo cambio se deduplican, pero volver a entrar a
// la etapa (Calificado → Perdido → Calificado) sí reenvía.
async function enqueueConversion(deal: Ctx): Promise<void> {
  if (!deal.contactId || !deal.stage.metaEvent) return;
  if (!deal.contact || deal.contact.leadOrigin === "ORGANIC") return;
  await metaConversionsQueue
    .add(
      "send-event",
      { dealId: deal.id, stageId: deal.stage.id },
      { jobId: `meta-conversion-${deal.id}-${deal.stage.id}-${deal.stageEnteredAt.getTime()}` }
    )
    .catch((err) => console.error("[deals] meta-conversions enqueue failed:", err));
}

async function runEffects(deal: Ctx, from: { id: string; name: string } | null, created: boolean): Promise<void> {
  await enqueueConversion(deal);

  if (deal.contactId) {
    await enrollContactInTrigger("DEAL_STAGE_CHANGED", deal.stage.id, deal.contactId).catch((err) =>
      console.error("[deals] enrollContactInTrigger falló:", err)
    );
  }

  // Con conversación, el evento cuelga de su cuenta; sin ella (contacto
  // importado, negocio abierto a mano) es un evento de toda la organización.
  const refs = deal.contactId ? await eventRefsForContact(deal.contactId) : null;
  const base = refs ?? { account: null, organizationId: deal.organizationId, chat: null, contactId: null };
  const data = eventData(deal, from);
  if (created) {
    await emitDomainEvent({ type: "deal.created", ...base, data });
  } else {
    await emitDomainEvent({ type: "deal.stage_changed", ...base, data });
    if (deal.stage.outcome === "WON") await emitDomainEvent({ type: "deal.won", ...base, data });
    if (deal.stage.outcome === "LOST") await emitDomainEvent({ type: "deal.lost", ...base, data });
  }
}

export async function afterDealCreated(dealId: string): Promise<void> {
  try {
    const deal = await loadContext(dealId);
    if (deal) await runEffects(deal, null, true);
  } catch (err) {
    console.error("[deals] efectos de alta fallaron:", err);
  }
}

export async function afterDealStageChanged(dealId: string, from: { id: string; name: string }): Promise<void> {
  try {
    const deal = await loadContext(dealId);
    if (deal) await runEffects(deal, from, false);
  } catch (err) {
    console.error("[deals] efectos de cambio de etapa fallaron:", err);
  }
}
