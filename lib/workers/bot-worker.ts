import { promises as fs } from "fs";
import { emitMessageSent } from "@/lib/events/message-sent";
import { prisma } from "@/lib/prisma";
import { sendWhatsAppMessage } from "@/lib/whatsapp/send";
import { getAIProvider } from "@/lib/ai/factory";
import { searchKnowledge } from "@/lib/ai/rag";
import { getPlatformApiKey, resolvePlatformModel } from "@/lib/ai/platform";
import { wrapUserPrompt, SCOPE_GUARDRAIL } from "@/lib/ai/prompt-sanitizer";
import { buildAppointmentMarkerContract, parseAppointmentMarker } from "@/lib/ai/appointment-marker";
import type { AppointmentProposal } from "@/lib/ai/appointment-marker";
import { reserveAiCredit } from "@/lib/ai/credits";
import { channelHasFeature } from "@/lib/billing/entitlements";
import { transcribeForBot, voiceNoteForBot } from "@/lib/ai/transcribe";
import { getBotSkipReason } from "@/lib/bots/guards";
import { recordBotUsage } from "@/lib/bots/usage";
import { resolveAbsolutePath } from "@/lib/whatsapp/media-store";
import { extractDocumentText } from "@/lib/whatsapp/extract-document-text";
import { splitReply, computeTypingDelay } from "@/lib/whatsapp/humanize";
import { botSendQueue } from "@/lib/queue";
import type { AIMessage, ContentPart } from "@/lib/ai/types";
import { emitDomainEvent } from "@/lib/events/emit";
import { eventRefsForContact } from "@/lib/events/refs";
import { BillingBlockedError, isBotWritable } from "@/lib/billing/gates";
import { getOrgBusinessHours } from "@/lib/organizations";
import { DEFAULT_TIME_ZONE, formatInZone } from "@/lib/format/dates";

interface BotMessageJob {
  botId: string;
  waChatId: string;
  incomingMessage: string;
  messageId?: string;
  messageType?: string;
  mediaId?: string | null;
  localMediaPath?: string | null;
  mimeType?: string | null;
  caption?: string | null;
  filename?: string | null;
}

interface AttemptInfo {
  attemptsMade: number;
  maxAttempts: number;
}

export async function processBotMessageJob(
  job: BotMessageJob,
  attemptInfo: AttemptInfo = { attemptsMade: 0, maxAttempts: 1 }
) {
  // Cuenta en solo lectura (prueba vencida, impago): el bot no responde ni
  // gasta IA. No es un fallo del bot, así que no pasa a ERROR.
  if (!(await isBotWritable(job.botId))) {
    console.info(`[bots] ${job.botId}: organización en solo lectura, no se responde`);
    return;
  }
  try {
    await handleBotMessage(job);
  } catch (err) {
    if (err instanceof BillingBlockedError) return;
    console.error("[bot-worker] Error processing job:", err instanceof Error ? err.message : err);
    const isLastAttempt = attemptInfo.attemptsMade + 1 >= attemptInfo.maxAttempts;
    if (!isLastAttempt) {
      // Rethrow so BullMQ's configured retries (attempts: 3, exponential backoff)
      // actually kick in — a transient network blip shouldn't give up on the
      // first try and leave the lead's message unanswered.
      throw err;
    }
    await failBotAndNotify(
      job.botId,
      job.waChatId,
      err instanceof Error ? err.message : "Error desconocido"
    );
  }
}

// The lead's message must never go fully unanswered just because the AI call
// failed — after retries are exhausted (or immediately for a non-retryable
// failure like a missing API key), mark the bot ERROR, notify the team, and
// still attempt a graceful hand-off message so the lead gets a reply either way.
async function failBotAndNotify(botId: string, waChatId: string, errorMessage: string) {
  const bot = await prisma.wABot
    .update({ where: { id: botId }, data: { status: "ERROR" } })
    .catch(() => null);
  if (bot) {
    await prisma.notification.create({
      data: {
        userId: bot.userId,
        type: "BOT_ERROR",
        title: `Bot "${bot.name}" con error`,
        body: errorMessage.slice(0, 200),
        link: `/whatsapp/chat/${bot.waAccountId}/${waChatId}`,
      },
    });
  }
  await sendFallbackReply(botId, waChatId);
}

