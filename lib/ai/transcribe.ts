import { promises as fs } from "fs";
import { prisma } from "@/lib/prisma";
import { getAIProvider } from "@/lib/ai/factory";
import { getPlatformApiKey } from "@/lib/ai/platform";
import { hasAiCredits, reserveAiCredit } from "@/lib/ai/credits";
import { recordAssistUsage } from "@/lib/ai/assist-usage";
import { OPENCODE_AUDIO_MODEL } from "@/lib/ai/providers/opencode";
import type { AIProvider } from "@/lib/ai/types";
import { DEFAULT_AI_MODEL } from "@/lib/billing/plans";
import { hasAiAccess, isOrgWritable } from "@/lib/billing/gates";
import { resolveAbsolutePath } from "@/lib/whatsapp/media-store";
import { inboxQueue } from "@/lib/queue";

// Transcripción de notas de voz (benchmark #1). Primero OpenCode Go con
// OPENCODE_AUDIO_MODEL (MiMo, sin razonamiento: suscripción plana, ~2 s) y, si
// falla o no tiene llave, Gemini con inlineData. Manual desde la burbuja del
// hilo (POST /api/whatsapp/messages/[id]/transcribe), automática al terminar
// la descarga del audio si la organización activó autoTranscribeAudio, y
// dentro de los bots (transcribeForBot) para que respondan sobre el texto.
//
// Orden fijo (AGENTS.md → AI): llave de la plataforma → plan → tamaño (antes
// de gastar) → reserveAiCredit → proveedor → guardar → registrar uso.
// Idempotente: un mensaje con transcript lo devuelve sin gastar crédito.

export type TranscribeKind = "whatsapp" | "channel";

/** Límite práctico de inlineData en Gemini (la petición entera ronda 20 MB). */
export const TRANSCRIBE_MAX_BYTES = 18 * 1024 * 1024;

export type TranscribeErrorCode =
  | "not_found"
  | "not_audio"
  | "no_media"
  | "too_large"
  | "unavailable"
  | "no_access"
  | "ai_credits"
  | "failed";

export class TranscribeError extends Error {
  constructor(public code: TranscribeErrorCode, message: string) {
    super(message);
  }
}

const SYSTEM_PROMPT =
  "Transcribe literalmente la nota de voz, en su idioma original. Devuelve solo el texto transcrito, sin comillas, títulos ni comentarios. Si no se entiende nada, devuelve exactamente: [inaudible]";

interface AudioRow {
  id: string;
  messageType: string;
  mediaUrl: string | null;
  mimeType: string | null;
  transcript: string | null;
  organizationId: string;
}

async function loadAudioRow(kind: TranscribeKind, messageId: string): Promise<AudioRow | null> {
  if (kind === "whatsapp") {
    const m = await prisma.wAMessage.findUnique({
      where: { id: messageId },
      select: { id: true, messageType: true, mediaUrl: true, mimeType: true, transcript: true, chat: { select: { account: { select: { organizationId: true } } } } },
    });
    return m && { ...m, organizationId: m.chat.account.organizationId };
  }
  const m = await prisma.channelMessage.findUnique({
    where: { id: messageId },
    select: { id: true, messageType: true, mediaUrl: true, mimeType: true, transcript: true, conversation: { select: { channelAccount: { select: { organizationId: true } } } } },
  });
  return m && { ...m, organizationId: m.conversation.channelAccount.organizationId };
}

interface TranscriberOption {
  provider: AIProvider;
  model: string;
  apiKey: string;
}

/** Proveedores que pueden transcribir, en orden de preferencia. Vacío = ninguno configurado. */
export async function transcriberChain(): Promise<TranscriberOption[]> {
  const [opencode, google] = await Promise.all([getPlatformApiKey("opencode"), getPlatformApiKey("google")]);
  const chain: TranscriberOption[] = [];
  if (opencode) chain.push({ provider: "opencode", model: OPENCODE_AUDIO_MODEL, apiKey: opencode });
  if (google) chain.push({ provider: "google", model: DEFAULT_AI_MODEL.google, apiKey: google });
  return chain;
}

/** Una respuesta que no es una transcripción (vacía o el razonamiento colado). */
function cleanTranscript(raw: string): string {
  return raw.trim().replace(/^["“«]+|["”»]+$/g, "").trim();
}

/**
 * Transcribe los bytes con el primer proveedor que responda. Registra el uso
 * de cada llamada que llegó al modelo. No reserva crédito: lo hace el llamador.
 */
async function transcribeBuffer(input: {
  chain: TranscriberOption[];
  buffer: Buffer;
  mimeType: string | null;
  organizationId: string;
  userId?: string | null;
}): Promise<string> {
  const mime = input.mimeType?.split(";")[0].trim() || "audio/ogg";
  const audio = { type: "audio_url" as const, audio_url: { url: `data:${mime};base64,${input.buffer.toString("base64")}` } };
  let lastError: unknown = null;
  for (const option of input.chain) {
    try {
      const result = await getAIProvider(option.provider, option.apiKey).complete({
        model: option.model,
        temperature: 0,
        maxTokens: 2000,
        disableThinking: true,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: [audio] },
        ],
      });
      await recordAssistUsage({
        organizationId: input.organizationId,
        kind: "TRANSCRIBE",
        userId: input.userId,
        provider: option.provider,
        model: option.model,
        usage: result.usage,
      });
      const text = cleanTranscript(result.content);
      if (text) return text;
      lastError = new Error(`${option.provider} devolvió una transcripción vacía`);
    } catch (error) {
      lastError = error;
    }
    console.warn(`[transcribe] ${option.provider}/${option.model} no transcribió:`, lastError instanceof Error ? lastError.message : lastError);
  }
  throw new TranscribeError("failed", "No se pudo transcribir el audio. Intenta de nuevo en un momento.");
}

