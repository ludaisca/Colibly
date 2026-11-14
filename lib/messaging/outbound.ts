import type { ChannelAccount, Conversation, Prisma, WAAccount, WAChat } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendWhatsAppMessage } from "@/lib/whatsapp/send";
import { sendInteractiveFlow, sendInteractiveCatalog, sendInteractiveCtaUrl, sendInteractiveList, sendInteractiveLocationRequest, sendInteractiveMessage, type CatalogInteractive, type ProductSection } from "@/lib/whatsapp/send-interactive";
import { MetaAdminError, resolveCatalogId } from "@/lib/whatsapp/account-admin";
import { getMessageBody, structuredContentOf } from "@/lib/whatsapp/message-content";
import { sendTemplateMessage } from "@/lib/whatsapp/send-template";
import { MetaSendError } from "@/lib/whatsapp/send-errors";
import { asReceivedContacts, toMetaContacts, type SharedContactInput } from "@/lib/whatsapp/shared-contacts";
import { OutboundMediaError } from "@/lib/messaging/outbound-media";
import { apiMediaToMetaId, looksLikeApiMediaId } from "@/lib/media/api-media";
import { buildTemplateSend, TemplateParamsError, type TemplateSendInput } from "@/lib/whatsapp/template-send";
import { isWithinServiceWindow } from "@/lib/whatsapp/lead-recovery";
import { sendTelegramMessage, sendTelegramOptions } from "@/lib/telegram/send";
import { sendMetaChannelOptions, sendMetaChannelPrivateReply, sendMetaChannelText } from "@/lib/meta-messaging/send";
import { emitMessageSent } from "@/lib/events/message-sent";
import type { OutboundOrigin } from "@/lib/messages/origin";
import { markReplied } from "@/lib/chats/waiting";
import type { MessageSource } from "@/lib/events/types";
import { assertOrgCanSend } from "@/lib/billing/gates";
import { uploadMedia } from "@/lib/whatsapp";
import { decrypt } from "@/lib/crypto";
import { saveMediaFromBuffer } from "@/lib/whatsapp/media-store";
import { sendTelegramMedia } from "@/lib/telegram/send";
import { sendMetaChannelMedia } from "@/lib/meta-messaging/send";
import type { OutboundMediaFile, OutboundMediaType } from "@/lib/messaging/outbound-media";

// Envío saliente iniciado por el sistema (API pública; en la fase 2 también
// las automatizaciones): manda por el canal que corresponda, persiste el
// mensaje, actualiza el hilo y emite message.sent. Las respuestas manuales del
// inbox siguen en chats/[chatId]/send porque además manejan media subida.

export type OutboundTarget =
  | { kind: "whatsapp"; chat: WAChat & { account: WAAccount } }
  | { kind: "channel"; conversation: Conversation & { channelAccount: ChannelAccount } };

export interface OutboundOption {
  id: string;
  title: string;
  description?: string;
}

export type OutboundContent =
  | { type: "text"; text: string }
  | { type: "buttons"; text: string; buttons: OutboundOption[] }
  | { type: "list"; text: string; buttonLabel: string; rows: OutboundOption[] }
  | ({ type: "template"; templateId: string } & TemplateSendInput)
  // Archivo ya descargado y validado (lib/messaging/outbound-media.ts).
  | { type: "media"; mediaType: OutboundMediaType; file: OutboundMediaFile; caption?: string | null }
  // Solo WhatsApp:
  | { type: "cta_url"; text: string; label: string; url: string }
  | { type: "location"; latitude: number; longitude: number; name?: string | null; address?: string | null }
  | { type: "location_request"; text: string }
  // Tarjetas de contacto (vCard).
  | { type: "contacts"; contacts: SharedContactInput[] }
  // WebP de 512×512 ya validado (fetchOutboundSticker).
  | { type: "sticker"; file: OutboundMediaFile }
  // Catálogo de Meta: sin catalogId se usa el único conectado a la WABA.
  | { type: "product"; productId: string; text?: string | null; footer?: string | null; catalogId?: string | null }
  | { type: "product_list"; header: string; text: string; footer?: string | null; sections: ProductSection[]; catalogId?: string | null }
  | { type: "catalog"; text: string; footer?: string | null; thumbnailProductId?: string | null }
  // WhatsApp Flow publicado (o en borrador con draft).
  | { type: "flow"; flowId: string; cta: string; text: string; header?: string | null; footer?: string | null; flowToken: string; screen?: string | null; data?: Record<string, unknown> | null; draft?: boolean };

