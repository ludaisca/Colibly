import type { Channel, LeadStatus } from "@prisma/client";
import { displayName } from "@/lib/chats/display-name";
import { prisma } from "@/lib/prisma";
import { botQueue } from "@/lib/queue";
import { sendOutbound, OutboundError, type OutboundContent, type OutboundTarget } from "@/lib/messaging/outbound";
import { afterContactTagAdded, afterLeadStatusChanged } from "@/lib/contacts/side-effects";
import { setCustomFieldsByKey } from "@/lib/contacts/custom-fields";
import { findOrCreateTag } from "@/lib/tags";
import { autoAssignChat } from "@/lib/whatsapp/auto-assign";
import { autoAssignConversation } from "@/lib/telegram/auto-assign";
import { getEligibleAssignees, getEligibleChannelAssignees } from "@/lib/chat-assignees";
import { isWithinBusinessHours } from "@/lib/whatsapp/lead-recovery";
import { scoreChatWithScorer } from "@/lib/whatsapp/lead-scoring";
import { safeFetch } from "@/lib/net/safe-fetch";
import { isFallbackName } from "@/lib/whatsapp/contact-name";
import { emitDomainEvent } from "@/lib/events/emit";
import { BOT_REPLY_DEBOUNCE_MS } from "@/lib/bots/guards";
import { SendFailure, type ExecutorAdapters, type Facts, type OutgoingMessage } from "./executor";
import { aiClassify, aiExtract, aiMatchOption, type AiCallContext } from "./ai";
import type { AccountRef, ChatRef } from "@/lib/events/types";
import { getOrgBusinessHours } from "@/lib/organizations";

// Adaptadores reales del ejecutor: cada efecto contra Prisma y los módulos
// existentes (envío unificado, efectos de CRM compartidos con la UI y la API,
// autoasignación, scoring). Una instancia por avance de ejecución.

export interface RunContext {
  runId: string | null; // null en "Probar" no aplica: la simulación usa adaptadores falsos
  automationId: string;
  ownerId: string; // dueño de la cuenta: paga la IA, recibe avisos por defecto
  organizationId: string;
  account: AccountRef;
  contactId: string;
  chat: ChatRef;
}