async function readAudio(mediaUrl: string): Promise<Buffer> {
  const absolute = resolveAbsolutePath(mediaUrl);
  try {
    const stat = await fs.stat(absolute);
    if (stat.size > TRANSCRIBE_MAX_BYTES) throw new TranscribeError("too_large", "El audio es demasiado largo para transcribirlo.");
    return await fs.readFile(absolute);
  } catch (error) {
    if (error instanceof TranscribeError) throw error;
    throw new TranscribeError("no_media", "No se encontró el archivo del audio.");
  }
}

/** Guarda la transcripción sin pisar otra que haya llegado antes (bot y job automático a la vez). */
async function saveTranscript(kind: TranscribeKind, id: string, transcript: string): Promise<void> {
  const data = { transcript, transcribedAt: new Date() };
  const where = { id, transcript: null };
  if (kind === "whatsapp") await prisma.wAMessage.updateMany({ where, data });
  else await prisma.channelMessage.updateMany({ where, data });
}

/**
 * Transcribe un audio ya autorizado por el llamador (la ruta valida el
 * alcance; el worker parte de un mensaje que ya es de la organización).
 */
export async function transcribeMessage(
  kind: TranscribeKind,
  messageId: string,
  opts: { userId?: string | null } = {}
): Promise<string> {
  const row = await loadAudioRow(kind, messageId);
  if (!row) throw new TranscribeError("not_found", "Mensaje no encontrado");
  if (row.transcript) return row.transcript;
  if (row.messageType !== "audio") throw new TranscribeError("not_audio", "Solo se pueden transcribir notas de voz");
  if (!row.mediaUrl) throw new TranscribeError("no_media", "El audio todavía se está descargando. Intenta en unos segundos.");

  const chain = await transcriberChain();
  if (chain.length === 0) throw new TranscribeError("unavailable", "La transcripción no está disponible en este momento.");
  if (!(await hasAiAccess(row.organizationId))) throw new TranscribeError("no_access", "Tu plan no incluye IA.");

  // El tamaño se valida ANTES de reservar: un audio enorme no gasta crédito.
  const buffer = await readAudio(row.mediaUrl);

  if (!(await reserveAiCredit(row.organizationId))) {
    throw new TranscribeError("ai_credits", "Se acabaron los créditos de IA de este mes.");
  }

  const text = await transcribeBuffer({ chain, buffer, mimeType: row.mimeType, organizationId: row.organizationId, userId: opts.userId });
  await saveTranscript(kind, row.id, text);
  return text;
}

/**
 * Para los bots: la nota de voz como texto, para que respondan con el modelo
 * de texto de la plataforma. No reserva otro crédito (la respuesta del bot ya
 * reservó el suyo) ni revisa el plan (el bot ya pasó hasBotsAccess). Reusa una
 * transcripción existente y guarda la nueva en el mensaje, así también se ve
 * en la bandeja. null = no se pudo; el bot sigue con la etiqueta de audio.
 */
export async function transcribeForBot(input: {
  kind: TranscribeKind;
  messageId: string | null | undefined;
  mediaPath?: string | null;
  mimeType?: string | null;
}): Promise<string | null> {
  if (!input.messageId) return null;
  try {
    const row = await loadAudioRow(input.kind, input.messageId);
    if (!row || row.messageType !== "audio") return null;
    if (row.transcript) return row.transcript;
    const mediaUrl = row.mediaUrl ?? input.mediaPath;
    if (!mediaUrl) return null;
    const chain = await transcriberChain();
    if (chain.length === 0) return null;
    const buffer = await readAudio(mediaUrl);
    const text = await transcribeBuffer({ chain, buffer, mimeType: row.mimeType ?? input.mimeType ?? null, organizationId: row.organizationId });
    await saveTranscript(input.kind, row.id, text);
    return text;
  } catch (error) {
    console.warn(`[transcribe] el bot no pudo transcribir ${input.kind}:${input.messageId}:`, error instanceof Error ? error.message : error);
    return null;
  }
}

/** Texto que ve el bot por una nota de voz (actual o del historial). */
export function voiceNoteForBot(transcript: string): string {
  return `[Nota de voz del cliente, transcrita]: ${transcript}`;
}

/**
 * Llamado por media-worker al guardar un audio entrante. Solo encola si la
 * organización lo activó, puede escribir y le quedan créditos. Nunca lanza.
 */
export async function queueAutoTranscribe(kind: TranscribeKind, messageId: string): Promise<void> {
  try {
    const row = await loadAudioRow(kind, messageId);
    if (!row || row.messageType !== "audio" || row.transcript) return;
    const org = await prisma.organization.findUnique({ where: { id: row.organizationId }, select: { autoTranscribeAudio: true } });
    if (!org?.autoTranscribeAudio) return;
    if (!(await isOrgWritable(row.organizationId))) return;
    if (!(await hasAiCredits(row.organizationId))) return;
    await inboxQueue.add("transcribe", { kind, messageId }, { jobId: `transcribe-${messageId}` });
  } catch (error) {
    console.error(`[transcribe] no se pudo encolar ${kind}:${messageId}`, error);
  }
}

/** Job `inbox/transcribe`: los errores esperados se registran, no se reintentan. */
export async function processTranscribeJob(job: { kind: TranscribeKind; messageId: string }): Promise<string> {
  try {
    await transcribeMessage(job.kind, job.messageId);
    return "transcribed";
  } catch (error) {
    if (error instanceof TranscribeError) return error.code;
    throw error;
  }
}
