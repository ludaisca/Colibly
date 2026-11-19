import type { Prisma, RecipientStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { emitDomainEvent } from "@/lib/events/emit";
import { ingestInboundMessage } from "@/lib/whatsapp/ingest-message";
import { applyReactionStatus } from "@/lib/whatsapp/reactions";
import { metaSendErrorMessage } from "@/lib/whatsapp/send-errors";
import { isMediaTooLargeStatus, recordMediaTooLarge } from "@/lib/whatsapp/media-too-large";
import { getMediaInfo, getMessageBody, parseMessageEdit, structuredContentOf, type WhatsAppMessageContent } from "@/lib/whatsapp/message-content";

// Mensajes y estados del webhook de WhatsApp (campo `messages`). La ruta
// (app/api/whatsapp/webhook) valida la firma y encola el `value` en
// `whatsapp-inbound`; el worker llama a processMessagesValue(). Si Redis no
// responde, la ruta lo procesa en línea con la misma función. Idempotente:
// la ingesta deduplica por wamid y los estados solo avanzan (STATUS_RANK).

// El contenido (texto, medios, ubicación, contactos, pedido, contexto…) tiene
// la misma forma en `messages`, `smb_message_echoes` e `history`: vive en
// lib/whatsapp/message-content.ts. Aquí solo va lo propio del entrante.
export interface WebhookMessage extends WhatsAppMessageContent {
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

export interface WebhookStatus {
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

export interface WebhookValue {
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

export async function applyStatusUpdate(accountId: string, status: WebhookStatus): Promise<void> {
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

/** Procesa un `value` de `messages` ya autenticado: mensajes entrantes, reacciones, ediciones y estados. */
export async function processMessagesValue(accountId: string, value: WebhookValue): Promise<void> {
  await prisma.wAAccount.update({
    where: { id: accountId },
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
        where: { accountId: accountId, metaUserId: msg.from_user_id },
        select: { remoteJid: true },
      });
      if (!known) console.warn(`[webhook] Mensaje sin número (solo user_id) en la cuenta ${accountId}: se guarda con el user_id como remitente`);
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
              where: { wamid: targetWamid, chat: { accountId: accountId, remoteJid: senderOf.get(msg) } },
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
              where: { wamid: edit.originalMessageId, chat: { accountId: accountId, remoteJid: senderOf.get(msg) } },
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

          await ingestInboundMessage(accountId, {
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
      value.statuses.map((status) => applyStatusUpdate(accountId, status))
    );
  }
}