/** Tipos que solo existen en WhatsApp; los demás canales responden invalid_request. */
const WHATSAPP_ONLY = new Set<OutboundContent["type"]>(["template", "cta_url", "location", "location_request", "sticker", "product", "product_list", "catalog", "flow", "contacts"]);

// Columnas de medio del mensaje guardado (WAMessage y ChannelMessage las comparten).
interface StoredMediaColumns {
  mediaId: string | null;
  mediaUrl: string;
  mimeType: string;
  filename: string;
  bytesSize: number;
  mediaSha256: string | null;
  caption: string | null;
}

// Forma de interactivePayload en WAMessage y ChannelMessage — la burbuja del
// chat (chat-thread-panel.tsx) dibuja `buttons` igual para botones y listas.
export interface InteractivePayload {
  /** `description`: solo filas de una lista que la traen. */
  buttons: { id: string; title: string; description?: string }[];
  style?: "list" | "cta_url" | "location_request" | "product" | "product_list" | "catalog" | "flow";
  buttonLabel?: string;
  /** cta_url: a dónde lleva el botón. */
  url?: string;
  /** product / product_list: catálogo de Meta; `buttons` son los productos (id = product_retailer_id). */
  catalogId?: string;
  /** flow: el Flow de Meta y el token con que vuelve la respuesta (flow.completed). */
  flowId?: string;
  flowToken?: string;
}

export function payloadFor(content: Extract<OutboundContent, { type: "buttons" | "list" }>): InteractivePayload {
  return content.type === "buttons"
    ? { buttons: content.buttons.map(({ id, title }) => ({ id, title })) }
    : {
        buttons: content.rows.map(({ id, title, description }) => ({ id, title, ...(description ? { description } : {}) })),
        style: "list",
        buttonLabel: content.buttonLabel,
      };
}

export class OutboundError extends Error {
  constructor(
    public readonly code: "window_closed" | "invalid_request" | "not_found" | "upstream_error",
    message: string,
    /** Código de error de Meta cuando Graph rechazó el envío (upstream_error). */
    public readonly metaCode: number | null = null
  ) {
    super(message);
  }
}

export interface OutboundOpts {
  source: MessageSource;
  senderId?: string | null;
  /**
   * ¿Este envío contesta al cliente? (default true). Los avisos automáticos
   * —fuera de horario, auto-resolver— pasan false para que el chat siga en
   * "Esperando respuesta". Ver lib/chats/waiting.ts. Tampoco cambian la
   * vista previa (`lastMessage`) ni `lastMessageAt` del chat.
   */
  countsAsReply?: boolean;
  /** `origin` público del mensaje; por defecto se deduce de source/countsAsReply. */
  origin?: OutboundOrigin;
  /** Solo WhatsApp: cita ese mensaje (context.message_id de Meta). */
  replyToWamid?: string | null;
}

// Lo que se guarda en `sentVia` y viaja en message.sent (lib/messages/origin.ts).
export function outboundOriginOf(opts: OutboundOpts): OutboundOrigin {
  if (opts.origin) return opts.origin;
  if (opts.source === "agent") return "agent";
  if (opts.source === "api") return "api";
  return opts.countsAsReply === false ? "system" : "automation";
}

export interface OutboundResult {
  messageId: string;
  externalId: string | null;
}

// Ventana de 24 h de Meta: texto libre (y botones) solo dentro de las 24 h
// posteriores al último mensaje del cliente. Las plantillas están exentas.
async function assertServiceWindow(chatId: string, content: OutboundContent, now: Date): Promise<void> {
  if (content.type === "template") return;
  const lastInbound = await prisma.wAMessage.findFirst({
    where: { chatId, direction: "INBOUND" },
    orderBy: { timestamp: "desc" },
    select: { timestamp: true },
  });
  if (!lastInbound || !isWithinServiceWindow(lastInbound.timestamp, now)) {
    throw new OutboundError("window_closed", "Fuera de la ventana de 24 h de WhatsApp: solo se puede enviar una plantilla aprobada.");
  }
}

