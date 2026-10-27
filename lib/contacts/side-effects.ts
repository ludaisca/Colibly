import type { LeadOrigin, LeadStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { metaConversionsQueue } from "@/lib/queue";
import { enrollContactInTrigger } from "@/lib/sequences";
import { emitDomainEvent } from "@/lib/events/emit";
import { eventRefsForContact } from "@/lib/events/refs";

// Efectos de un cambio real de etapa del lead. Un único lugar para que la UI
// (PATCH /api/whatsapp/contacts/[id]), la API pública y las automatizaciones
// disparen exactamente lo mismo — antes vivía inline en la ruta.
export async function afterLeadStatusChanged(
  contact: { id: string; leadOrigin: LeadOrigin },
  from: LeadStatus,
  to: LeadStatus
): Promise<void> {
  if (from === to) return;

  const placed = await prisma.contact.findUnique({
    where: { id: contact.id },
    select: {
      pipelineStageId: true,
      pipelineStage: { select: { pipeline: { select: { isDefault: true } } } },
      account: { select: { organizationId: true } },
      channelAccount: { select: { organizationId: true } },
    },
  });
  const organizationId = placed?.account?.organizationId ?? placed?.channelAccount?.organizationId;
  const onCustomFunnel = !!placed?.pipelineStage && !placed.pipelineStage.pipeline.isDefault;
  if (organizationId && !onCustomFunnel) {
    const stage = await prisma.pipelineStage.findFirst({
      where: { leadStatus: to, pipeline: { organizationId, isDefault: true } },
      select: { id: true },
    });
    if (stage && stage.id !== placed?.pipelineStageId) {
      await prisma.contact.update({ where: { id: contact.id }, data: { pipelineStageId: stage.id } });
    }
  }

  const fromOutcome = from === "CUSTOMER" ? "WON" : from === "LOST" ? "LOST" : "OPEN";
  const toOutcome = to === "CUSTOMER" ? "WON" : to === "LOST" ? "LOST" : "OPEN";
  if (fromOutcome !== toOutcome && organizationId) {
    await prisma.leadOutcomeEvent
      .create({ data: { organizationId, contactId: contact.id, outcome: toOutcome } })
      .catch((err) => console.error("[contacts] lead outcome event failed:", err));
  }

  // Feedback loop hacia Meta Ads: solo leads que vinieron de un anuncio. La
  // resolución de la MetaAdsAccount vive en sendLeadConversionEvent; el jobId
  // determinístico es la segunda capa de dedupe junto al
  // @@unique([contactId, leadStatus]) de MetaConversionEvent.
  if (contact.leadOrigin !== "ORGANIC") {
    await metaConversionsQueue
      .add("send-event", { contactId: contact.id, leadStatus: to }, { jobId: `meta-conversion-${contact.id}-${to}` })
      .catch((err) => console.error("[contacts] meta-conversions enqueue failed:", err));
  }

  await enrollContactInTrigger("LEAD_STATUS_CHANGED", to, contact.id).catch((err) =>
    console.error("[contacts] enrollContactInTrigger falló:", err)
  );

  const refs = await eventRefsForContact(contact.id);
  if (refs) await emitDomainEvent({ type: "contact.lead_status_changed", ...refs, data: { from, to } });
}

// Efectos de agregar una etiqueta a un contacto (la fila ContactTag ya existe).
export async function afterContactTagAdded(contactId: string, tag: { id: string; name: string }): Promise<void> {
  await enrollContactInTrigger("TAG_ADDED", tag.id, contactId).catch((err) =>
    console.error("[contacts/tags] enrollContactInTrigger falló:", err)
  );
  const refs = await eventRefsForContact(contactId);
  if (refs) {
    await emitDomainEvent({ type: "tag.added", ...refs, data: { tagId: tag.id, tagName: tag.name, target: "contact" } });
  }
}
