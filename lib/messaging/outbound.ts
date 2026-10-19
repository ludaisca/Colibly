import type { ChannelAccount, Conversation, Prisma, WAAccount, WAChat } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendWhatsAppMessage } from "@/lib/whatsapp/send";
import { sendInteractiveList, sendInteractiveMessage } from "@/lib/whatsapp/send-interactive";
import { sendTemplateMessage } from "@/lib/whatsapp/send-template";
import { MetaSendError } from "@/lib/whatsapp/send-errors";
import { getTemplateVariables, renderTemplateText } from "@/lib/whatsapp/template-variables";
import { isWithinServiceWindow } from "@/lib/whatsapp/lead-recovery";
import { sendTelegramMessage, sendTelegramOptions } from "@/lib/telegram/send";
import { sendMetaChannelOptions, sendMetaChannelPrivateReply, sendMetaChannelText } from "@/lib/meta-messaging/send";
import { emitDomainEvent } from "@/lib/events/emit";
import type { MessageSource } from "@/lib/events/types";
import { assertOrgCanSend } from "@/lib/billing/gates";

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
  | { type: "template"; templateId: string; bodyParams?: string[]; headerParam?: string | null; buttonParam?: string | null };

// Forma de interactivePayload en WAMessage y ChannelMessage — la burbuja del
// chat (chat-thread-panel.tsx) dibuja `buttons` igual para botones y listas.
export interface InteractivePayload {
  buttons: { id: string; title: string }[];
  style?: "list";
  buttonLabel?: string;
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

export interface OutboundResult {
  messageId: string;
  externalId: string | null;
}

export async function sendOutbound(
  target: OutboundTarget,
  content: OutboundContent,
  opts: { source: MessageSource; senderId?: string | null }
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
  opts: { source: MessageSource; senderId?: string | null }
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

  try {
    if (content.type === "text") {
      ({ wamid } = await sendWhatsAppMessage(chat.account, { to: chat.remoteJid, type: "text", body: content.text }));
      body = content.text;
    } else if (content.type === "buttons") {
      ({ wamid } = await sendInteractiveMessage(chat.account, {
        to: chat.remoteJid,
        body: content.text,
        buttons: content.buttons.map(({ id, title }) => ({ id, title })),
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
      }));
      body = content.text;
      messageType = "interactive";
      interactivePayload = payloadFor(content);
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
      body,
      interactivePayload: interactivePayload as Prisma.InputJsonObject | undefined,
      status: "sent",
      senderId: opts.senderId ?? null,
      timestamp: now,
    },
    select: { id: true },
  });
  await prisma.wAChat.update({
    where: { id: chat.id },
    data: { lastMessage: body.slice(0, 500), lastMessageAt: now },
  });
  await prisma.wAAccount.update({ where: { id: chat.accountId }, data: { lastActivity: now } });

  await emitDomainEvent({
    type: "message.sent",
    account: { kind: "whatsapp", id: chat.accountId },
    chat: { kind: "whatsapp", id: chat.id },
    contactId: chat.contactId,
    data: {
      messageId: message.id,
      messageType,
      text: body,
      source: opts.source,
      senderId: opts.senderId ?? null,
    },
  });

  return { messageId: message.id, externalId: wamid };
}

async function sendChannel(
  conversation: Conversation & { channelAccount: ChannelAccount },
  content: OutboundContent,
  opts: { source: MessageSource; senderId?: string | null }
): Promise<OutboundResult> {
  const { channelAccount } = conversation;
  if (content.type === "template") {
    throw new OutboundError("invalid_request", "Las plantillas solo existen en WhatsApp");
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
      // chats/[chatId]/send — ver AGENTS.md "Comment-to-inbox"). Ese endpoint
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

  const message = await prisma.channelMessage.create({
    data: {
      externalMessageId: externalId,
      conversationId: conversation.id,
      direction: "OUTBOUND",
      messageType: options ? "interactive" : "text",
      body: text,
      interactivePayload: interactivePayload as Prisma.InputJsonObject | undefined,
      status: "sent",
      senderId: opts.senderId ?? null,
      timestamp: now,
    },
    select: { id: true },
  });
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastMessage: text.slice(0, 500), lastMessageAt: now },
  });
  await prisma.channelAccount.update({ where: { id: channelAccount.id }, data: { lastActivity: now } });

  await emitDomainEvent({
    type: "message.sent",
    account: { kind: "channel", id: channelAccount.id, channel: channelAccount.channel },
    chat: { kind: "channel", id: conversation.id },
    contactId: conversation.contactId,
    data: { messageId: message.id, messageType: options ? "interactive" : "text", text, source: opts.source, senderId: opts.senderId ?? null },
  });

  return { messageId: message.id, externalId };
}