/** Lo que un canal que no es WhatsApp no puede mandar (mismo texto que sendChannel). */
function assertChannelSupports(content: OutboundContent, opts: Pick<OutboundOpts, "replyToWamid">): void {
  if (content.type === "template") throw new OutboundError("invalid_request", "Las plantillas solo existen en WhatsApp");
  if (WHATSAPP_ONLY.has(content.type)) throw new OutboundError("invalid_request", `El tipo "${content.type}" solo se puede enviar por WhatsApp`);
  if (opts.replyToWamid) throw new OutboundError("invalid_request", "Citar un mensaje (replyTo) solo está disponible en WhatsApp");
}

/** Plantilla aprobada de la cuenta, con sus componentes de envío ya armados. */
async function loadTemplateSend(accountId: string, content: Extract<OutboundContent, { type: "template" }>) {
  const template = await prisma.wATemplate.findFirst({ where: { id: content.templateId, waAccountId: accountId } });
  if (!template) throw new OutboundError("not_found", "Plantilla no encontrada en esta cuenta");
  if (template.status !== "APPROVED") {
    throw new OutboundError("invalid_request", `La plantilla "${template.name}" no está aprobada (${template.status})`);
  }
  try {
    return { template, built: buildTemplateSend(template.components, template.category, content) };
  } catch (err) {
    if (err instanceof TemplateParamsError) throw new OutboundError("invalid_request", err.message);
    throw err;
  }
}

/**
 * Cabeceras de plantilla (y tarjetas de carrusel) con un id de POST /media:
 * se sube el archivo al número y se cambia por el media id de Meta.
 */
async function resolveTemplateMedia(account: WAAccount, components: Record<string, unknown>[]): Promise<Record<string, unknown>[]> {
  const cache = new Map<string, string>();
  const fixParams = async (params: unknown) => {
    if (!Array.isArray(params)) return params;
    return Promise.all(
      params.map(async (p: Record<string, unknown>) => {
        const kind = typeof p.type === "string" ? p.type : "";
        const media = p[kind] as { id?: string } | undefined;
        if (!media?.id || !looksLikeApiMediaId(media.id)) return p;
        let metaId = cache.get(media.id);
        if (!metaId) {
          try {
            metaId = await apiMediaToMetaId(account, media.id);
          } catch (err) {
            if (err instanceof OutboundMediaError) throw new OutboundError("invalid_request", err.message);
            throw err;
          }
          cache.set(media.id, metaId);
        }
        return { ...p, [kind]: { id: metaId } };
      })
    );
  };
  const fix = async (list: Record<string, unknown>[]): Promise<Record<string, unknown>[]> =>
    Promise.all(
      list.map(async (c) => {
        if (c.type === "header") return { ...c, parameters: await fixParams(c.parameters) };
        if (c.type === "carousel" && Array.isArray(c.cards)) {
          const cards = await Promise.all((c.cards as Record<string, unknown>[]).map(async (card) => ({ ...card, components: await fix(card.components as Record<string, unknown>[]) })));
          return { ...c, cards };
        }
        return c;
      })
    );
  return fix(components);
}

export interface OutboundPreview {
  type: OutboundContent["type"];
  text: string | null;
  template: { name: string; language: string; components: Record<string, unknown>[] } | null;
}

/**
 * Lo que saldría, sin mandarlo ni guardarlo (keys de prueba). Mismas reglas
 * que sendOutbound: ventana de 24 h, tipos por canal y parámetros de la
 * plantilla. `target` null = chat que el envío abriría (solo plantillas).
 */
export async function previewOutbound(
  target: OutboundTarget | { kind: "new_whatsapp_chat"; accountId: string },
  content: OutboundContent,
  opts: Pick<OutboundOpts, "replyToWamid"> = {}
): Promise<OutboundPreview> {
  if (target.kind === "channel") assertChannelSupports(content, opts);
  if (target.kind === "whatsapp") await assertServiceWindow(target.chat.id, content, new Date());
  if (content.type === "template") {
    const accountId = target.kind === "whatsapp" ? target.chat.accountId : target.kind === "new_whatsapp_chat" ? target.accountId : "";
    const { template, built } = await loadTemplateSend(accountId, content);
    return { type: "template", text: built.text || null, template: { name: template.name, language: template.language, components: built.components } };
  }
  const text = "text" in content && typeof content.text === "string" ? content.text : content.type === "media" ? content.caption ?? null : null;
  return { type: content.type, text, template: null };
}

