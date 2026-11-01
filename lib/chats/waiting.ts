import { prisma } from "@/lib/prisma";

// "Esperando respuesta" (Chatwoot lo llama waiting_since / Desatendido).
//
// WAChat.waitingSince / Conversation.waitingSince guardan desde cuándo el
// cliente espera: lo pone el ingest con el primer mensaje entrante sin
// contestar y lo limpia la respuesta de una persona, del bot de IA o de una
// automatización conversacional. Los avisos automáticos (fuera de horario,
// CSAT, auto-resolver, campañas, secuencias, recuperación) NO lo limpian:
// un chat que solo recibió el aviso de fuera de horario sigue esperando a la
// mañana siguiente. Resolver el chat también lo limpia.
//
// Cualquier camino nuevo que conteste a un cliente debe llamar markReplied();
// lib/chats/__tests__/waiting.test.ts falla si alguien quita una de
// las llamadas existentes.

export type ChatKind = "whatsapp" | "channel";

export { WAITING_WARN_MINUTES, WAITING_DANGER_MINUTES, waitingTone, waitingLabel, type WaitingTone } from "./waiting-shared";

/**
 * Marca que el cliente espera respuesta desde `at`. Si ya esperaba, conserva
 * la marca más antigua (updateMany condicionado a null). Nunca lanza: el
 * mensaje entrante ya está guardado y esto es solo un indicador.
 */
export async function markWaiting(kind: ChatKind, chatId: string, at: Date): Promise<void> {
  try {
    if (kind === "whatsapp") {
      await prisma.wAChat.updateMany({ where: { id: chatId, waitingSince: null }, data: { waitingSince: at } });
    } else {
      await prisma.conversation.updateMany({ where: { id: chatId, waitingSince: null }, data: { waitingSince: at } });
    }
  } catch (error) {
    console.error(`[waiting] no se pudo marcar la espera de ${kind}:${chatId}`, error);
  }
}

/** El chat ya recibió respuesta (persona, bot o flujo). Nunca lanza. */
export async function markReplied(kind: ChatKind, chatId: string): Promise<void> {
  try {
    if (kind === "whatsapp") {
      await prisma.wAChat.updateMany({ where: { id: chatId, waitingSince: { not: null } }, data: { waitingSince: null } });
    } else {
      await prisma.conversation.updateMany({ where: { id: chatId, waitingSince: { not: null } }, data: { waitingSince: null } });
    }
  } catch (error) {
    console.error(`[waiting] no se pudo limpiar la espera de ${kind}:${chatId}`, error);
  }
}
