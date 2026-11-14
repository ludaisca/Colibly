import { after, NextResponse } from "next/server";
import { refreshPhoneHealth } from "@/lib/whatsapp/phone-health";
import { metaSendErrorMessage } from "@/lib/whatsapp/send-errors";
import { applyReactionStatus } from "@/lib/whatsapp/reactions";
import { createHash } from "crypto";
import type { Prisma, RecipientStatus } from "@prisma/client";
import { emitDomainEvent } from "@/lib/events/emit";
import { jidCandidates } from "@/lib/whatsapp/coexistence/normalize";
import { prisma } from "@/lib/prisma";
import { ingestInboundMessage } from "@/lib/whatsapp/ingest-message";
import { rateLimit } from "@/lib/rate-limit";
import { getMediaInfo, getMessageBody, parseMessageEdit, structuredContentOf, type WhatsAppMessageContent } from "@/lib/whatsapp/message-content";
import { validateWhatsAppWebhookSignature, verifyTokenMatches } from "@/lib/meta/platform-app";
import { getPlatformSettings } from "@/lib/platform-settings";
import { COEXISTENCE_FIELDS, handleCoexistenceChange, type CoexistenceField } from "@/lib/whatsapp/coexistence/webhook";
import { handleCallsWebhook } from "@/lib/whatsapp/calling/ingest";
import { applyConnectionLifecycle } from "@/lib/whatsapp/coexistence/lifecycle";
import { handleTemplateChange, TEMPLATE_FIELDS } from "@/lib/whatsapp/template-webhook";
import { isMediaTooLargeStatus, recordMediaTooLarge } from "@/lib/whatsapp/media-too-large";
import { isNegativeQualityEvent, qualityEventText } from "@/lib/platform/whatsapp-health-rules";

// El contenido (texto, medios, ubicación, contactos, pedido, contexto…) tiene
// la misma forma en `messages`, `smb_message_echoes` e `history`: vive en
// lib/whatsapp/message-content.ts. Aquí solo va lo propio del entrante.
interface WebhookMessage extends WhatsAppMessageContent {
  // Número del cliente. Con los nombres de usuario de WhatsApp Meta puede
  // omitirlo y mandar solo `from_user_id` (id por negocio, "MX.…").
  from?: string;
  from_user_id?: string;
  id: string;
  timestamp: string;
  reaction?: { message_id?: string; emoji?: string };
  // Presente cuando el chat se originó en un anuncio click-to-WhatsApp — ver
  // lib/whatsapp/ingest-message.ts:InboundReferral para el detalle de campos.
  referral?: {
    source_url?: string;
    source_id?: string;
    source_type?: string;
    headline?: string;
    body?: string;
    media_type?: string;
    image_url?: string;
    video_url?: string;
    thumbnail_url?: string;
    ctwa_clid?: string;
  };
}

interface WebhookStatus {
  id: string;
  status: string;
  timestamp: string;
  recipient_id: string;
  recipient_user_id?: string;
  // Modelo por mensaje (PMP): si se cobra y en qué categoría.
  pricing?: { billable?: boolean; pricing_model?: string; category?: string; type?: string; subtype?: string };
  errors?: MetaStatusError[];
}

interface MetaStatusError {
  code?: number;
  title?: string;
  message?: string;
  error_data?: { details?: string };
  href?: string;
}

interface WebhookValue {
  messaging_product: string;
  metadata: {
    display_phone_number: string;
    phone_number_id: string;
  };
  contacts?: Array<{
    profile?: { name?: string };
    wa_id?: string;
    user_id?: string;
  }>;
  messages?: WebhookMessage[];
  statuses?: WebhookStatus[];
}

// Payload de Meta para el campo `phone_number_quality_update` — no llega con
// `metadata.phone_number_id` (no es un evento "de mensaje"), así que la cuenta
// se resuelve por wabaId + número.
interface QualityUpdateValue {
  display_phone_number?: string;
  event?: string; // p. ej. "FLAGGED" | "UNFLAGGED" | "GREEN" | "YELLOW" | "RED"
  current_limit?: string; // p. ej. "TIER_1K"
}

