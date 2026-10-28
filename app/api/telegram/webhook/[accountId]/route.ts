import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { rateLimit } from "@/lib/rate-limit";
import { ingestChannelMessage } from "@/lib/telegram/ingest-message";
import { answerCallbackQuery } from "@/lib/telegram";

// Telegram identifica la cuenta por la URL del webhook misma (no manda un id
// de cuenta reutilizable en el payload, a diferencia de Meta) — por eso la
// URL incluye [accountId], y la validación real de que la request viene de
// Telegram es el header secret_token (ver setWebhook en lib/telegram.ts).

interface TelegramFrom {
  id: number;
  first_name: string;
  username?: string;
  is_bot: boolean;
}

interface TelegramChat {
  id: number;
  type: string;
}

interface TelegramPhotoSize {
  file_id: string;
  file_size?: number;
}

interface TelegramDocument {
  file_id: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

interface TelegramAudio {
  file_id: string;
  mime_type?: string;
  file_size?: number;
}

interface TelegramMessagePayload {
  message_id: number;
  date: number;
  chat: TelegramChat;
  from?: TelegramFrom;
  reply_to_message?: { message_id: number };
  text?: string;
  caption?: string;
  photo?: TelegramPhotoSize[];
  document?: TelegramDocument;
  voice?: TelegramAudio;
  audio?: TelegramAudio;
  video?: TelegramAudio;
  sticker?: { file_id: string };
}

// Toque de un botón del teclado inline (automatizaciones / API).
interface TelegramCallbackQuery {
  id: string;
  from: TelegramFrom;
  data?: string;
  message?: TelegramMessagePayload & {
    reply_markup?: { inline_keyboard?: { text: string; callback_data?: string }[][] };
  };
}

interface TelegramUpdate {
  update_id: number;
  callback_query?: TelegramCallbackQuery;
  message?: TelegramMessagePayload;
  message_reaction?: {
    chat: TelegramChat;
    message_id: number;
    user?: TelegramFrom;
    new_reaction?: { type?: string; emoji?: string }[];
  };
}

interface ExtractedMessageInfo {
  type: string;
  body: string;
  mediaId: string | null;
  mimeType: string | null;
  filename: string | null;
  caption: string | null;
}

// `body` nunca queda vacío para media: cae a `[tipo]` igual que
// getMessageBody() del webhook de Meta. Sin esto, una foto o nota de voz sin
// caption dejaba la lista de chats con el último mensaje en blanco y le
// mandaba una cadena vacía al bot de IA como turno del usuario. El formato
// `[tipo]` además es el que bot-worker ya reconoce para no tratarlo como texto
// real al armar la consulta de RAG.
function extractMessageInfo(msg: TelegramMessagePayload): ExtractedMessageInfo {
  const withBody = (info: Omit<ExtractedMessageInfo, "body">): ExtractedMessageInfo => ({
    ...info,
    body: info.caption ?? `[${info.type}]`,
  });

  if (msg.photo && msg.photo.length > 0) {
    const largest = msg.photo[msg.photo.length - 1];
    return withBody({ type: "image", mediaId: largest.file_id, mimeType: "image/jpeg", filename: null, caption: msg.caption ?? null });
  }
  if (msg.document) {
    return withBody({ type: "document", mediaId: msg.document.file_id, mimeType: msg.document.mime_type ?? null, filename: msg.document.file_name ?? null, caption: msg.caption ?? null });
  }
  if (msg.voice) {
    return withBody({ type: "audio", mediaId: msg.voice.file_id, mimeType: msg.voice.mime_type ?? "audio/ogg", filename: null, caption: null });
  }
  if (msg.audio) {
    return withBody({ type: "audio", mediaId: msg.audio.file_id, mimeType: msg.audio.mime_type ?? null, filename: null, caption: msg.caption ?? null });
  }
  if (msg.video) {
    return withBody({ type: "video", mediaId: msg.video.file_id, mimeType: msg.video.mime_type ?? null, filename: null, caption: msg.caption ?? null });
  }
  if (msg.sticker) {
    return withBody({ type: "sticker", mediaId: msg.sticker.file_id, mimeType: "image/webp", filename: null, caption: null });
  }
  return { type: "text", body: msg.text ?? "", mediaId: null, mimeType: null, filename: null, caption: null };
}

function secretMatches(received: string | null, expected: string): boolean {
  if (!received) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request, { params }: { params: Promise<{ accountId: string }> }) {
  try {
    const { accountId } = await params;
    const forwarded = req.headers.get("x-forwarded-for");
    const ip = forwarded?.split(",")[0]?.trim() ?? "unknown";

    // Límite general alto (el tráfico legítimo de todos los bots llega desde
    // pocas IPs de Telegram). Antes el límite era 120/min POR CUENTA: un
    // tercero mandando basura a la URL de un bot agotaba el cupo del tráfico
    // real. El límite estricto aplica solo a intentos con secreto inválido.
    const { allowed } = await rateLimit(`telegram-webhook:${ip}`, 3000, 60);
    if (!allowed) {
      return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });
    }

