import type {ChatItem} from './types';
import {WAITING_WARN_MINUTES} from './waiting';

/**
 * La ÚNICA señal que cabe a la derecha de una fila de chat en el celular
 * (en escritorio hay espacio, pero en 360 px solo cabe una cosa).
 *
 * - waiting: el cliente espera respuesta  -> "1:12" en ámbar/rojo (Andén)
 * - unread:  mensajes sin leer             -> contador
 * - urgent:  prioridad URGENT              -> etiqueta "Urgente"
 * - time:    nada que atender              -> hora del último mensaje
 */
export type RowSignal =
  | {kind: 'waiting'; minutes: number}
  | {kind: 'unread'; count: number}
  | {kind: 'urgent'}
  | {kind: 'time'};

export function rowSignal(chat: ChatItem, now: Date): RowSignal {
  const waitingMinutes = chat.waitingSince
    ? Math.floor((now.getTime() - new Date(chat.waitingSince).getTime()) / 60_000)
    : null;

  // Precedencia inspirada en Intercom, Zendesk y Front:
  // 1. Lo resuelto no reclama atención: solo la hora.
  // 2. Una espera que ya cruzó el umbral (≥15 min) es como un SLA en riesgo
  //    y gana a todo: es lo que hace que "ningún chat se pierda".
  // 3. La prioridad URGENT va antes que el contador (Zendesk/Intercom ponen
  //    la prioridad junto al SLA; el contador es la señal más débil).
  // 4. Sin leer: el contador de siempre (hábito de WhatsApp).
  // 5. Espera corta ya leída pero sin responder: cifra gris discreta.
  if (chat.status === 'RESOLVED') return {kind: 'time'};
  if (waitingMinutes !== null && waitingMinutes >= WAITING_WARN_MINUTES) {
    return {kind: 'waiting', minutes: waitingMinutes};
  }
  if (chat.priority === 'URGENT') return {kind: 'urgent'};
  if (chat.unreadCount > 0) return {kind: 'unread', count: chat.unreadCount};
  if (waitingMinutes !== null) return {kind: 'waiting', minutes: waitingMinutes};
  return {kind: 'time'};

  // Decisión original (preguntas guía):
  //
  // Principio #1 de PRODUCT.md: "Ningún chat se pierde: lo que espera
  // respuesta, lo asignado y lo vencido se ve primero".
  //
  // Preguntas para decidir:
  // - Un chat URGENT que espera 2 min, ¿muestra "Urgente" o "0:02"?
  // - Un chat con 5 sin leer que espera 3 min: ¿el contador o la espera?
  //   (en WhatsApp la gente busca el contador verde por costumbre)
  // - ¿Una espera corta (< WAITING_WARN_MINUTES, en ./waiting) merece
  //   ocupar el lugar, o es ruido hasta que se vuelve ámbar?
  // - Un chat RESOLVED con waitingSince viejo, ¿debe mostrar espera?
}
