import { promises as fs } from "fs";
import { prisma } from "@/lib/prisma";
import { getAIProvider } from "@/lib/ai/factory";
import { getPlatformApiKey, resolvePlatformModel } from "@/lib/ai/platform";
import { hasAiCredits, reserveAiCredit } from "@/lib/ai/credits";
import { recordAssistUsage } from "@/lib/ai/assist-usage";
import { hasAiAccess, isOrgWritable } from "@/lib/billing/gates";
import { resolveAbsolutePath } from "@/lib/whatsapp/media-store";
import { inboxQueue } from "@/lib/queue";

// Transcripción de notas de voz (benchmark #1). Solo Gemini entiende audio
// (inlineData); OpenCode no. Manual desde la burbuja del hilo
// (POST /api/whatsapp/messages/[id]/transcribe) o automática al terminar la
// descarga del audio si la organización activó autoTranscribeAudio.
//
// Orden fijo (AGENTS.md → AI): modelo con audio → llave de la plataforma →
// plan → tamaño (antes de gastar) → reserveAiCredit → proveedor → guardar →
// registrar uso. Idempotente: un mensaje con transcript lo devuelve sin
// gastar crédito.

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
  | "empty";

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

  const picked = await resolvePlatformModel({ needsAudio: true });
  if (!picked || picked.provider !== "google") {
    throw new TranscribeError("unavailable", "La transcripción no está disponible en este momento.");
  }
  const apiKey = await getPlatformApiKey("google");
  if (!apiKey) throw new TranscribeError("unavailable", "La transcripción no está disponible en este momento.");
  if (!(await hasAiAccess(row.organizationId))) throw new TranscribeError("no_access", "Tu plan no incluye IA.");

  // El tamaño se valida ANTES de reservar: un audio enorme no gasta crédito.
  const absolute = resolveAbsolutePath(row.mediaUrl);
  let buffer: Buffer;
  try {
    const stat = await fs.stat(absolute);
    if (stat.size > TRANSCRIBE_MAX_BYTES) throw new TranscribeError("too_large", "El audio es demasiado largo para transcribirlo.");
    buffer = await fs.readFile(absolute);
  } catch (error) {
    if (error instanceof TranscribeError) throw error;
    throw new TranscribeError("no_media", "No se encontró el archivo del audio.");
  }

  if (!(await reserveAiCredit(row.organizationId))) {
    throw new TranscribeError("ai_credits", "Se acabaron los créditos de IA de este mes.");
  }

  const mime = row.mimeType?.split(";")[0].trim() || "audio/ogg";
  const client = getAIProvider("google", apiKey);
  const result = await client.complete({
    model: picked.model,
    temperature: 0,
    maxTokens: 2000,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: [{ type: "audio_url", audio_url: { url: `data:${mime};base64,${buffer.toString("base64")}` } }] },
    ],
  });
  await recordAssistUsage({
    organizationId: row.organizationId,
    kind: "TRANSCRIBE",
    userId: opts.userId,
    provider: "google",
    model: picked.model,
    usage: result.usage,
  });

  const text = result.content.trim();
  if (!text) throw new TranscribeError("empty", "La IA no devolvió una transcripción.");
  const data = { transcript: text, transcribedAt: new Date() };
  if (kind === "whatsapp") await prisma.wAMessage.update({ where: { id: row.id }, data });
  else await prisma.channelMessage.update({ where: { id: row.id }, data });
  return text;
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