// Payload para el campo `account_update` — reporta baneos/restricciones y otros
// cambios de estado de la cuenta. Tampoco trae metadata.phone_number_id.
interface AccountUpdateValue {
  phone_number?: string;
  event?: string;
  ban_info?: { waba_ban_state?: string; waba_ban_date?: string };
  // Coexistencia: motivo de una desconexión (PARTNER_REMOVED).
  disconnection_info?: { reason?: string; initiated_by?: string };
}

// Payload para el campo `user_preferences` — opt-out/opt-in nativo de WhatsApp
// para mensajes de marketing. Sí trae metadata (es por número, como messages).
interface UserPreferencesValue {
  metadata?: { phone_number_id?: string };
  user_preferences?: Array<{
    wa_id?: string;
    category?: string; // "marketing_messages"
    value?: string; // "stop" | "resume"
  }>;
}

// sent < delivered < read — Meta no garantiza el orden de entrega de los
// webhooks, así que un "delivered" rezagado no debe pisar un "read" ya aplicado.
const STATUS_RANK: Record<string, number> = { sent: 1, delivered: 2, read: 3 };

function statusErrorDetail(status: WebhookStatus): string | null {
  const err = status.errors?.[0];
  if (!err) return null;
  return err.error_data?.details ?? err.message ?? err.title ?? (err.code ? `Error ${err.code}` : null);
}

export function failedMessageFields(status: WebhookStatus): { errorCode: number | null; errorMessage: string; errorDetail: Prisma.InputJsonObject | undefined } {
  const err = status.errors?.[0];
  const raw = err?.code;
  const code = typeof raw === "number" ? raw : raw != null && /^\d+$/.test(String(raw)) ? Number(raw) : null;
  return {
    errorCode: code,
    errorMessage: metaSendErrorMessage(code, statusErrorDetail(status)),
    // El error de Meta sin traducir, para la API y los webhooks.
    errorDetail: err ? publicMetaError(err, code) : undefined,
  };
}

function publicMetaError(err: MetaStatusError, code: number | null): Prisma.InputJsonObject {
  const s = (v: unknown) => (typeof v === "string" && v ? v : null);
  return { code, title: s(err.title), message: s(err.message), details: s(err.error_data?.details), href: s(err.href) };
}

