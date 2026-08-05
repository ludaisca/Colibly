import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { rateLimit } from "@/lib/rate-limit";
import { ingestChannelMessage } from "@/lib/telegram/ingest-message";

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
  text?: string;
  caption?: string;
  photo?: TelegramPhotoSize[];
  document?: TelegramDocument;
  voice?: TelegramAudio;
  audio?: TelegramAudio;
  video?: TelegramAudio;
  sticker?: { file_id: string };
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessagePayload;
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

export async function POST(req: Request, { params }: { params: Promise<{ accountId: string }> }) {
  try {
    const { accountId } = await params;

    // El límite va antes de la consulta y el descifrado: la URL del webhook es
    // pública, así que sin esto cualquiera podía forzar un query + AES por
    // request con solo golpear el endpoint con un secreto inválido.
    const { allowed } = await rateLimit(`telegram-webhook:${accountId}`, 120, 60);
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

    const { webhookSecret } = JSON.parse(decrypt(account.credentials)) as {
      botToken: string;
      webhookSecret: string;
    };
    const receivedSecret = req.headers.get("x-telegram-bot-api-secret-token");
    if (receivedSecret !== webhookSecret) {
      return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
    }

    const update = (await req.json()) as TelegramUpdate;
    const msg = update.message;
    if (!msg) {
      // Otros tipos de update (edited_message, callback_query, my_chat_member,
      // etc.) llegan a la misma URL y se ignoran — mismo criterio que el
      // webhook de Meta con change.field desconocidos.
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
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[telegram webhook] error:", error);
    // Telegram reintenta con backoff si no responde 200 — devolver 200 igual
    // ante un error de parseo evita una tormenta de reintentos que nunca se
    // resolvería sola.
    return NextResponse.json({ ok: true });
  }
}
