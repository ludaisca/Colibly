import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { sendConversionEvent, buildInstantFormPayload, buildCtwaPayload } from "@/lib/meta/conversions";

// Punto de entrada único compartido por el trigger automático (un negocio entra
// a una etapa con `metaEvent` -> lib/crm/deal-effects.ts -> metaConversionsQueue)
// y cualquier reenvío manual futuro — mismo principio que
// lib/whatsapp/lead-scoring.ts: scoreChatWithScorer(), una sola función de
// negocio, dos disparadores.
//
// El evento y su nombre salen de la etapa (`PipelineStage.metaEvent`); la
// atribución al anuncio (ctwa_clid, lead id) sigue en el Contact de origen del
// negocio. Al ganar un negocio con importe se reporta también su valor.
export async function sendLeadConversionEvent(dealId: string, stageId: string): Promise<void> {
  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    select: {
      id: true,
      amount: true,
      contactId: true,
      organization: { select: { currency: true } },
      contact: { include: { metaAdsAccount: true } },
    },
  });
  if (!deal?.contact || !deal.contactId) return;
  const contact = deal.contact;
  const contactId = deal.contactId;
  const stage = await prisma.pipelineStage.findUnique({ where: { id: stageId }, select: { name: true, outcome: true, metaEvent: true } });

  // Guards silenciosos — mismo patrón que isMonthlyBudgetExceeded(): nada
  // que reportar no es un error, solo un no-op logueado.
  if (!contact) return;
  if (contact.leadOrigin === "ORGANIC") return;

  // Instant Form: metaAdsAccountId se fija en el create del webhook leadgen
  // (first-touch — literal, sabemos de qué Página vino el lead). CTWA no
  // tiene ese anclaje natural: el referral llega por el webhook de WhatsApp,
  // sin ninguna Página involucrada, así que se resuelve dinámicamente por
  // waAccountId en vez de congelarlo al crear el Contact — esto también deja
  // que una MetaAdsAccount creada DESPUÉS de que el chat ya existía funcione
  // sin tener que re-tocar contactos viejos. Asume a lo más una
  // MetaAdsAccount CONNECTED por WAAccount; si hay varias, se usa la primera.
  let account = contact.metaAdsAccount;
  if (!account && contact.leadOrigin === "CTWA" && contact.accountId) {
    account = await prisma.metaAdsAccount.findFirst({
      where: { waAccountId: contact.accountId, status: "CONNECTED" },
    });
  }
  if (!account) {
    console.log(`[meta-conversions] contact ${contactId} sin MetaAdsAccount resuelto — se omite`);
    return;
  }
  if (account.status !== "CONNECTED") {
    console.log(`[meta-conversions] MetaAdsAccount ${account.id} no está CONNECTED — se omite`);
    return;
  }
  if (!account.datasetId || !account.capiAccessToken) {
    console.log(`[meta-conversions] MetaAdsAccount ${account.id} sin dataset/token de Conversions API — se omite`);
    return;
  }

  if (!stage?.metaEvent) {
    console.log(`[meta-conversions] la etapa ${stageId} no reporta evento a Meta — se omite`);
    return;
  }
  const amount = Number(deal.amount);
  const mapping = {
    eventName: stage.metaEvent,
    ...(stage.outcome === "WON" && amount > 0 ? { value: amount, currency: deal.organization.currency } : {}),
  };

  if (contact.leadOrigin === "INSTANT_FORM" && !contact.metaLeadId) return;
  if (contact.leadOrigin === "CTWA" && !contact.ctwaClid) return;

  // upsert, no create-o-skip: si el negocio vuelve a pasar por la misma
  // etapa (Calificado -> Perdido -> Calificado), el segundo evento sí se
  // reenvía, reseteando a PENDING en vez de quedar bloqueado por el
  // @@unique([dealId, stageId]).
  const logEntry = await prisma.metaConversionEvent.upsert({
    where: { dealId_stageId: { dealId, stageId } },
    create: {
      contactId,
      dealId,
      stageId,
      metaAdsAccountId: account.id,
      eventName: mapping.eventName,
      status: "PENDING",
    },
    update: {
      eventName: mapping.eventName,
      status: "PENDING",
      errorMessage: null,
      sentAt: null,
    },
  });

  try {
    const payload =
      contact.leadOrigin === "INSTANT_FORM"
        ? buildInstantFormPayload({
            eventId: logEntry.metaEventId,
            eventName: mapping.eventName,
            value: mapping.value,
            currency: mapping.currency,
            metaLeadId: contact.metaLeadId!,
          })
        : buildCtwaPayload({
            eventId: logEntry.metaEventId,
            eventName: mapping.eventName,
            value: mapping.value,
            currency: mapping.currency,
            ctwaClid: contact.ctwaClid!,
          });

    await sendConversionEvent({
      datasetId: account.datasetId,
      accessToken: decrypt(account.capiAccessToken),
      event: payload,
      testEventCode: account.mode === "TEST" ? account.testEventCode : null,
      live: account.mode === "LIVE",
    });

    await prisma.metaConversionEvent.update({
      where: { id: logEntry.id },
      data: { status: "SENT", sentAt: new Date() },
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Error desconocido";
    await prisma.metaConversionEvent.update({
      where: { id: logEntry.id },
      data: { status: "FAILED", errorMessage },
    });
    console.error(`[meta-conversions] envío falló para el negocio ${dealId}, etapa ${stageId}:`, errorMessage);
  }
}
