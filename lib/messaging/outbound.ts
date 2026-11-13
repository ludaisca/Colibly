import type { ChannelAccount, Conversation, Prisma, WAAccount, WAChat } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendWhatsAppMessage } from "@/lib/whatsapp/send";
import { sendInteractiveCtaUrl, sendInteractiveList, sendInteractiveLocationRequest, sendInteractiveMessage } from "@/lib/whatsapp/send-interactive";
import { getMessageBody, structuredContentOf } from "@/lib/whatsapp/message-content";
import { sendTemplateMessage } from "@/lib/whatsapp/send-template";
import { MetaSendError } from "@/lib/whatsapp/send-errors";
import { getTemplateVariables, renderTemplateText } from "@/lib/whatsapp/template-variables";
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
  | { type: "template"; templateId: string; bodyParams?: string[]; headerParam?: string | null; buttonParam?: string | null }
  // Archivo ya descargado y validado (lib/messaging/outbound-media.ts).
  | { type: "media"; mediaType: OutboundMediaType; file: OutboundMediaFile; caption?: string | null }
  // Solo WhatsApp:
  | { type: "cta_url"; text: string; label: string; url: string }
  | { type: "location"; latitude: number; longitude: number; name?: string | null; address?: string | null }
  | { type: "location_request"; text: string }
  // WebP de 512×512 ya validado (fetchOutboundSticker).
  | { type: "sticker"; file: OutboundMediaFile };

/** Tipos que solo existen en WhatsApp; los demás canales responden invalid_request. */
const WHATSAPP_ONLY = new Set<OutboundContent["type"]>(["template", "cta_url", "location", "location_request", "sticker"]);

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
  buttons: { id: string; title: string }[];
  style?: "list" | "cta_url" | "location_request";
  buttonLabel?: string;
  /** cta_url: a dónde lleva el botón. */
  url?: string;
}

function payloadFor(content: Extract<OutboundContent, { type: "buttons" | "list" }>): InteractivePayload {
  return content.type === "buttons"
    ? { buttons: content.buttons.map(({ id, title }) => ({ id, title })) }
    : { buttons: content.rows.map(({ id, title }) => ({ id, title })), style: "list", buttonLabel: content.buttonLabel };
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

  // Ventana de 24 h de Meta: texto libre (y botones) solo dentro de las 24 h
  // posteriores al último mensaje del cliente. Las plantillas están exentas.
  if (content.type !== "template") {
    const lastInbound = await prisma.wAMessage.findFirst({
      where: { chatId: chat.id, direction: "INBOUND" },
      orderBy: { timestamp: "desc" },
      select: { timestamp: true },
    });
    if (!lastInbound || !isWithinServiceWindow(lastInbound.timestamp, now)) {
      throw new OutboundError(
        "window_closed",
        "Fuera de la ventana de 24 h de WhatsApp: solo se puede enviar una plantilla aprobada."
      );
    }
  }

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
    } else if (content.type === "location_request") {
      ({ wamid } = await sendInteractiveLocationRequest(chat.account, { to: chat.remoteJid, body: content.text, replyToWamid }));
      body = content.text;
      messageType = "interactive";
      interactivePayload = { buttons: [{ id: "send_location", title: "Enviar ubicación" }], style: "location_request" };
    } else {
      const template = await prisma.wATemplate.findFirst({
        where: { id: content.templateId, waAccountId: chat.accountId },
      });
      if (!template) throw new OutboundError("not_found", "Plantilla no encontrada en esta cuenta");
      if (template.status !== "APPROVED") {
        throw new OutboundError("invalid_request", `La plantilla "${template.name}" no está aprobada (${template.status})`);
      }
      const vars = getTemplateVariables(template.components);
      const bodyParams = content.bodyParams ?? [];
      if (bodyParams.length < vars.bodyParamCount) {
        throw new OutboundError("invalid_request", `La plantilla requiere ${vars.bodyParamCount} parámetro(s) de cuerpo`);
      }
      if (vars.header.required && !content.headerParam) {
        throw new OutboundError("invalid_request", "La plantilla requiere headerParam");
      }
      if (vars.buttonUrl?.required && !content.buttonParam) {
        throw new OutboundError("invalid_request", "La plantilla requiere buttonParam (sufijo del botón URL)");
      }
      ({ wamid } = await sendTemplateMessage(chat.account, {
        to: chat.remoteJid,
        templateName: template.name,
        language: template.language,
        bodyParams,
        headerFormat: vars.header.format,
        headerParam: content.headerParam ?? null,
        buttonIndex: vars.buttonUrl?.index ?? null,
        buttonParam: content.buttonParam ?? null,
        replyToWamid: replyToWamid ?? null,
      }));
      body = renderTemplateText(template.components, { bodyParams, headerParam: content.headerParam });
      messageType = "template";
    }
  } catch (err) {
    if (err instanceof OutboundError) throw err;
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
  if (content.type === "template") {
    throw new OutboundError("invalid_request", "Las plantillas solo existen en WhatsApp");
  }
  if (WHATSAPP_ONLY.has(content.type)) {
    throw new OutboundError("invalid_request", `El tipo "${content.type}" solo se puede enviar por WhatsApp`);
  }
  if (opts.replyToWamid) {
    throw new OutboundError("invalid_request", "Citar un mensaje (replyTo) solo está disponible en WhatsApp");
  }
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