export function createRunAdapters(ctx: RunContext): ExecutorAdapters {
  const isWhatsapp = ctx.chat.kind === "whatsapp";
  const aiCtx: AiCallContext = {
    ownerId: ctx.ownerId,
    organizationId: ctx.organizationId,
    automationId: ctx.automationId,
    runId: ctx.runId,
    waChatId: isWhatsapp ? ctx.chat.id : null,
    conversationId: isWhatsapp ? null : ctx.chat.id,
    payer: { channel: ctx.account.kind === "whatsapp" ? { waAccountId: ctx.account.id } : { channelAccountId: ctx.account.id } },
  };
  const channel: Facts["channel"] = ctx.account.kind === "whatsapp" ? "WHATSAPP" : ctx.account.channel;

  const contactOwner = async () =>
    prisma.contact.findUniqueOrThrow({
      where: { id: ctx.contactId },
      select: { id: true, accountId: true, channelAccountId: true, leadOrigin: true, leadStatus: true },
    });

  const target = async (): Promise<OutboundTarget> => {
    if (ctx.chat.kind === "whatsapp") {
      const chat = await prisma.wAChat.findUniqueOrThrow({ where: { id: ctx.chat.id }, include: { account: true } });
      return { kind: "whatsapp", chat };
    }
    const conversation = await prisma.conversation.findUniqueOrThrow({ where: { id: ctx.chat.id }, include: { channelAccount: true } });
    return { kind: "channel", conversation };
  };

  const assignTo = async (userId: string | null, auto: boolean) => {
    if (ctx.chat.kind === "whatsapp") {
      await prisma.wAChat.update({ where: { id: ctx.chat.id }, data: { assignedToId: userId } });
    } else {
      await prisma.conversation.update({ where: { id: ctx.chat.id }, data: { assignedToId: userId } });
    }
    await emitDomainEvent({ type: "conversation.assigned", account: ctx.account, chat: ctx.chat, contactId: ctx.contactId, data: { assignedToId: userId, auto } });
  };

  const currentAssignee = async (): Promise<string | null> =>
    ctx.chat.kind === "whatsapp"
      ? (await prisma.wAChat.findUnique({ where: { id: ctx.chat.id }, select: { assignedToId: true } }))?.assignedToId ?? null
      : (await prisma.conversation.findUnique({ where: { id: ctx.chat.id }, select: { assignedToId: true } }))?.assignedToId ?? null;

  const eligible = async () =>
    ctx.account.kind === "whatsapp" ? getEligibleAssignees(ctx.account.id) : getEligibleChannelAssignees(ctx.account.id);

  const notify = async (userId: string, title: string, body: string) => {
    await prisma.notification.create({
      data: { userId, type: "CHAT_MESSAGE", title, body: body.slice(0, 500), link: `/whatsapp/chat/${ctx.account.id}/${ctx.chat.id}` },
    });
  };

  return {
    now: () => new Date(),

    async facts() {
      const contact = await prisma.contact.findUniqueOrThrow({
        where: { id: ctx.contactId },
        select: {
          name: true,
          realName: true,
          remoteJid: true,
          leadStatus: true,
          tags: { select: { tag: { select: { name: true } } } },
          customFieldValues: { select: { value: true, definition: { select: { key: true } } } },
        },
      });
      const scores = await prisma.wALeadScore.findMany({
        where: isWhatsapp ? { chatId: ctx.chat.id } : { conversationId: ctx.chat.id },
        select: { label: true },
      });
      return {
        // Un nombre de respaldo (el teléfono, o el id de visitante del widget)
        // no es un nombre: {{nombre}} queda vacío en vez de "Hola 5215512…".
        contact: {
          name: contact.realName ?? (isFallbackName(contact.name, contact.remoteJid) ? null : contact.name),
          phone: isWhatsapp ? contact.remoteJid : null,
        },
        customFields: Object.fromEntries(contact.customFieldValues.map((v) => [v.definition.key, v.value])),
        tags: contact.tags.map((t) => t.tag.name),
        leadStatus: contact.leadStatus,
        scoreLabels: scores.map((s) => s.label),
        channel,
      };
    },

    async lastInboundText() {
      const last = isWhatsapp
        ? await prisma.wAMessage.findFirst({ where: { chatId: ctx.chat.id, direction: "INBOUND" }, orderBy: { timestamp: "desc" }, select: { body: true } })
        : await prisma.channelMessage.findFirst({ where: { conversationId: ctx.chat.id, direction: "INBOUND" }, orderBy: { timestamp: "desc" }, select: { body: true } });
      return last?.body ?? "";
    },

    async isBusinessHours() {
      return isWithinBusinessHours(new Date(), await getOrgBusinessHours(ctx.organizationId));
    },

    async send(message: OutgoingMessage) {
      const content: OutboundContent =
        message.type === "text"
          ? { type: "text", text: message.text }
          : message.type === "buttons"
            ? { type: "buttons", text: message.text, buttons: message.options }
            : message.type === "list"
              ? { type: "list", text: message.text, buttonLabel: message.buttonLabel, rows: message.options }
              : { type: "template", templateId: message.templateId, bodyParams: message.bodyParams, headerParam: message.headerParam, buttonParam: message.buttonParam };
      try {
        await sendOutbound(await target(), content, { source: "automation" });
      } catch (err) {
        if (!(err instanceof OutboundError)) throw err;
        if (err.code === "window_closed") throw new SendFailure("window_closed", err.message);
        if (err.code === "upstream_error") throw new SendFailure("retryable", err.message);
        throw new SendFailure("permanent", err.message);
      }
    },

    async addTag(name) {
      const contact = await contactOwner();
      const tag = await findOrCreateTag(contact, name);
      const existing = await prisma.contactTag.findUnique({ where: { contactId_tagId: { contactId: contact.id, tagId: tag.id } } });
      if (existing) return;
      await prisma.contactTag.create({ data: { contactId: contact.id, tagId: tag.id } });
      await afterContactTagAdded(contact.id, tag);
    },

    async removeTag(name) {
      const contact = await contactOwner();
      await prisma.contactTag.deleteMany({
        where: {
          contactId: contact.id,
          tag: {
            name: { equals: name.trim(), mode: "insensitive" },
            ...(contact.accountId ? { waAccountId: contact.accountId } : { channelAccountId: contact.channelAccountId }),
          },
        },
      });
    },

    async setLeadStatus(status) {
      const contact = await contactOwner();
      if (contact.leadStatus === status) return;
      await prisma.contact.update({ where: { id: contact.id }, data: { leadStatus: status as LeadStatus } });
      await afterLeadStatusChanged(contact, contact.leadStatus, status as LeadStatus);
    },

    async setCustomField(key, value) {
      const contact = await contactOwner();
      const { unknownKeys } = await setCustomFieldsByKey(contact, { [key]: value });
      if (unknownKeys.length > 0) throw new Error(`El campo personalizado "${key}" ya no existe en esta cuenta`);
    },

    async assign(mode, userId) {
      if (mode === "auto") {
        const assigned =
          ctx.chat.kind === "whatsapp" ? await autoAssignChat(ctx.account.id, ctx.chat.id) : await autoAssignConversation(ctx.account.id, ctx.chat.id);
        if (assigned) await emitDomainEvent({ type: "conversation.assigned", account: ctx.account, chat: ctx.chat, contactId: ctx.contactId, data: { assignedToId: assigned, auto: true } });
        return;
      }
      if (!userId || !(await eligible()).some((u) => u.id === userId)) {
        throw new Error("El usuario elegido ya no tiene acceso a esta cuenta");
      }
      await assignTo(userId, false);
    },

    async notifyTeam(targetKind, userId, title, body) {
      const to = targetKind === "user" ? userId : ((await currentAssignee()) ?? ctx.ownerId);
      if (!to) return;
      if (targetKind === "user" && !(await eligible()).some((u) => u.id === to)) return;
      await notify(to, title, body);
    },

    aiClassify: (input) => aiClassify(aiCtx, input),
    aiExtract: (input) => aiExtract(aiCtx, input),
    aiMatchOption: (options, text) => aiMatchOption(aiCtx, options, text),

    async scoreLead(scorerId) {
      if (channel !== "WHATSAPP" && channel !== "TELEGRAM") throw new Error("La calificación solo está disponible en WhatsApp y Telegram");
      const scorer = await prisma.wALeadScorerBot.findFirst({ where: { id: scorerId, organizationId: ctx.organizationId, isActive: true } });
      if (!scorer) throw new Error("El calificador ya no existe o está inactivo");
      await scoreChatWithScorer(ctx.chat.id, scorer, channel === "WHATSAPP" ? "WHATSAPP" : "TELEGRAM");
    },

    async webhook({ url, method, body }) {
      const res = await safeFetch(url, {
        method,
        headers: { "Content-Type": "application/json", "X-Colibly-Automation": ctx.automationId },
        body: method === "POST" ? body : undefined,
        maxResponseBytes: 32 * 1024,
      });
      let data: Record<string, unknown> | null = null;
      try {
        const parsed = JSON.parse(res.body);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) data = parsed as Record<string, unknown>;
      } catch {
        // Respuesta no JSON: solo se guarda el status.
      }
      return { status: res.status, data };
    },

    async handToBot() {
      const bot = await prisma.wABot.findFirst({
        where: {
          ...(ctx.account.kind === "whatsapp" ? { waAccountId: ctx.account.id } : { channelAccountId: ctx.account.id }),
          isActive: true,
          status: "ACTIVE",
        },
        orderBy: { updatedAt: "desc" },
        select: { id: true },
      });
      if (!bot) throw new Error("La cuenta no tiene un bot IA activo al que pasar la conversación");
      // El bot responde al último mensaje del cliente, igual que desde la ingesta.
      if (isWhatsapp) {
        const last = await prisma.wAMessage.findFirst({
          where: { chatId: ctx.chat.id, direction: "INBOUND" },
          orderBy: { timestamp: "desc" },
          select: { id: true, body: true, messageType: true },
        });
        if (!last) return;
        await botQueue.add("process-message", {
          botId: bot.id,
          waChatId: ctx.chat.id,
          incomingMessage: last.body ?? "",
          messageId: last.id,
          messageType: last.messageType,
        }, { delay: BOT_REPLY_DEBOUNCE_MS });
      } else {
        const last = await prisma.channelMessage.findFirst({
          where: { conversationId: ctx.chat.id, direction: "INBOUND" },
          orderBy: { timestamp: "desc" },
          select: { id: true, body: true, messageType: true },
        });
        if (!last) return;
        await botQueue.add("process-message", {
          botId: bot.id,
          channel: (ctx.account as { channel: Channel }).channel,
          conversationId: ctx.chat.id,
          incomingMessage: last.body ?? "",
          messageId: last.id,
          messageType: last.messageType,
        }, { delay: BOT_REPLY_DEBOUNCE_MS });
      }
    },

    async handoff({ assign }) {
      let assignee = await currentAssignee();
      if (!assignee && assign === "auto") {
        assignee =
          ctx.chat.kind === "whatsapp" ? await autoAssignChat(ctx.account.id, ctx.chat.id) : await autoAssignConversation(ctx.account.id, ctx.chat.id);
      }
      const contact = await prisma.contact.findUnique({ where: { id: ctx.contactId }, select: { name: true, realName: true, remoteJid: true } });
      await notify(assignee ?? ctx.ownerId, `${contact ? displayName(contact.realName ?? contact.name, contact.remoteJid) : "Un contacto"} necesita atención`, "Una automatización pasó la conversación a un humano.");
    },
  };
}