    const account = await prisma.channelAccount.findUnique({
      where: { id: accountId },
      select: { id: true, channel: true, credentials: true },
    });
    if (!account || account.channel !== "TELEGRAM") {
      return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
    }

    const { webhookSecret, botToken } = JSON.parse(decrypt(account.credentials)) as {
      botToken: string;
      webhookSecret: string;
    };
    if (!secretMatches(req.headers.get("x-telegram-bot-api-secret-token"), webhookSecret)) {
      const failures = await rateLimit(`telegram-webhook-bad-secret:${ip}`, 30, 60);
      return NextResponse.json({ error: "Firma inválida" }, { status: failures.allowed ? 401 : 429 });
    }

    let update: TelegramUpdate;
    try {
      update = (await req.json()) as TelegramUpdate;
    } catch {
      // Malformado: reintentar no lo arregla.
      return NextResponse.json({ ok: true });
    }
    // Toque de un botón inline: se ingiere como un mensaje de texto con el
    // título del botón (lo que el cliente "dijo") + interactiveReplyId, igual
    // que una respuesta a botones de WhatsApp.
    const cb = update.callback_query;
    if (cb?.data && cb.message) {
      await answerCallbackQuery(botToken, cb.id).catch((err) =>
        console.warn("[telegram webhook] answerCallbackQuery falló:", err instanceof Error ? err.message : err)
      );
      const title =
        cb.message.reply_markup?.inline_keyboard?.flat().find((b) => b.callback_data === cb.data)?.text ?? cb.data;
      await ingestChannelMessage(accountId, "TELEGRAM", {
        externalId: String(cb.message.chat.id),
        // callback_query.id es único por toque: dedupe de reintentos del webhook.
        externalMessageId: `cb_${cb.id}`,
        timestamp: new Date(),
        type: "text",
        body: title,
        contactName: cb.from.first_name || cb.from.username || String(cb.message.chat.id),
        isGroup: cb.message.chat.type !== "private",
        interactiveReplyId: cb.data,
      });
      return NextResponse.json({ ok: true });
    }

    const reaction = update.message_reaction;
    if (reaction && !reaction.user?.is_bot) {
      const emoji = reaction.new_reaction?.find((item) => item.type === "emoji" && item.emoji)?.emoji ?? null;
      const conversation = await prisma.conversation.findUnique({
        where: { channelAccountId_externalId: { channelAccountId: accountId, externalId: String(reaction.chat.id) } },
        select: { id: true },
      });
      if (conversation) {
        await prisma.channelMessage.updateMany({
          where: { conversationId: conversation.id, externalMessageId: String(reaction.message_id) },
          data: { reactionEmoji: emoji },
        });
      }
      return NextResponse.json({ ok: true });
    }

    const msg = update.message;
    if (!msg) {
      // Otros tipos de update (edited_message, my_chat_member, etc.) llegan a
      // la misma URL y se ignoran — mismo criterio que el webhook de Meta con
      // change.field desconocidos.
      return NextResponse.json({ ok: true });
    }

    const info = extractMessageInfo(msg);
    const contactName = msg.from?.first_name || msg.from?.username || String(msg.chat.id);

    await ingestChannelMessage(accountId, "TELEGRAM", {
      externalId: String(msg.chat.id),
      externalMessageId: String(msg.message_id),
      timestamp: new Date(msg.date * 1000),
      type: info.type,
      body: info.body,
      contactName,
      isGroup: msg.chat.type !== "private",
      mediaId: info.mediaId,
      mimeType: info.mimeType,
      filename: info.filename,
      caption: info.caption,
      replyToExternalId: msg.reply_to_message ? String(msg.reply_to_message.message_id) : null,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[telegram webhook] error:", error);
    // Error procesando un update válido (DB/Redis caídos...): 500 para que
    // Telegram reintente con backoff — antes se respondía 200 y el mensaje se
    // perdía. El dedup por (conversación, message_id) hace seguro el reintento.
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