// Confirmación cuando el modelo agendó una cita pero no escribió texto visible
// (solo el bloque ```appointment) — ver handleBotMessage.
const APPOINTMENT_ONLY_REPLY = "¡Listo! Tu cita quedó agendada. Si necesitas cambiarla, escríbenos por aquí.";

const FALLBACK_REPLY =
  "Gracias por tu mensaje. Estamos teniendo un inconveniente técnico en este momento — un miembro de nuestro equipo te contactará en breve para continuar la conversación.";

async function sendFallbackReply(botId: string, waChatId: string) {
  try {
    const bot = await prisma.wABot.findUnique({ where: { id: botId }, include: { waAccount: true } });
    const chat = await prisma.wAChat.findUnique({ where: { id: waChatId }, select: { remoteJid: true } });
    if (!bot?.waAccount || !chat) return;

    const now = new Date();
    const sendResult = await sendWhatsAppMessage(bot.waAccount, {
      to: chat.remoteJid,
      type: "text",
      body: FALLBACK_REPLY,
    });

    const [botMessage] = await Promise.all([
      prisma.wAMessage.create({
        data: {
          wamid: sendResult.wamid ?? undefined,
          chatId: waChatId,
          direction: "OUTBOUND",
          sentVia: "bot",
          messageType: "text",
          body: FALLBACK_REPLY,
          status: "sent",
          timestamp: now,
        },
      }),
      prisma.wAChat.update({
        where: { id: waChatId },
        data: { lastMessage: FALLBACK_REPLY.slice(0, 500), lastMessageAt: now },
      }),
    ]);
    await emitMessageSent("whatsapp", botMessage.id, "bot");
  } catch (err) {
    // Best-effort — if even the fallback send fails (e.g. WhatsApp's API is down
    // too), there's nothing more automatic left to try; the BOT_ERROR notification
    // already created is what surfaces this to a human.
    console.error("[bot-worker] No se pudo enviar el mensaje de respaldo:", err instanceof Error ? err.message : err);
  }
}

