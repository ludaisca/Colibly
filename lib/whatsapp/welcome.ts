import type { WAAccount } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { inboxQueue } from "@/lib/queue";
import { isOrgWritable } from "@/lib/billing/gates";
import { OutboundError, sendOutbound } from "@/lib/messaging/outbound";
import { setMetaWelcomeMessage } from "@/lib/whatsapp/account-admin";

// Mensaje de bienvenida de WhatsApp. Con `enable_welcome_message` activo en
// Meta, cuando alguien abre el chat con el número por PRIMERA vez (sin haber
// escrito), Meta manda un mensaje `request_welcome`. La ingesta lo guarda como
// aviso (no lo atienden el bot, las automatizaciones ni el aviso fuera de
// horario, y no pone el chat en "esperando respuesta"), emite
// conversation.welcome_requested y encola este job, que contesta con el texto
// de la cuenta. Sin texto, el saludo queda en manos de un integrador.

export const WELCOME_TYPE = "request_welcome";
export const WELCOME_BODY = "👋 Abrió el chat por primera vez";
export const WELCOME_TEXT_MAX = 1024;

export interface WelcomeJob {
  chatId: string;
}

export async function queueWelcomeMessage(chatId: string): Promise<void> {
  try {
    // jobId por chat: una entrega repetida de Meta no saluda dos veces.
    await inboxQueue.add("welcome-message", { chatId } satisfies WelcomeJob, { jobId: `welcome-${chatId}` });
  } catch (error) {
    console.error(`[welcome] no se pudo encolar el saludo para ${chatId}`, error);
  }
}

/** Por qué no se manda el saludo (null = se manda). Pura. */
export function welcomeSkipReason(input: { enabled: boolean; text: string | null; alreadyAnswered: boolean; writable: boolean }): string | null {
  if (!input.enabled) return "disabled";
  if (!input.text?.trim()) return "no_text";
  if (input.alreadyAnswered) return "answered";
  if (!input.writable) return "read_only";
  return null;
}

export async function processWelcomeJob(job: WelcomeJob): Promise<"sent" | string> {
  const chat = await prisma.wAChat.findUnique({ where: { id: job.chatId }, include: { account: true } });
  if (!chat) return "missing";
  // Alguien (persona, API, bot) ya le escribió: no se saluda encima.
  const outbound = await prisma.wAMessage.findFirst({ where: { chatId: chat.id, direction: "OUTBOUND" }, select: { id: true } });
  const reason = welcomeSkipReason({
    enabled: chat.account.welcomeMessageEnabled,
    text: chat.account.welcomeMessageText,
    alreadyAnswered: !!outbound,
    writable: await isOrgWritable(chat.account.organizationId),
  });
  if (reason) return reason;
  try {
    await sendOutbound({ kind: "whatsapp", chat }, { type: "text", text: chat.account.welcomeMessageText!.trim() }, { source: "automation", countsAsReply: false });
    return "sent";
  } catch (error) {
    if (error instanceof OutboundError) return `outbound_${error.code}`;
    throw error;
  }
}

export class WelcomeConfigError extends Error {}

/**
 * Activa o apaga el saludo: primero en Meta (si falla, no se guarda nada) y
 * luego en Colibly. `text` undefined = se conserva el actual; null lo borra.
 * Lo usan la ficha de la cuenta y la API pública.
 */
export async function configureWelcomeMessage(
  account: WAAccount,
  input: { enabled: boolean; text?: string | null }
): Promise<{ enabled: boolean; text: string | null }> {
  const text = input.text === undefined ? account.welcomeMessageText : input.text?.trim() || null;
  if (text && text.length > WELCOME_TEXT_MAX) throw new WelcomeConfigError(`El mensaje de bienvenida admite máximo ${WELCOME_TEXT_MAX} caracteres`);
  if (account.channel !== "META_CLOUD" || !account.phoneNumberId || !account.accessToken) {
    throw new WelcomeConfigError("La cuenta no está conectada a WhatsApp Cloud API");
  }
  if (input.enabled !== account.welcomeMessageEnabled) await setMetaWelcomeMessage(account, input.enabled);
  const saved = await prisma.wAAccount.update({
    where: { id: account.id },
    data: { welcomeMessageEnabled: input.enabled, welcomeMessageText: text },
    select: { welcomeMessageEnabled: true, welcomeMessageText: true },
  });
  return { enabled: saved.welcomeMessageEnabled, text: saved.welcomeMessageText };
}