async function applyStatusUpdate(accountId: string, status: WebhookStatus): Promise<void> {
  if (!status.id) return;
  if (status.status === "failed") {
    // WAMessage no guarda el motivo: sin este log un envío rechazado por Meta
    // (ventana de 24 h, método de pago de la WABA, número bloqueado…) no deja
    // rastro. Solo código y texto de Meta, nunca el contenido del mensaje.
    const err = status.errors?.[0];
    console.warn(`[webhook] Envío fallido (cuenta ${accountId}, ${status.id}): ${err?.code ?? "sin código"} ${statusErrorDetail(status) ?? ""}`.trim());
    // 131052: el CLIENTE mandó un archivo de más de 100 MB que Meta no entrega
    // a la API. No hay mensaje que actualizar: se deja un aviso en el chat.
    // Si el wamid ya es un mensaje nuestro (un envío propio rechazado) sigue el
    // camino normal y queda "No enviado".
    if (isMediaTooLargeStatus(status)) {
      const recorded = await recordMediaTooLarge(accountId, status).catch((e) => {
        console.error("[webhook] aviso de archivo grande falló:", e instanceof Error ? e.message : e);
        return false;
      });
      if (recorded) return;
    }
  }
  await applyReactionStatus(accountId, status.id, status.status);

  const rank = STATUS_RANK[status.status];
  const lowerStatuses = rank
    ? Object.keys(STATUS_RANK).filter((s) => STATUS_RANK[s] < rank)
    : null;
  // Hora del suceso según Meta (no la de llegada del webhook, que puede venir
  // con minutos de retraso o fuera de orden).
  const eventSeconds = Number(status.timestamp);
  const statusAt = Number.isFinite(eventSeconds) && eventSeconds > 0 ? new Date(eventSeconds * 1000) : new Date();
  const pricing = status.pricing ? (status.pricing as Prisma.InputJsonValue) : undefined;

  // Estado previo: para `previousStatus` del evento y para saber si falta la
  // hora de entrega cuando Meta salta directo a "read".
  const before = await prisma.wAMessage.findFirst({
    where: { wamid: status.id, chat: { accountId } },
    select: { id: true, chatId: true, status: true, deliveredAt: true, chat: { select: { contactId: true } } },
  });
  const failure = status.status === "failed" ? failedMessageFields(status) : null;

  const updated = before
    ? await prisma.wAMessage.updateMany({
        where: {
          id: before.id,
          // Solo avanza: para sent/delivered/read exige que el estado actual sea
          // inferior (o inexistente). "failed" y estados desconocidos siempre aplican.
          ...(lowerStatuses
            ? { OR: [{ status: { in: [...lowerStatuses, "pending"] } }, { status: null }] }
            : {}),
        },
        data: {
          status: status.status,
          // Motivo legible en la burbuja (lib/whatsapp/send-errors.ts) + el de Meta.
          ...(failure ?? {}),
          ...(status.status === "delivered" ? { deliveredAt: statusAt } : {}),
          // Un mensaje leído fue entregado a más tardar al leerse.
          ...(status.status === "read" ? { readAt: statusAt, ...(before.deliveredAt ? {} : { deliveredAt: statusAt }) } : {}),
          ...(pricing ? { pricing } : {}),
        },
      })
    : { count: 0 };

  // Webhooks salientes: solo si el estado avanzó de verdad (Meta repite
  // entregas y manda estados fuera de orden; el updateMany ya los filtró).
  if (before && updated.count > 0) {
    const meta = failure?.errorDetail as { title: string | null; details: string | null; href: string | null } | undefined;
    await emitDomainEvent({
      type: "message.status_changed",
      account: { kind: "whatsapp", id: accountId },
      chat: { kind: "whatsapp", id: before.chatId },
      contactId: before.chat.contactId,
      data: {
        messageId: before.id,
        status: status.status,
        previousStatus: before.status,
        error: failure
          ? { code: failure.errorCode, message: failure.errorMessage, title: meta?.title ?? null, details: meta?.details ?? null, href: meta?.href ?? null }
          : null,
        pricing: status.pricing
          ? {
              billable: status.pricing.billable ?? null,
              model: status.pricing.pricing_model ?? null,
              category: status.pricing.category ?? null,
              type: status.pricing.type ?? null,
            }
          : null,
      },
    }, statusAt);
  }

  const statusMap: Record<string, { status: string; field?: string }> = {
    sent: { status: "SENT", field: "sentAt" },
    delivered: { status: "DELIVERED", field: "deliveredAt" },
    read: { status: "READ", field: "readAt" },
    failed: { status: "FAILED" },
  };
  const mapped = statusMap[status.status];
  if (!mapped) return;

  const updateData: Record<string, unknown> = { status: mapped.status };
  if (mapped.status === "FAILED") {
    const detail = statusErrorDetail(status);
    if (detail) updateData.errorMessage = detail;
  }
  if (mapped.field === "sentAt") {
    updateData.sentAt = statusAt;
  } else if (mapped.field === "deliveredAt") {
    updateData.deliveredAt = statusAt;
  } else if (mapped.field === "readAt") {
    updateData.readAt = statusAt;
  }

  // Mismo tracking de entrega/lectura que WACampaignRecipient, pero para envíos
  // disparados por una fuente de leads automática (LeadSheetImportedRow usa
  // strings en minúscula, no el enum RecipientStatus). Independiente del bloque
  // de campañas de abajo — un wamid solo puede pertenecer a una de las dos tablas.
  const leadSheetStatus = mapped.status.toLowerCase();
  const LEAD_SHEET_RANK: Record<string, number> = { sent: 1, delivered: 2, read: 3 };
  const leadSheetRank = LEAD_SHEET_RANK[leadSheetStatus];
  const leadSheetLower = leadSheetRank
    ? Object.keys(LEAD_SHEET_RANK).filter((s) => LEAD_SHEET_RANK[s] < leadSheetRank)
    : null;

  const leadSheetUpdateData: Record<string, unknown> = { status: leadSheetStatus };
  if (leadSheetStatus === "failed") {
    const detail = statusErrorDetail(status);
    if (detail) leadSheetUpdateData.errorMessage = detail;
  }
  if (mapped.field === "deliveredAt") leadSheetUpdateData.deliveredAt = statusAt;
  if (mapped.field === "readAt") leadSheetUpdateData.readAt = statusAt;

  await prisma.leadSheetImportedRow.updateMany({
    where: {
      wamid: status.id,
      ...(leadSheetLower ? { status: { in: leadSheetLower } } : {}),
    },
    data: leadSheetUpdateData,
  });

  const recipient = await prisma.wACampaignRecipient.findFirst({
    where: { wamid: status.id },
    select: { campaignId: true },
  });
  if (!recipient) return;

  const RECIPIENT_RANK: Record<string, number> = { SENT: 1, DELIVERED: 2, READ: 3 };
  const recipientRank = RECIPIENT_RANK[mapped.status];
  const recipientLower = recipientRank
    ? (["PENDING", ...Object.keys(RECIPIENT_RANK).filter((s) => RECIPIENT_RANK[s] < recipientRank)] as RecipientStatus[])
    : null;

  await prisma.wACampaignRecipient.updateMany({
    where: {
      wamid: status.id,
      ...(recipientLower ? { status: { in: recipientLower } } : {}),
    },
    data: updateData,
  });

  await syncCampaignCounts(recipient.campaignId);
}

