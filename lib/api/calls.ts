import type { Prisma } from "@prisma/client";

// Forma pública de una llamada de WhatsApp (GET /calls). La grabación y la
// transcripción también quedan en el chat como mensajes.

export const API_CALL_SELECT = {
  id: true,
  accountId: true,
  chatId: true,
  contactId: true,
  direction: true,
  status: true,
  peerWaId: true,
  peerName: true,
  answeredById: true,
  startedAt: true,
  endedAt: true,
  durationSeconds: true,
  transcript: true,
  recordingPath: true,
  createdAt: true,
} satisfies Prisma.WACallSelect;

type CallRow = Prisma.WACallGetPayload<{ select: typeof API_CALL_SELECT }>;

export function serializeCall(c: CallRow) {
  return {
    id: c.id,
    accountId: c.accountId,
    conversationId: c.chatId,
    contactId: c.contactId,
    direction: c.direction === "USER_INITIATED" ? "inbound" : "outbound",
    // RINGING, CONNECTING, ACTIVE (en curso) o ENDED, MISSED, REJECTED, FAILED.
    status: c.status,
    phone: c.peerWaId,
    name: c.peerName,
    answeredById: c.answeredById,
    startedAt: c.startedAt,
    endedAt: c.endedAt,
    durationSeconds: c.durationSeconds,
    hasRecording: !!c.recordingPath,
    transcript: c.transcript,
    createdAt: c.createdAt,
  };
}