async function handleBotMessage(job: BotMessageJob) {
  const { botId, waChatId, incomingMessage } = job;

  // Un sticker aislado es una expresión, no una consulta que requiera IA.
  // Se conserva en el historial, sin interpretar su imagen ni gastar créditos.
  if (job.messageType === "sticker" && !job.caption && (!incomingMessage || /^\[sticker(?: recibido)?\]$/i.test(incomingMessage.trim()))) return;

  const bot = await prisma.wABot.findUnique({
    where: { id: botId },
    include: { waAccount: true },
  });

  if (!bot || !bot.isActive || bot.status !== "ACTIVE" || !bot.waAccount) return;

  const skipReason = await getBotSkipReason({ waChatId }, job.messageId);
  if (skipReason) {
    console.log(`[bot-worker] El bot "${bot.name}" no responde: ${skipReason}`);
    return;
  }

  const picked = await resolvePlatformModel({
    needsVision: job.messageType === "image",
  });
  if (!picked) {
    await failBotAndNotify(botId, waChatId, "La IA no está disponible en este momento (proveedor sin configurar en la plataforma).");
    return;
  }
  const { provider, model } = picked;
  const apiKey = await getPlatformApiKey(provider);

  if (!apiKey) {
    await failBotAndNotify(botId, waChatId, "La IA no está disponible en este momento (proveedor sin configurar en la plataforma).");
    return;
  }

  // El bot funciona con la licencia del dueño de su canal (regla 3) y gasta
  // sus créditos (regla 6). Canal sin dueño activo = Básico: sin agente.
  const botChannel = { waAccountId: bot.waAccountId, channelAccountId: bot.channelAccountId };
  if (!(await channelHasFeature(botChannel, "aiAgent"))) return;

  // Un crédito de IA por respuesta; sin créditos el bot calla (sin marcar
  // ERROR — no es una falla del bot) y el admin ya recibió el aviso del 100 %.
  if (!(await reserveAiCredit({ channel: botChannel }))) {
    console.log(`[bots] Sin créditos de IA — el bot "${bot.name}" no responde este mensaje`);
    return;
  }

  let conversation = await prisma.wABotConversation.findUnique({
    where: { botId_waChatId: { botId, waChatId } },
  });

  if (!conversation) {
    conversation = await prisma.wABotConversation.create({
      data: { botId, waChatId },
    });
  }

  // Zona horaria de la organización: en qué hora local se interpretan las
  // fechas que propone el bot.
  let appointmentTimeZone: string | null = null;
  if (bot.appointmentSchedulingEnabled) {
    appointmentTimeZone = (await getOrgBusinessHours(bot.organizationId)).timezone;
  }

  const messages: AIMessage[] = [];
  messages.push({ role: "system", content: wrapUserPrompt(bot.systemPrompt) });
  messages.push({ role: "system", content: SCOPE_GUARDRAIL });
  if (appointmentTimeZone) {
    messages.push({ role: "system", content: buildAppointmentMarkerContract(new Date(), appointmentTimeZone) });
  }

  // Una nota de voz se transcribe antes (OpenCode MiMo, Gemini de respaldo):
  // el bot responde con su modelo de texto y la búsqueda en la base de
  // conocimiento usa lo que dijo el cliente.
  const voiceTranscript =
    job.messageType === "audio"
      ? await transcribeForBot({ kind: "whatsapp", messageId: job.messageId, mediaPath: job.localMediaPath, mimeType: job.mimeType })
      : null;

  if (bot.ragEnabled) {
    const ragQuery = voiceTranscript ??
      job.caption ?? (incomingMessage && incomingMessage !== `[${job.messageType}]` ? incomingMessage : job.messageType ?? "");
    const knowledge = await searchKnowledge(botId, ragQuery, provider, apiKey);
    if (knowledge) {
      messages.push({
        role: "system",
        content: `Información relevante de la base de conocimiento:\n\n${knowledge}`,
      });
    }
  }

  // Regardless of memoryType, if the most recent outbound message in this chat came
  // from a campaign send, tell the bot what the customer is replying to — otherwise
  // it replies "blind" to a lead who just received a specific marketing offer.
  const lastOutbound = await prisma.wAMessage.findFirst({
    where: { chatId: waChatId, direction: "OUTBOUND" },
    orderBy: { timestamp: "desc" },
    select: {
      body: true,
      campaign: { select: { name: true, waTemplate: { select: { name: true } } } },
    },
  });
  if (lastOutbound?.campaign) {
    const exactMessage = lastOutbound.body
      ? `\n\nEl mensaje exacto que recibió el cliente fue:\n"${lastOutbound.body}"`
      : "";
    messages.push({
      role: "system",
      content: `Esta conversación inició a partir de la campaña "${lastOutbound.campaign.name}" usando la plantilla "${lastOutbound.campaign.waTemplate.name}".${exactMessage}\n\nTen este contenido en cuenta al responder — el cliente puede estar reaccionando directamente a este mensaje.`,
    });
  }

  if (bot.memoryType === "RECENT" && bot.memoryLimit > 0) {
    const history = await prisma.wAMessage.findMany({
      // Exclude the message currently being processed — it's already appended below as
      // the final user turn via buildUserContent(); without this it shows up twice
      // (once here from the desc-ordered fetch, once as the "current" turn).
      where: { chatId: waChatId, ...(job.messageId ? { id: { not: job.messageId } } : {}) },
      orderBy: { timestamp: "desc" },
      take: bot.memoryLimit * 2,
      select: {
        direction: true,
        body: true,
        messageType: true,
        mimeType: true,
        mediaUrl: true,
        caption: true,
        transcript: true,
      },
    });

    // Reverse to chronological order; build user/assistant turns preserving plain text
    // (historical images are NOT forwarded to keep token cost bounded).
    for (const msg of history.reverse()) {
      const textPart = msg.transcript ? voiceNoteForBot(msg.transcript) : msg.caption ?? msg.body;
      if (!textPart) {
        if (msg.messageType && msg.messageType !== "text") {
          // Pure media without caption — describe it briefly so the bot has context.
          messages.push({
            role: msg.direction === "INBOUND" ? "user" : "assistant",
            content: `[${msg.messageType}]`,
          });
        }
        continue;
      }
      messages.push({
        role: msg.direction === "INBOUND" ? "user" : "assistant",
        content: textPart,
      });
    }
  }

  if (bot.memoryType === "SUMMARY" && conversation.summary) {
    messages.push({
      role: "system",
      content: `Resumen de la conversación anterior:\n${conversation.summary}`,
    });
  }

  // Build the user turn — embed the latest image/audio inline, or the extracted text of a
  // document, if present and the provider/media type combination supports it.
  const userContent = voiceTranscript ? voiceNoteForBot(voiceTranscript) : await buildUserContent(job);
  const incomingReply = job.messageId
    ? await prisma.wAMessage.findUnique({ where: { id: job.messageId }, select: { replyToWamid: true } })
    : null;
  const quotedMessage = incomingReply?.replyToWamid
    ? await prisma.wAMessage.findFirst({
        where: { chatId: waChatId, wamid: incomingReply.replyToWamid },
        select: { direction: true, body: true, caption: true, messageType: true },
      })
    : null;
  const quoteContext = quotedMessage
    ? `El cliente respondió específicamente a este mensaje ${quotedMessage.direction === "OUTBOUND" ? "del negocio" : "anterior"}: "${(quotedMessage.body || quotedMessage.caption || `[${quotedMessage.messageType}]`).slice(0, 700)}".\nSu respuesta actual es:\n`
    : "";
  messages.push({
    role: "user",
    content: quoteContext
      ? typeof userContent === "string"
        ? quoteContext + userContent
        : [{ type: "text", text: quoteContext } as const, ...userContent]
      : userContent,
  });

  const client = getAIProvider(provider, apiKey);
  const result = await client.complete({
    model,
    messages,
    temperature: bot.temperature,
    maxTokens: bot.maxTokens,
    sessionId: waChatId,
  });

  // El gasto de IA se registra en cuanto ocurre: si el envío de abajo falla y
  // BullMQ reintenta, esa llamada ya se hizo y debe contar en el presupuesto.
  await recordBotUsage({ botId, userId: bot.userId, model, provider, usage: result.usage, waChatId }).catch((err) =>
    console.error("[bot-worker] No se pudo registrar el uso de IA:", err instanceof Error ? err.message : err)
  );

  const chat = await prisma.wAChat.findUnique({
    where: { id: waChatId },
    select: { remoteJid: true, contactId: true, assignedToId: true },
  });

  if (!chat) return;

  const now = new Date();

  // El bloque ```appointment (si lo hay) nunca debe llegar al cliente — replyText
  // es siempre lo que se envía/persiste como el mensaje; proposal es la cita a
  // crear después de enviar, o null si no se detectó ninguna.
  const parsed = appointmentTimeZone
    ? parseAppointmentMarker(result.content, appointmentTimeZone)
    : { cleanText: result.content.trim(), proposal: null };
  const proposal = parsed.proposal;
  // Si el modelo respondió SOLO con el bloque de cita, cleanText queda vacío —
  // mandar un texto vacío falla en Meta, BullMQ reintenta (con costo de IA) y
  // el bot termina en ERROR. Con cita válida se confirma con un texto fijo;
  // sin ella no hay nada que enviar.
  const replyText = parsed.cleanText || (proposal ? APPOINTMENT_ONLY_REPLY : "");
  if (!replyText) {
    console.warn(`[bot-worker] El modelo devolvió una respuesta vacía — no se envía nada (chat ${waChatId})`);
    return;
  }

  // En cuanto la respuesta sale (primer fragmento encolado o envío directo),
  // un error posterior ya NO se relanza: BullMQ reintentaría el job completo
  // y el cliente recibiría la misma respuesta dos veces.
  let delivered = false;
  try {
    if (bot.humanizeEnabled) {
      // Split the reply across several messages with a simulated typing delay between
      // each, queued as separate delayed jobs so this job returns immediately instead
      // of holding a bot-messages concurrency slot for the whole send sequence.
      const chunks = splitReply(replyText);
      let cumulativeDelay = 0;
      for (const chunk of chunks) {
        cumulativeDelay += computeTypingDelay(chunk);
        await botSendQueue.add(
          "send-chunk",
          { accountId: bot.waAccount.id, waChatId, remoteJid: chat.remoteJid, chunk },
          { delay: cumulativeDelay }
        );
        delivered = true;
      }
    } else {
      const sendResult = await sendWhatsAppMessage(bot.waAccount, {
        to: chat.remoteJid,
        type: "text",
        body: replyText,
      });
      delivered = true;

      const [botMessage] = await Promise.all([
        prisma.wAMessage.create({
          data: {
            wamid: sendResult.wamid ?? undefined,
            chatId: waChatId,
            direction: "OUTBOUND",
            sentVia: "bot",
            messageType: "text",
            body: replyText,
            status: "sent",
            timestamp: now,
          },
        }),
        prisma.wAChat.update({
          where: { id: waChatId },
          data: {
            lastMessage: replyText.slice(0, 500),
            lastMessageAt: now,
            // El bot contestó: el cliente ya no espera (lib/chats/waiting.ts).
            waitingSince: null,
          },
        }),
      ]);
      await emitMessageSent("whatsapp", botMessage.id, "bot");
    }

    if (proposal && chat.contactId) {
      await createAiProposedAppointment({
        contactId: chat.contactId,
        assignedToId: chat.assignedToId,
        botOwnerId: bot.userId,
        proposal,
        originMessageId: job.messageId ?? null,
        // Solo hay propuesta si la zona se resolvió (appointmentTimeZone).
        timeZone: appointmentTimeZone ?? DEFAULT_TIME_ZONE,
      });
    }

    await Promise.all([
      bot.memoryType === "SUMMARY"
        ? prisma.wABotConversation.update({
            where: { id: conversation.id },
            data: {
              // El resumen debe acumular AMBOS lados del turno — solo con las
              // respuestas del bot, la "memoria" olvidaba todo lo que el
              // cliente dijo.
              summary: summarizeText(
                `Cliente: ${job.caption ?? incomingMessage}\nAsistente: ${replyText}`,
                conversation.summary
              ),
            },
          })
        : Promise.resolve(),
      prisma.wAAccount.update({
        where: { id: bot.waAccount.id },
        data: { lastActivity: now },
      }),
    ]);
  } catch (err) {
    if (!delivered) throw err;
    console.error(
      "[bot-worker] La respuesta ya se entregó; falló un paso posterior (no se reintenta para no duplicarla):",
      err instanceof Error ? err.message : err
    );
  }
}

