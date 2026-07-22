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
  await callTelegramApi<boolean>(botToken, "setWebhook", { url, secret_token: secretToken });
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

// Solo texto por ahora — el bot de IA nunca genera media de salida (ver
// AGENTS.md, "Bot reply stays text-only"), y el envío manual de adjuntos
// desde el composer requeriría subir el archivo a Telegram vía multipart
// (una URL pública no sirve: nuestro proxy de media exige la cookie de
// sesión, que Telegram como servidor externo no tiene). Queda fuera de esta
// primera pasada — ver "Fuera de alcance" en el plan.
export async function sendTextMessage(botToken: string, chatId: string, text: string): Promise<TelegramMessage> {
  return callTelegramApi<TelegramMessage>(botToken, "sendMessage", { chat_id: chatId, text });
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