export async function sendOutbound(
  target: OutboundTarget,
  content: OutboundContent,
  opts: OutboundOpts
): Promise<OutboundResult> {
  // Antes que la ventana de 24 h y que el widget web (que no pasa por ningún
  // emisor externo): en solo lectura no sale nada.
  await assertOrgCanSend(target.kind === "whatsapp" ? target.chat.account.organizationId : target.conversation.channelAccount.organizationId);
  return target.kind === "whatsapp"
    ? sendWhatsapp(target.chat, content, opts)
    : sendChannel(target.conversation, content, opts);
}

async function sendWhatsapp(
  chat: WAChat & { account: WAAccount },
  content: OutboundContent,
  opts: OutboundOpts
): Promise<OutboundResult> {
  const now = new Date();

  await assertServiceWindow(chat.id, content, now);

  let wamid: string | null;
  let body: string;
  let messageType = "text";
  let interactivePayload: InteractivePayload | undefined;
  let media: StoredMediaColumns | null = null;
  let structured: Prisma.InputJsonObject | undefined;
  const replyToWamid = opts.replyToWamid ?? undefined;

  try {
    if (content.type === "media" || content.type === "sticker") {
      if (!chat.account.phoneNumberId || !chat.account.accessToken) {
        throw new OutboundError("invalid_request", "La cuenta de WhatsApp no está conectada");
      }
      const { buffer, mimeType, filename } = content.file;
      const mediaType = content.type === "sticker" ? "sticker" : content.mediaType;
      const caption = content.type === "media" ? content.caption ?? null : null;
      // Dos pasos de Meta: subir el archivo (media id) y mandar el mensaje con él.
      const uploaded = await uploadMedia(chat.account.phoneNumberId, decrypt(chat.account.accessToken), buffer, filename, mimeType);
      const stored = await saveMediaFromBuffer(chat.accountId, buffer, mimeType);
      ({ wamid } = await sendWhatsAppMessage(chat.account, {
        to: chat.remoteJid,
        type: mediaType,
        mediaId: uploaded.id,
        caption: caption ?? undefined,
        mimeType,
        filename,
        localMediaPath: stored.relativePath,
        replyToWamid,
      }));
      media = { mediaId: uploaded.id, mediaUrl: stored.relativePath, mimeType, filename, bytesSize: buffer.length, mediaSha256: stored.sha256 ?? null, caption };
      body = caption || `[${mediaType}]`;
      messageType = mediaType;
    } else if (content.type === "text") {
      ({ wamid } = await sendWhatsAppMessage(chat.account, { to: chat.remoteJid, type: "text", body: content.text, replyToWamid }));
      body = content.text;
    } else if (content.type === "contacts") {
      const contacts = toMetaContacts(content.contacts);
      ({ wamid } = await sendWhatsAppMessage(chat.account, { to: chat.remoteJid, type: "contacts", contacts, replyToWamid }));
      const received = asReceivedContacts(content.contacts);
      body = getMessageBody({ type: "contacts", contacts: received });
      structured = (structuredContentOf({ type: "contacts", contacts: received }) ?? undefined) as Prisma.InputJsonObject | undefined;
      messageType = "contacts";
    } else if (content.type === "location") {
      const location = { latitude: content.latitude, longitude: content.longitude, name: content.name ?? undefined, address: content.address ?? undefined };
      ({ wamid } = await sendWhatsAppMessage(chat.account, { to: chat.remoteJid, type: "location", location, replyToWamid }));
      // Igual que una ubicación entrante: texto legible en body y coordenadas en content.
      body = getMessageBody({ type: "location", location });
      structured = (structuredContentOf({ type: "location", location }) ?? undefined) as Prisma.InputJsonObject | undefined;
      messageType = "location";
    } else if (content.type === "buttons") {
      ({ wamid } = await sendInteractiveMessage(chat.account, {
        to: chat.remoteJid,
        body: content.text,
        buttons: content.buttons.map(({ id, title }) => ({ id, title })),
        replyToWamid,
      }));
      body = content.text;
      messageType = "interactive";
      interactivePayload = payloadFor(content);
    } else if (content.type === "list") {
      ({ wamid } = await sendInteractiveList(chat.account, {
        to: chat.remoteJid,
        body: content.text,
        buttonLabel: content.buttonLabel,
        rows: content.rows,
        replyToWamid,
      }));
      body = content.text;
      messageType = "interactive";
      interactivePayload = payloadFor(content);
    } else if (content.type === "cta_url") {
      ({ wamid } = await sendInteractiveCtaUrl(chat.account, { to: chat.remoteJid, body: content.text, label: content.label, url: content.url, replyToWamid }));
      body = content.text;
      messageType = "interactive";
      interactivePayload = { buttons: [{ id: "cta_url", title: content.label }], style: "cta_url", url: content.url };
    } else if (content.type === "product" || content.type === "product_list" || content.type === "catalog") {
      const footer = content.footer ?? undefined;
      let message: CatalogInteractive;
      if (content.type === "catalog") {
        message = { kind: "catalog", body: content.text, footer, thumbnailProductId: content.thumbnailProductId ?? undefined };
        interactivePayload = { buttons: [{ id: "catalog", title: "Ver catálogo" }], style: "catalog" };
        body = content.text;
      } else {
        const catalogId = await resolveCatalogId(chat.account, content.catalogId);
        if (content.type === "product") {
          message = { kind: "product", catalogId, productId: content.productId, body: content.text ?? undefined, footer };
          interactivePayload = { buttons: [{ id: content.productId, title: content.productId }], style: "product", catalogId };
          body = content.text || `🛍️ Producto ${content.productId}`;
        } else {
          message = { kind: "product_list", catalogId, header: content.header, body: content.text, footer, sections: content.sections };
          interactivePayload = {
            buttons: content.sections.flatMap((s) => s.productIds.map((id) => ({ id, title: id, description: s.title }))),
            style: "product_list",
            buttonLabel: content.header,
            catalogId,
          };
          body = content.text;
        }
      }
      ({ wamid } = await sendInteractiveCatalog(chat.account, { to: chat.remoteJid, message, replyToWamid }));
      messageType = "interactive";
    } else if (content.type === "flow") {
      ({ wamid } = await sendInteractiveFlow(chat.account, {
        to: chat.remoteJid,
        flow: {
          flowId: content.flowId,
          cta: content.cta,
          body: content.text,
          header: content.header ?? undefined,
          footer: content.footer ?? undefined,
          flowToken: content.flowToken,
          screen: content.screen ?? undefined,
          data: content.data ?? undefined,
          draft: content.draft,
        },
        replyToWamid,
      }));
      body = content.text;
      messageType = "interactive";
      interactivePayload = { buttons: [{ id: content.flowId, title: content.cta }], style: "flow", flowId: content.flowId, flowToken: content.flowToken };
    } else if (content.type === "location_request") {
      ({ wamid } = await sendInteractiveLocationRequest(chat.account, { to: chat.remoteJid, body: content.text, replyToWamid }));
      body = content.text;
      messageType = "interactive";
      interactivePayload = { buttons: [{ id: "send_location", title: "Enviar ubicación" }], style: "location_request" };
    } else {
      const { template, built } = await loadTemplateSend(chat.accountId, content);
      const components = await resolveTemplateMedia(chat.account, built.components);
      ({ wamid } = await sendTemplateMessage(chat.account, {
        to: chat.remoteJid,
        templateName: template.name,
        language: template.language,
        components,
        replyToWamid: replyToWamid ?? null,
      }));
      body = built.text || `Plantilla: ${template.name}`;
      messageType = "template";
    }
  } catch (err) {
    if (err instanceof OutboundError) throw err;
    // Sin catálogo conectado (o con varios y sin catalogId): error del integrador.
    if (err instanceof MetaAdminError && err.httpStatus === 422) throw new OutboundError("invalid_request", err.message);
    throw new OutboundError(
      "upstream_error",
      err instanceof Error ? err.message : String(err),
      err instanceof MetaSendError ? err.metaCode : null
    );
  }

  const message = await prisma.wAMessage.create({
    data: {
      wamid: wamid ?? undefined,
      chatId: chat.id,
      direction: "OUTBOUND",
      messageType,
      // Un medio guarda su leyenda en caption; body queda vacío como en la bandeja.
      body: media ? null : body,
      ...(media ?? {}),
      interactivePayload: interactivePayload as Prisma.InputJsonObject | undefined,
      content: structured,
      replyToWamid: replyToWamid ?? null,
      status: "sent",
      senderId: opts.senderId ?? null,
      sentVia: outboundOriginOf(opts),
      timestamp: now,
    },
    select: { id: true },
  });
  // Un aviso automático (countsAsReply: false: fuera de horario, auto-resolver)
  // no pisa la vista previa ni la hora del chat: la bandeja sigue mostrando lo
  // último que dijo el cliente, y el aviso tampoco reinicia la inactividad.
  if (opts.countsAsReply !== false) {
    await prisma.wAChat.update({
      where: { id: chat.id },
      data: { lastMessage: body.slice(0, 500), lastMessageAt: now },
    });
  }
  await prisma.wAAccount.update({ where: { id: chat.accountId }, data: { lastActivity: now } });
  if (opts.countsAsReply !== false) await markReplied("whatsapp", chat.id);

  await emitMessageSent("whatsapp", message.id, outboundOriginOf(opts));

  return { messageId: message.id, externalId: wamid };
}