async function buildUserContent(job: BotMessageJob): Promise<string | ContentPart[]> {
  const isImage = job.messageType === "image" || job.messageType === "sticker";
  const isDocument = job.messageType === "document";
  const bodyText = job.caption ?? job.incomingMessage ?? "";
  const fallbackLabel = `[${job.messageType === "audio" ? "audio" : job.messageType} recibido]`;

  if (!isImage && !isDocument) {
    return bodyText || `[${job.messageType ?? "text"}]`;
  }

  let localPath = job.localMediaPath ?? null;
  let mimeType = job.mimeType ?? null;

  // The Meta download worker may not have finished yet — re-check DB.
  if (!localPath && job.messageId) {
    const latest = await prisma.wAMessage.findUnique({
      where: { id: job.messageId },
      select: { mediaUrl: true, mimeType: true },
    }).catch(() => null);
    if (latest?.mediaUrl) localPath = latest.mediaUrl;
    if (latest?.mimeType) mimeType = latest.mimeType;
  }

  if (!localPath) {
    return bodyText && bodyText !== `[${job.messageType}]` ? `${fallbackLabel} ${bodyText}` : fallbackLabel;
  }
  const absolute = resolveAbsolutePath(localPath);

  if (isDocument) {
    const extracted = await extractDocumentText(absolute, mimeType);
    if (!extracted) {
      return bodyText && bodyText !== `[document]` ? `${fallbackLabel} ${bodyText}` : fallbackLabel;
    }
    const label = job.filename ? `Documento "${job.filename}"` : "Documento recibido";
    const caption = bodyText && bodyText !== `[document]` ? `\nMensaje del prospecto: ${bodyText}` : "";
    return `${label}, contenido extraído:\n\n${extracted}${caption}`;
  }

  try {
    const buffer = await fs.readFile(absolute);
    const base64 = buffer.toString("base64");
    const mime = mimeType ?? "image/jpeg";

    const parts: ContentPart[] = [];
    if (bodyText && bodyText !== `[${job.messageType}]`) {
      parts.push({ type: "text", text: bodyText });
    }
    parts.push({ type: "image_url", image_url: { url: `data:${mime};base64,${base64}` } });
    return parts;
  } catch (err) {
    console.error(`[bot-worker] No se pudo leer la imagen local:`, err);
    return bodyText || fallbackLabel;
  }
}