// Recomputed from current recipient statuses (not incremented) so duplicate
// webhook deliveries for the same status stay idempotent. "Entregado" counts
// as delivered-or-further since a READ recipient was necessarily delivered
// first — WhatsApp overwrites status forward, it doesn't keep both.
async function syncCampaignCounts(campaignId: string): Promise<void> {
  const counts = await prisma.wACampaignRecipient.groupBy({
    by: ["status"],
    where: { campaignId },
    _count: { _all: true },
  });
  const countOf = (s: string) => counts.find((c) => c.status === s)?._count._all ?? 0;

  await prisma.wACampaign.update({
    where: { id: campaignId },
    data: {
      deliveredCount: countOf("DELIVERED") + countOf("READ"),
      readCount: countOf("READ"),
      failedCount: countOf("FAILED"),
    },
  });
}

function normalizePhone(phone: string | undefined | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return digits || null;
}

// account_update / phone_number_quality_update no traen phone_number_id (van a
// nivel de número/WABA, no de mensaje) — se resuelve por wabaId y, si hay más
// de un número bajo la misma WABA, se desambigua comparando el número reportado
// (normalizado) contra WAAccount.phoneNumber. Si no hay forma de desambiguar,
// no se adivina: se registra y se ignora el evento.
async function resolveAccountByWabaAndPhone(wabaId: string | undefined, phoneRaw: string | undefined) {
  if (!wabaId) return null;
  const candidates = await prisma.wAAccount.findMany({ where: { wabaId } });
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  const phone = normalizePhone(phoneRaw);
  if (!phone) {
    console.warn(`[webhook] wabaId ${wabaId} tiene ${candidates.length} cuentas y el evento no trae número — se omite`);
    return null;
  }
  const match = candidates.find((a) => normalizePhone(a.phoneNumber) === phone);
  if (!match) {
    console.warn(`[webhook] No se encontró cuenta con número ${phone} bajo wabaId ${wabaId}`);
  }
  return match ?? null;
}

