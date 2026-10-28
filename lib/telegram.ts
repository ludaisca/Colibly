import { httpTimeout, HTTP_TRANSFER_TIMEOUT_MS } from "@/lib/http-timeouts";

const BASE_URL = "https://api.telegram.org";

interface TelegramApiResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
}

async function callTelegramApi<T>(
  botToken: string,
  method: string,
  payload?: Record<string, unknown>
): Promise<T> {
  const url = `${BASE_URL}/bot${botToken}/${method}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload ? JSON.stringify(payload) : undefined,
    signal: httpTimeout(),
  });

  const data = (await res.json()) as TelegramApiResponse<T>;
  if (!data.ok || data.result === undefined) {
    throw new Error(data.description ?? `Telegram API call failed (HTTP ${res.status})`);
  }

  return data.result;
}

export interface TelegramBotInfo {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
}

export async function getMe(botToken: string): Promise<TelegramBotInfo> {
  return callTelegramApi<TelegramBotInfo>(botToken, "getMe");
}

export async function setWebhook(botToken: string, url: string, secretToken: string): Promise<void> {
  await callTelegramApi<boolean>(botToken, "setWebhook", {
    url,
    secret_token: secretToken,
    // Sin message_reaction Telegram no avisa cuando alguien reacciona.
    allowed_updates: ["message", "callback_query", "message_reaction"],
  });
}

// Sin esto, al eliminar la cuenta el bot sigue apuntando a nuestra URL: Telegram
// seguiría enviando updates a un accountId que ya no existe y el bot quedaría
// inservible para reconectarlo sin ir a limpiarlo a mano.
export async function deleteWebhook(botToken: string): Promise<void> {
  await callTelegramApi<boolean>(botToken, "deleteWebhook");
}

interface TelegramMessage {
  message_id: number;
  date: number;
  chat: { id: number };
}

// El bot de IA sigue generando solo texto (ver AGENTS.md, "Bot reply stays
// text-only") — sendMediaMessage más abajo es solo para el envío manual desde
// el composer.
export function replyParameters(messageId: string | undefined): { message_id: number } | null {
  if (!messageId || !/^\d+$/.test(messageId)) return null;
  return { message_id: Number(messageId) };
}

export async function sendTextMessage(botToken: string, chatId: string, text: string, replyToMessageId?: string): Promise<TelegramMessage> {
  const reply = replyParameters(replyToMessageId);
  return callTelegramApi<TelegramMessage>(botToken, "sendMessage", { chat_id: chatId, text, ...(reply ? { reply_parameters: reply } : {}) });
}

// Opciones como teclado inline (una por fila): el toque llega como
// callback_query con callback_data = id de la opción (máx. 64 bytes).
export async function sendKeyboardMessage(
  botToken: string,
  chatId: string,
  text: string,
  options: { id: string; title: string }[]
): Promise<TelegramMessage> {
  return callTelegramApi<TelegramMessage>(botToken, "sendMessage", {
    chat_id: chatId,
    text,
    reply_markup: { inline_keyboard: options.map((o) => [{ text: o.title, callback_data: o.id }]) },
  });
}

// Telegram no acepta todos los emoji de WhatsApp. 😂 y 😮 se cambian por
// equivalentes de la lista oficial; ❤️ va sin el selector de variación.
const TELEGRAM_REACTION: Record<string, string> = {
  "👍": "👍",
  "❤️": "❤",
  "❤": "❤",
  "😂": "🤣",
  "😮": "😱",
  "😢": "😢",
  "🙏": "🙏",
};

export function telegramReactionEmoji(emoji: string): string | null {
  if (!emoji) return null;
  return TELEGRAM_REACTION[emoji] ?? null;
}

export async function setMessageReaction(botToken: string, chatId: string, messageId: string, emoji: string): Promise<void> {
  const mapped = emoji ? telegramReactionEmoji(emoji) : null;
  if (emoji && !mapped) throw new Error("Telegram no admite esa reacción");
  await callTelegramApi<boolean>(botToken, "setMessageReaction", {
    chat_id: chatId,
    message_id: Number(messageId),
    reaction: mapped ? [{ type: "emoji", emoji: mapped }] : [],
  });
}

// Quita el "cargando" del botón en la app de Telegram tras un toque.
export async function answerCallbackQuery(botToken: string, callbackQueryId: string): Promise<void> {
  await callTelegramApi<boolean>(botToken, "answerCallbackQuery", { callback_query_id: callbackQueryId });
}

export type TelegramMediaKind = "photo" | "document" | "audio" | "video";

interface TelegramSentMedia extends TelegramMessage {
  photo?: { file_id: string }[];
  document?: { file_id: string };
  audio?: { file_id: string };
  video?: { file_id: string };
}

// A diferencia de callTelegramApi() (JSON), sendPhoto/sendDocument/etc.
// requieren multipart — Telegram sube los bytes directo en el mismo call que
// envía el mensaje, sin el paso separado "subir → obtener id" de la Graph API
// de Meta.
export async function sendMediaMessage(
  botToken: string,
  chatId: string,
  kind: TelegramMediaKind,
  buffer: Buffer,
  filename: string,
  mimeType: string,
  caption?: string,
  replyToMessageId?: string
): Promise<TelegramSentMedia> {
  const method = `send${kind[0].toUpperCase()}${kind.slice(1)}`;
  const url = `${BASE_URL}/bot${botToken}/${method}`;

  const formData = new FormData();
  formData.append("chat_id", chatId);
  formData.append(kind, new Blob([new Uint8Array(buffer)], { type: mimeType }), filename);
  if (caption) formData.append("caption", caption);
  const reply = replyParameters(replyToMessageId);
  if (reply) formData.append("reply_parameters", JSON.stringify(reply));

  const res = await fetch(url, { method: "POST", body: formData, signal: httpTimeout(HTTP_TRANSFER_TIMEOUT_MS), });
  const data = (await res.json()) as TelegramApiResponse<TelegramSentMedia>;
  if (!data.ok || !data.result) {
    throw new Error(data.description ?? `Telegram send${kind} failed (HTTP ${res.status})`);
  }
  return data.result;
}

interface TelegramFile {
  file_id: string;
  file_path?: string;
}

export async function getFileUrl(botToken: string, fileId: string): Promise<string> {
  const file = await callTelegramApi<TelegramFile>(botToken, "getFile", { file_id: fileId });
  if (!file.file_path) throw new Error("Telegram no devolvió una ruta de archivo para este file_id");
  return `${BASE_URL}/file/bot${botToken}/${file.file_path}`;
}