async function sendChannel(
  conversation: Conversation & { channelAccount: ChannelAccount },
  content: OutboundContent,
  opts: OutboundOpts
): Promise<OutboundResult> {
  const { channelAccount } = conversation;
  assertChannelSupports(content, opts);
  if (content.type === "media") return sendChannelMedia(conversation, content, opts);
  if (content.type !== "text" && content.type !== "buttons" && content.type !== "list") {
    throw new OutboundError("invalid_request", `El tipo "${content.type}" solo se puede enviar por WhatsApp`);
  }

  const now = new Date();
  const text = content.text;
  const options = content.type === "buttons" ? content.buttons : content.type === "list" ? content.rows : null;
  const interactivePayload = content.type === "text" ? undefined : payloadFor(content);
  let externalId: string | null = null;
  try {
    if (channelAccount.channel === "TELEGRAM") {
      ({ externalMessageId: externalId } = options
        ? await sendTelegramOptions(channelAccount, { to: conversation.externalId, body: text, options })
        : await sendTelegramMessage(channelAccount, { to: conversation.externalId, body: text }));
    } else if (channelAccount.channel === "MESSENGER" || channelAccount.channel === "INSTAGRAM") {
      // Conversación que nació de un comentario y aún no tiene respuesta: Meta
      // exige el endpoint de private reply (mismo criterio que
      // chats/[chatId]/send — ver docs/arquitectura/canales.md "Comment-to-inbox"). Ese endpoint
      // no admite quick replies: van las opciones numeradas en el texto.
      const originComment =
        channelAccount.channel === "MESSENGER" && conversation.firstResponseAt === null
          ? await prisma.channelMessage.findFirst({
              where: { conversationId: conversation.id, direction: "INBOUND", isFromComment: true },
              orderBy: { timestamp: "desc" },
              select: { externalMessageId: true },
            })
          : null;
      if (originComment?.externalMessageId) {
        const withMenu = options ? `${text}\n\n${options.map((o, i) => `${i + 1}. ${o.title}`).join("\n")}` : text;
        ({ externalMessageId: externalId } = await sendMetaChannelPrivateReply(channelAccount, {
          commentId: originComment.externalMessageId,
          body: withMenu,
        }));
      } else {
        ({ externalMessageId: externalId } = options
          ? await sendMetaChannelOptions(channelAccount, { to: conversation.externalId, body: text, options })
          : await sendMetaChannelText(channelAccount, { to: conversation.externalId, body: text }));
      }
    }
    // WEBCHAT: no hay API externa — el ChannelMessage de abajo ES la entrega
    // (el widget lo recoge por polling y dibuja los botones de
    // interactivePayload), igual que lib/channel-send.ts.
  } catch (err) {
    throw new OutboundError("upstream_error", err instanceof Error ? err.message : String(err));
  }

  return persistChannelOutbound(conversation, opts, now, {
    externalMessageId: externalId,
    messageType: options ? "interactive" : "text",
    body: text,
    preview: text,
    interactivePayload,
    media: null,
  });
}