async function applyPhoneNumberQualityUpdate(wabaId: string | undefined, value: QualityUpdateValue) {
  const account = await resolveAccountByWabaAndPhone(wabaId, value.display_phone_number);
  if (!account) return;

  // `event` es el SUCESO (FLAGGED, UNFLAGGED, UPGRADE, DOWNGRADE…), no la
  // calificación: se guarda aparte y la calidad real se vuelve a leer de Graph
  // después de responder a Meta.
  const rating = value.event ?? null;
  const tier = value.current_limit ?? null;

  await prisma.wAAccount.update({
    where: { id: account.id },
    data: { qualityEvent: rating, ...(tier ? { messagingTier: tier } : {}), qualityUpdatedAt: new Date() },
  });
  after(() => refreshPhoneHealth(account.id, { force: true }));
  await emitDomainEvent({
    type: "account.quality_changed",
    account: { kind: "whatsapp", id: account.id },
    contactId: null,
    chat: null,
    data: { event: rating, messagingTier: tier },
  });

  // Solo se notifica en señales negativas — un UPGRADE/GREEN no amerita alertar
  // al admin, solo se refleja en el badge de la cuenta.
  if (isNegativeQualityEvent(rating)) {
    await prisma.notification.create({
      data: {
        userId: account.userId,
        type: "ACCOUNT_STATUS",
        title: `Calidad del número «${account.name}»`,
        body: qualityEventText(rating as string, tier),
        link: `/whatsapp/cuentas/${account.id}`,
      },
    });
  }
}

async function applyAccountUpdate(wabaId: string | undefined, value: AccountUpdateValue) {
  const account = await resolveAccountByWabaAndPhone(wabaId, value.phone_number);
  if (!account) return;

  // Desconexión / cambio de teléfono / reconexión de una cuenta de coexistencia.
  if (await applyConnectionLifecycle(account, value)) return;

  const eventName = value.event ?? "UPDATE";
  const isRestriction = !!value.ban_info || /ban|disable|restrict|flag/i.test(eventName);

  if (isRestriction) {
    const detail = value.ban_info?.waba_ban_state
      ? `${eventName} (${value.ban_info.waba_ban_state})`
      : eventName;
    await prisma.wAAccount.update({
      where: { id: account.id },
      data: { status: "ERROR", errorMessage: `Meta reportó: ${detail}` },
    });
  }

  await prisma.notification.create({
    data: {
      userId: account.userId,
      type: "ACCOUNT_STATUS",
      title: `Cuenta "${account.name}": ${eventName}`,
      body: isRestriction
        ? "Meta restringió o marcó esta cuenta — revisa el estado en Cuentas WhatsApp."
        : `Actualización reportada por Meta: ${eventName}`,
      link: `/whatsapp/cuentas/${account.id}`,
    },
  });
}

async function applyUserPreferences(value: UserPreferencesValue) {
  const phoneNumberId = value.metadata?.phone_number_id;
  if (!phoneNumberId) return;
  const account = await prisma.wAAccount.findFirst({ where: { phoneNumberId } });
  if (!account) return;

  for (const pref of value.user_preferences ?? []) {
    if (pref.category !== "marketing_messages" || !pref.wa_id) continue;
    const optedOut = pref.value === "stop";
    const contacts = await prisma.contact.findMany({
      where: { accountId: account.id, remoteJid: { in: jidCandidates(pref.wa_id) } },
      select: { id: true },
    });
    for (const contact of contacts) {
      // Condicionado al valor anterior: Meta reintenta y solo el cambio real avisa.
      const changed = await prisma.contact.updateMany({
        where: { id: contact.id, optedOutMarketing: !optedOut },
        data: { optedOutMarketing: optedOut, optedOutAt: optedOut ? new Date() : null },
      });
      if (changed.count === 0) continue;
      await emitDomainEvent({
        type: "contact.marketing_preference_changed",
        account: { kind: "whatsapp", id: account.id },
        contactId: contact.id,
        chat: null,
        data: { optedOut, source: "whatsapp" },
      });
    }
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode !== "subscribe" || !token || !challenge) {
    return new NextResponse("Bad Request", { status: 400 });
  }

  // Token global de la app de plataforma (Embedded Signup): una sola
  // suscripción de webhook en Meta sirve a todos los clientes conectados con él.
  // Un fallo al leer la configuración (p. ej. al descifrar) no debe romper la
  // verificación de las cuentas manuales, que se resuelve más abajo.
  const platformToken = await getPlatformSettings().then((s) => s.metaWebhookVerifyToken).catch(() => null);
  if (verifyTokenMatches(token, platformToken)) {
    return new NextResponse(challenge, { headers: { "Content-Type": "text/plain" } });
  }

  const hash = createHash("sha256").update(token).digest("hex");

  const account = await prisma.wAAccount.findFirst({
    where: { verifyTokenHash: hash, status: { not: "DISCONNECTED" } },
  });

  if (!account) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  return new NextResponse(challenge, {
    headers: { "Content-Type": "text/plain" },
  });
}

