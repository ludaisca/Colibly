// Rendimiento del bot de IA (F1). Puro: clasifica cada chat atendido por el bot
// a partir de lo que la consulta SQL ya calculó, y agrega los totales.
//
// - Chat con bot: hubo al menos una respuesta del bot (WABotUsage) en el periodo.
// - Traspaso: después de la primera respuesta del bot en el periodo, una
//   persona escribió en el chat (OUTBOUND con senderId).
// - Resuelto sin humano: el chat está resuelto y nunca hubo traspaso.
// - Abierto: ni resuelto ni traspasado (el bot sigue atendiendo o nadie cerró).

export type BotChatOutcome = "resolved_by_bot" | "handed_off" | "open";

export interface BotChatRow {
  botReplies: number;
  resolved: boolean;
  humanAfterBot: boolean;
  /** Calificación CSAT del chat (1–5), si respondió la encuesta. */
  csat: number | null;
}

export function classifyBotChat(row: Pick<BotChatRow, "resolved" | "humanAfterBot">): BotChatOutcome {
  if (row.humanAfterBot) return "handed_off";
  if (row.resolved) return "resolved_by_bot";
  return "open";
}

export interface BotPerformance {
  chats: number;
  botReplies: number;
  resolvedByBot: number;
  handedOff: number;
  open: number;
  /** Porcentajes sobre los chats con bot (enteros), null sin chats. */
  resolvedByBotPct: number | null;
  handedOffPct: number | null;
  csatBotOnly: { avg: number | null; responses: number };
  csatHandedOff: { avg: number | null; responses: number };
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

export function summarizeBotPerformance(rows: BotChatRow[]): BotPerformance {
  let resolvedByBot = 0;
  let handedOff = 0;
  let open = 0;
  let botReplies = 0;
  const csatBot: number[] = [];
  const csatHuman: number[] = [];
  for (const row of rows) {
    botReplies += row.botReplies;
    const outcome = classifyBotChat(row);
    if (outcome === "resolved_by_bot") resolvedByBot++;
    else if (outcome === "handed_off") handedOff++;
    else open++;
    if (row.csat !== null) (outcome === "handed_off" ? csatHuman : csatBot).push(row.csat);
  }
  const pct = (n: number) => (rows.length ? Math.round((n / rows.length) * 100) : null);
  return {
    chats: rows.length,
    botReplies,
    resolvedByBot,
    handedOff,
    open,
    resolvedByBotPct: pct(resolvedByBot),
    handedOffPct: pct(handedOff),
    csatBotOnly: { avg: avg(csatBot), responses: csatBot.length },
    csatHandedOff: { avg: avg(csatHuman), responses: csatHuman.length },
  };
}
