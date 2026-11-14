import type { WACall } from "@prisma/client";
import { emitDomainEvent } from "@/lib/events/emit";

// Eventos call.* (webhooks salientes y API). Los emiten el webhook de Meta
// (ingest.ts) y las acciones de la bandeja (contestar, rechazar, colgar,
// marcar), cada una en el único punto donde cambia el estado. Nunca lanzan.

type CallRow = Pick<WACall, "id" | "accountId" | "chatId" | "contactId" | "direction" | "peerWaId">;
export type CallOutcome = "ENDED" | "MISSED" | "REJECTED" | "FAILED";

function refs(row: CallRow) {
  return {
    account: { kind: "whatsapp" as const, id: row.accountId },
    contactId: row.contactId,
    chat: row.chatId ? { kind: "whatsapp" as const, id: row.chatId } : null,
  };
}

function base(row: CallRow) {
  return { callId: row.id, direction: row.direction === "USER_INITIATED" ? ("inbound" as const) : ("outbound" as const), phone: row.peerWaId };
}

export async function emitCallRinging(row: CallRow): Promise<void> {
  await emitDomainEvent({ type: "call.ringing", ...refs(row), data: base(row) });
}

export async function emitCallAnswered(row: CallRow & Pick<WACall, "answeredById">): Promise<void> {
  await emitDomainEvent({ type: "call.answered", ...refs(row), data: { ...base(row), answeredById: row.answeredById } });
}

export async function emitCallEnded(row: CallRow & Pick<WACall, "startedAt" | "endedAt">, outcome: CallOutcome, durationSeconds: number | null): Promise<void> {
  await emitDomainEvent({
    type: "call.ended",
    ...refs(row),
    data: { ...base(row), outcome, durationSeconds, startedAt: row.startedAt?.toISOString() ?? null, endedAt: row.endedAt?.toISOString() ?? null },
  });
}
