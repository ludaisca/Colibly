import type { LeadStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { mapLeadStatusToMetaEvent } from "@/lib/meta/lead-status-mapping";
import { sendConversionEvent, buildInstantFormPayload, buildCtwaPayload } from "@/lib/meta/conversions";

// Punto de entrada único compartido por el trigger automático (PATCH
// /api/whatsapp/contacts/[id] -> metaConversionsQueue) y cualquier reenvío
// manual futuro — mismo principio que lib/whatsapp/lead-scoring.ts:
// scoreChatWithScorer(), una sola función de negocio, dos disparadores.
export async function sendLeadConversionEvent(contactId: string, leadStatus: LeadStatus): Promise<void> {
  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    include: { metaAdsAccount: true },
  });

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

  const mapping = mapLeadStatusToMetaEvent(leadStatus);
  if (!mapping || !mapping.report) {
    console.log(`[meta-conversions] leadStatus ${leadStatus} no está mapeado para reportarse — se omite`);
    return;
  }

  if (contact.leadOrigin === "INSTANT_FORM" && !contact.metaLeadId) return;
  if (contact.leadOrigin === "CTWA" && !contact.ctwaClid) return;

  // upsert, no create-o-skip: si el contacto vuelve a pasar por el mismo
  // estado (QUALIFIED -> LOST -> QUALIFIED), el segundo evento sí se
  // reenvía, reseteando a PENDING en vez de quedar bloqueado por el
  // @@unique([contactId, leadStatus]).
  const logEntry = await prisma.metaConversionEvent.upsert({
    where: { contactId_leadStatus: { contactId, leadStatus } },
    create: {
      contactId,
      metaAdsAccountId: account.id,
      leadStatus,
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
    console.error(`[meta-conversions] envío falló para contact ${contactId}, status ${leadStatus}:`, errorMessage);
  }
}