// Autonomía total (decisión del usuario, 2026-08-06): se crea la WAAppointment
// como SCHEDULED de inmediato, sin paso de aprobación — la UI de /whatsapp/citas
// ya distingue source: AI_BOT con el badge "Propuesta por IA" (app/(dashboard)/
// whatsapp/citas/_view.tsx), y aquí solo se avisa al agente en vez de bloquear
// nada. createdById es obligatorio en el schema y no hay noción de "usuario IA":
// se usa el dueño del bot, igual que WABotUsage/Notification ya lo hacen.
async function createAiProposedAppointment(params: {
  contactId: string;
  assignedToId: string | null;
  botOwnerId: string;
  proposal: AppointmentProposal;
  originMessageId: string | null;
  timeZone: string;
}) {
  const { contactId, assignedToId, botOwnerId, proposal, originMessageId, timeZone } = params;
  try {
    // Idempotencia ante reintentos: si este mismo job falla DESPUÉS de que la IA
    // ya respondió (ej. un error de red al enviar el mensaje) pero antes de
    // terminar, BullMQ reintenta handleBotMessage() completo desde cero — vuelve
    // a llamar a la IA con el mismo contexto, que muy probablemente repite la
    // misma propuesta. Sin este chequeo, cada reintento crearía una cita
    // duplicada en el calendario del agente. originMessageId identifica de forma
    // única "el mensaje del lead que disparó esta propuesta", así que basta con
    // preguntar si ya existe una cita de IA con ese origen antes de crear otra.
    if (originMessageId) {
      const existing = await prisma.wAAppointment.findFirst({
        where: { originMessageId, source: "AI_BOT" },
        select: { id: true },
      });
      if (existing) return;
    }

    const notifyUserId = assignedToId ?? botOwnerId;
    const appointment = await prisma.wAAppointment.create({
      data: {
        contactId,
        title: proposal.title,
        notes: proposal.notes,
        scheduledAt: proposal.scheduledAt,
        durationMinutes: proposal.durationMinutes,
        source: "AI_BOT",
        assignedToId,
        createdById: botOwnerId,
        originMessageId,
      },
    });

    const refs = await eventRefsForContact(contactId);
    if (refs) {
      await emitDomainEvent({
        type: "appointment.created",
        ...refs,
        data: { appointmentId: appointment.id, title: appointment.title, scheduledAt: appointment.scheduledAt.toISOString(), source: "AI_BOT" },
      });
    }

    await prisma.notification.create({
      data: {
        userId: notifyUserId,
        type: "APPOINTMENT_PROPOSED",
        title: "El bot agendó una cita",
        body: `${proposal.title} — ${formatInZone(proposal.scheduledAt, { dateStyle: "medium", timeStyle: "short" }, timeZone)}`,
        link: `/whatsapp/citas?id=${appointment.id}`,
      },
    });
  } catch (err) {
    // Best-effort — un fallo al agendar no debe tirar todo el turno del bot
    // (el mensaje al cliente ya se envió). Queda sin registro en el CRM y sin
    // notificación; sería recuperable manualmente si el lead insiste.
    console.error("[bot-worker] No se pudo crear la cita propuesta por IA:", err instanceof Error ? err.message : err);
  }
}

function summarizeText(newMessage: string, existingSummary: string | null): string {
  const combined = existingSummary
    ? `${existingSummary}\n\n---\n\n${newMessage}`
    : newMessage;

  if (combined.length > 2000) {
    return combined.slice(combined.length - 2000);
  }

  return combined;
}
