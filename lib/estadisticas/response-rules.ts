// Tiempo de primera respuesta: definición de referencia (pura, probada). La
// consulta SQL de response-times.ts hace exactamente esto en la base.
//
// - Una conversación la inicia el cliente: un mensaje entrante en vivo (no
//   importado del historial) sin otra actividad de conversación en el chat en
//   las 24 h previas. Las campañas y avisos automáticos no son actividad de
//   conversación: si el cliente contesta a una campaña, ahí empieza.
// - Su primera respuesta es el primer saliente posterior que de verdad
//   responde: persona, bot, API, automatización o la app WhatsApp Business.
//   No cuentan campañas, fuentes de leads, secuencias, recuperación, avisos
//   del sistema ni historial importado.
// - Sin respuesta antes de la siguiente conversación = sin respuesta: no se
//   cuenta (ni como infinito ni "hasta ahora").
//
// Antes se medía de la creación del chat a la primera respuesta manual: un
// chat abierto por una campaña o importado del historial sumaba días de
// "espera" que nunca existieron, y las respuestas del bot no contaban.

export const SESSION_GAP_MINUTES = 24 * 60;

/** Orígenes de saliente que cuentan como respuesta (lib/messages/origin.ts). */
export const REPLY_ORIGINS = ["agent", "api", "automation", "bot", "business_app"] as const;

export interface ResponseMessage {
  at: Date;
  inbound: boolean;
  /** Importado del historial de la app (entrante o saliente). */
  history?: boolean;
  /** sentVia del saliente (null en filas anteriores a la columna). */
  sentVia?: string | null;
  /** Saliente de una campaña o de una fuente de leads. */
  campaign?: boolean;
  senderId?: string | null;
}

export interface ResponseSample {
  startedAt: Date;
  minutes: number;
  /** Persona de Colibly que respondió (null: bot, API, automatización, app). */
  responderId: string | null;
}

/** ¿El saliente responde de verdad? */
export function isReply(m: ResponseMessage): boolean {
  if (m.inbound || m.history || m.campaign) return false;
  return m.sentVia == null || (REPLY_ORIGINS as readonly string[]).includes(m.sentVia);
}

/** Muestras de primera respuesta de UN chat, para conversaciones iniciadas desde `since`. */
export function responseSamples(messages: ResponseMessage[], since: Date): ResponseSample[] {
  const conversational = messages
    .filter((m) => !m.history && (m.inbound || isReply(m)))
    .sort((a, b) => a.at.getTime() - b.at.getTime());
  const starts: number[] = [];
  conversational.forEach((m, i) => {
    if (!m.inbound) return;
    const prev = conversational[i - 1];
    if (!prev || m.at.getTime() - prev.at.getTime() > SESSION_GAP_MINUTES * 60_000) starts.push(i);
  });
  const out: ResponseSample[] = [];
  starts.forEach((startIndex, k) => {
    const start = conversational[startIndex];
    if (start.at < since) return;
    const end = k + 1 < starts.length ? starts[k + 1] : conversational.length;
    const reply = conversational.slice(startIndex + 1, end).find((m) => !m.inbound);
    if (!reply) return;
    out.push({ startedAt: start.at, minutes: (reply.at.getTime() - start.at.getTime()) / 60_000, responderId: reply.senderId ?? null });
  });
  return out;
}

export interface ResponseSummary {
  /** Valor principal: el promedio se dispara con pocos casos extremos. */
  medianMinutes: number | null;
  avgMinutes: number | null;
  /** Conversaciones con respuesta que entraron al cálculo. */
  count: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function summarizeResponses(minutes: number[]): ResponseSummary {
  if (minutes.length === 0) return { medianMinutes: null, avgMinutes: null, count: 0 };
  const sorted = [...minutes].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return {
    medianMinutes: round1(median),
    avgMinutes: round1(sorted.reduce((sum, value) => sum + value, 0) / sorted.length),
    count: sorted.length,
  };
}