export async function POST(req: Request) {
  try {
    const forwarded = req.headers.get("x-forwarded-for");
    const ip = forwarded?.split(",")[0]?.trim() ?? "unknown";
    // Límite alto a propósito: todo el tráfico legítimo de Meta llega desde
    // pocas IPs y compartido por todas las cuentas (una campaña de 1,000
    // mensajes genera ~3,000 callbacks de estado). La autenticación real es la
    // firma HMAC de cada payload.
    const { allowed } = await rateLimit(`webhook:${ip}`, 3000, 60);
    if (!allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const rawBody = await req.text();
    let body;
    try {
      body = JSON.parse(rawBody);
    } catch {
      // Malformado: reintentar no lo arregla.
      return NextResponse.json({ success: true });
    }
    const signature = req.headers.get("x-hub-signature-256");

    if (body.object !== "whatsapp_business_account") {
      return NextResponse.json({ success: true });
    }

    const entries = body.entry ?? [];

    for (const entry of entries) {
      // Para whatsapp_business_account, entry.id es el WABA ID — lo necesitan
      // account_update/phone_number_quality_update, que no traen phone_number_id.
      const wabaId: string | undefined = entry.id;
      const changes = entry.changes ?? [];

      for (const change of changes) {
        const field = change.field as string | undefined;

        if (field === "phone_number_quality_update") {
          const value = change.value as QualityUpdateValue;
          const account = await resolveAccountByWabaAndPhone(wabaId, value.display_phone_number);
          if (account) {
            const sigValid = await validateWhatsAppWebhookSignature(rawBody, signature, account);
            if (sigValid) {
              await applyPhoneNumberQualityUpdate(wabaId, value);
            }
          }
          continue;
        }

        if (field === "account_update") {
          const value = change.value as AccountUpdateValue;
          const account = await resolveAccountByWabaAndPhone(wabaId, value.phone_number);
          if (account) {
            const sigValid = await validateWhatsAppWebhookSignature(rawBody, signature, account);
            if (sigValid) {
              await applyAccountUpdate(wabaId, value);
            }
          }
          continue;
        }

        if (field === "user_preferences") {
          const value = change.value as UserPreferencesValue;
          const phoneNumberId = value.metadata?.phone_number_id;
          const account = phoneNumberId
            ? await prisma.wAAccount.findFirst({ where: { phoneNumberId } })
            : null;
          if (account) {
            const sigValid = await validateWhatsAppWebhookSignature(rawBody, signature, account);
            if (sigValid) {
              await applyUserPreferences(value);
            }
          }
          continue;
        }

        if (field && COEXISTENCE_FIELDS.includes(field)) {
          await handleCoexistenceChange({ field: field as CoexistenceField, value: change.value, rawBody, signature });
          continue;
        }

        if (field && TEMPLATE_FIELDS.includes(field)) {
          await handleTemplateChange({
            field: field as "message_template_status_update" | "template_category_update",
            wabaId,
            value: change.value,
            rawBody,
            signature,
          }).catch((error) => console.error("[webhook] evento de plantilla falló", { field, error: error instanceof Error ? error.message : String(error) }));
          continue;
        }

        if (field === "calls") {
          const eventValue = change.value as { metadata?: { phone_number_id?: string } } | null;
          const phoneNumberId = eventValue?.metadata?.phone_number_id;
          const account = phoneNumberId
            ? await prisma.wAAccount.findFirst({ where: { phoneNumberId } })
            : null;
          if (account && (account.connectionType !== "MANUAL" || account.appSecret)) {
            const sigValid = await validateWhatsAppWebhookSignature(rawBody, signature, account);
            if (sigValid) {
              await prisma.wAAccount.update({ where: { id: account.id }, data: { lastActivity: new Date() } });
              await handleCallsWebhook(account, eventValue).catch((error) => {
                console.error("[calls] no se pudo registrar la llamada", { accountId: account.id, error });
              });
            } else {
              console.warn(`[webhook] Firma inválida en calls para la cuenta "${account.name}" (${account.id})`);
            }
          }
          continue;
        }

        // Suscribir un campo en Meta no le da automáticamente una acción en
        // Colibly. Registrar solo su forma, tras verificar la firma, permite
        // estudiar los campos nuevos en DEV sin volcar teléfonos, mensajes ni
        // otros datos personales de Meta en los logs.
        if (field && field !== "messages") {
          const eventValue = change.value as Record<string, unknown> | null;
          const metadata = eventValue?.metadata as { phone_number_id?: string } | undefined;
          const candidates = metadata?.phone_number_id
            ? await prisma.wAAccount.findMany({ where: { phoneNumberId: metadata.phone_number_id } })
            : wabaId ? await prisma.wAAccount.findMany({ where: { wabaId } }) : [];
          for (const candidate of candidates) {
            if (await validateWhatsAppWebhookSignature(rawBody, signature, candidate)) {
              console.info("[webhook] Campo aún sin procesar", {
                field,
                accountId: candidate.id,
                keys: eventValue && typeof eventValue === "object" ? Object.keys(eventValue).sort() : [],
              });
              break;
            }
          }
          continue;
        }

        const value = change.value as WebhookValue;
        if (!value?.metadata?.phone_number_id) continue;

        const phoneNumberId = value.metadata.phone_number_id;

        const account = await prisma.wAAccount.findFirst({
          where: { phoneNumberId },
        });

        if (!account) continue;

        if (account.connectionType === "MANUAL" && !account.appSecret) {
          // Sin secreto la firma nunca valida — antes esto descartaba el
          // payload sin dejar rastro. La UI de la cuenta muestra el mismo aviso.
          console.warn(`[webhook] Cuenta "${account.name}" (${account.id}) sin App Secret — payload descartado. Configúralo en Cuentas WhatsApp.`);
          continue;
        }
        const sigValid = await validateWhatsAppWebhookSignature(rawBody, signature, account);
        if (!sigValid) {
          console.warn(`[webhook] Firma inválida para la cuenta "${account.name}" (${account.id}) — payload descartado`);
          continue;
        }

        await prisma.wAAccount.update({
          where: { id: account.id },
          data: { lastActivity: new Date() },
        });

        if (value.messages) {
          // remoteJid de cada mensaje. Sin `from` (cliente con nombre de
          // usuario) se busca el contacto por su user_id; si no existe, el
          // user_id hace de remoteJid para no perder el mensaje. Antes un
          // `from` ausente rompía el guardado y Meta reintentaba sin fin.
          const senderOf = new Map<WebhookMessage, string>();
          for (const msg of value.messages) {
            if (msg.from) { senderOf.set(msg, msg.from); continue; }
            if (!msg.from_user_id) continue;
            const known = await prisma.contact.findFirst({
              where: { accountId: account.id, metaUserId: msg.from_user_id },
              select: { remoteJid: true },
            });
            if (!known) console.warn(`[webhook] Mensaje sin número (solo user_id) en la cuenta ${account.id}: se guarda con el user_id como remitente`);
            senderOf.set(msg, known?.remoteJid ?? msg.from_user_id);
          }
          const groups = new Map<string, WebhookMessage[]>();
          for (const msg of value.messages) {
            const from = senderOf.get(msg);
            if (!from) continue;
            const list = groups.get(from) ?? [];
            list.push(msg);
            groups.set(from, list);
          }

          await Promise.all(
            Array.from(groups.values()).map(async (msgs) => {
              for (const msg of msgs) {
                if (msg.type === "reaction") {
                  const targetWamid = msg.reaction?.message_id;
                  if (!targetWamid) continue;
                  const target = await prisma.wAMessage.findFirst({
                    where: { wamid: targetWamid, chat: { accountId: account.id, remoteJid: senderOf.get(msg) } },
                    select: { id: true, reactionAt: true },
                  });
                  if (!target) continue;
                  const eventSeconds = Number(msg.timestamp);
                  const reactionAt = Number.isFinite(eventSeconds) && eventSeconds > 0
                    ? new Date(eventSeconds * 1000) : new Date();
                  if (target.reactionAt && reactionAt < target.reactionAt) continue;
                  await prisma.wAMessage.update({
                    where: { id: target.id },
                    data: { reactionEmoji: msg.reaction?.emoji || null, reactionAt },
                  });
                  continue;
                }
                if (msg.type === "edit") {
                  // El cliente editó un mensaje (solo coexistencia): se actualiza
                  // el original en vez de guardar otro mensaje "[edit]".
                  const edit = parseMessageEdit(msg as Parameters<typeof parseMessageEdit>[0]);
                  if (!edit) continue;
                  const target = await prisma.wAMessage.findFirst({
                    where: { wamid: edit.originalMessageId, chat: { accountId: account.id, remoteJid: senderOf.get(msg) } },
                    select: { id: true },
                  });
                  if (!target) continue;
                  await prisma.wAMessage.update({
                    where: { id: target.id },
                    data: {
                      ...(edit.body !== null ? { body: edit.body } : {}),
                      ...(edit.caption !== null ? { caption: edit.caption } : {}),
                    },
                  });
                  continue;
                }
                const from = senderOf.get(msg)!;
                const contact = value.contacts?.find((c) => (msg.from && c.wa_id === msg.from) || (msg.from_user_id && c.user_id === msg.from_user_id));
                const contactName = contact?.profile?.name ?? from;
                const { mediaId, mimeType, filename, caption } = getMediaInfo(msg);
                // Meta puede omitir timestamp — un Invalid Date rompería el
                // create de Prisma; se usa "ahora" como respaldo.
                const tsNum = Number(msg.timestamp);
                const timestamp = Number.isFinite(tsNum) && tsNum > 0
                  ? new Date(tsNum * 1000)
                  : new Date();

                await ingestInboundMessage(account.id, {
                  remoteJid: from,
                  wamid: msg.id ?? null,
                  timestamp,
                  type: msg.type,
                  body: getMessageBody(msg),
                  contactName,
                  isGroup: from.includes("@g.us"),
                  mediaId,
                  mimeType,
                  filename,
                  caption,
                  // Botón de plantilla (type "button"): su payload es lo que mandó POST /messages.
                  interactiveReplyId: msg.interactive?.button_reply?.id ?? msg.interactive?.list_reply?.id ?? msg.button?.payload ?? null,
                  replyToWamid: msg.context?.id ?? null,
                  referral: msg.referral ?? null,
                  content: structuredContentOf(msg),
                  metaUserId: msg.from_user_id ?? contact?.user_id ?? null,
                });
              }
            })
          );
        }

        if (value.statuses) {
          await Promise.all(
            value.statuses.map((status) => applyStatusUpdate(account.id, status))
          );
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[webhook] Error procesando payload de WhatsApp:", error);
    // 500 para que Meta reintente (el dedup por wamid hace seguro el reintento).
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