/**
 * Reglas de canal para un archivo, sin red: el chat web no recibe archivos y
 * Messenger/Instagram no muestran caption. La API la llama antes de descargar
 * la URL (para no bajar un archivo que no va a salir); sendChannelMedia, otra vez.
 */
export function assertMediaSupported(target: OutboundTarget, caption: string | null | undefined): void {
  if (target.kind === "whatsapp") return;
  const channel = target.conversation.channelAccount.channel;
  if (channel === "WEBCHAT") {
    throw new OutboundError("invalid_request", "El chat web todavía no recibe archivos: envía un texto con el enlace");
  }
  if ((channel === "MESSENGER" || channel === "INSTAGRAM") && caption?.trim()) {
    throw new OutboundError("invalid_request", "Messenger e Instagram no muestran texto junto a un archivo: quita caption y mándalo como mensaje aparte");
  }
}

async function sendChannelMedia(
  conversation: Conversation & { channelAccount: ChannelAccount },
  content: Extract<OutboundContent, { type: "media" }>,
  opts: OutboundOpts
): Promise<OutboundResult> {
  const { channelAccount } = conversation;
  const { buffer, mimeType, filename } = content.file;
  const caption = content.caption?.trim() || null;
  assertMediaSupported({ kind: "channel", conversation }, caption);
  if (channelAccount.channel === "MESSENGER" && conversation.firstResponseAt === null) {
    const fromComment = await prisma.channelMessage.findFirst({
      where: { conversationId: conversation.id, direction: "INBOUND", isFromComment: true },
      select: { id: true },
    });
    if (fromComment) {
      throw new OutboundError("invalid_request", "La primera respuesta a un comentario de Facebook solo puede ser texto (respuesta privada de Meta)");
    }
  }

  const now = new Date();
  let externalId: string | null = null;
  let mediaId: string | null = null;
  try {
    if (channelAccount.channel === "TELEGRAM") {
      const r = await sendTelegramMedia(channelAccount, { to: conversation.externalId, type: content.mediaType, buffer, filename, mimeType, caption: caption ?? undefined });
      externalId = r.externalMessageId;
      mediaId = r.fileId;
    } else {
      const r = await sendMetaChannelMedia(channelAccount, { to: conversation.externalId, buffer, filename, mimeType });
      externalId = r.externalMessageId;
      mediaId = r.attachmentId;
    }
  } catch (err) {
    throw new OutboundError("upstream_error", err instanceof Error ? err.message : String(err));
  }
  const stored = await saveMediaFromBuffer(channelAccount.id, buffer, mimeType);
  return persistChannelOutbound(conversation, opts, now, {
    externalMessageId: externalId,
    messageType: content.mediaType,
    body: null,
    preview: caption ?? `[${content.mediaType}]`,
    interactivePayload: undefined,
    media: { mediaId, mediaUrl: stored.relativePath, mimeType, filename, bytesSize: buffer.length, mediaSha256: stored.sha256 ?? null, caption },
  });
}

async function persistChannelOutbound(
  conversation: Conversation & { channelAccount: ChannelAccount },
  opts: OutboundOpts,
  now: Date,
  row: {
    externalMessageId: string | null;
    messageType: string;
    body: string | null;
    preview: string;
    interactivePayload: InteractivePayload | undefined;
    media: StoredMediaColumns | null;
  }
): Promise<OutboundResult> {
  const { channelAccount } = conversation;
  const externalId = row.externalMessageId;
  const interactivePayload = row.interactivePayload;
  const text = row.preview;
  const message = await prisma.channelMessage.create({
    data: {
      externalMessageId: externalId,
      conversationId: conversation.id,
      direction: "OUTBOUND",
      messageType: row.messageType,
      body: row.body,
      ...(row.media ?? {}),
      interactivePayload: interactivePayload as Prisma.InputJsonObject | undefined,
      status: "sent",
      senderId: opts.senderId ?? null,
      sentVia: outboundOriginOf(opts),
      timestamp: now,
    },
    select: { id: true },
  });
  if (opts.countsAsReply !== false) {
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessage: text.slice(0, 500), lastMessageAt: now },
    });
  }
  await prisma.channelAccount.update({ where: { id: channelAccount.id }, data: { lastActivity: now } });
  if (opts.countsAsReply !== false) await markReplied("channel", conversation.id);

  await emitMessageSent("channel", message.id, outboundOriginOf(opts));

  return { messageId: message.id, externalId };
}
