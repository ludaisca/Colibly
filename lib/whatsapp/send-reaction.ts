import { randomUUID } from "crypto";
import type { WAAccount, WAChat, WAMessage } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getRedisClient } from "@/lib/redis";
import { sendWhatsAppMessage } from "@/lib/whatsapp/send";
import { canReactToMessage } from "@/lib/whatsapp/reaction-options";
import { publicErrorMessage } from "@/lib/api-errors";

// Reacción del negocio a un mensaje de WhatsApp. Única ruta de envío para la
// bandeja (/api/whatsapp/messages/[id]/reaction) y la API pública
// (POST /api/v1/messages/{id}/reaction). Cada intento queda en WAReaction; el
// webhook de estados (applyReactionStatus) decide el emoji visible.

export class ReactionError extends Error {
  constructor(
    public readonly code: "not_reactable" | "busy",
    message: string
  ) {
    super(message);
  }
}

export const NOT_REACTABLE_MESSAGE = "Solo puedes reaccionar a mensajes enviados o recibidos en los últimos 30 días";

export function assertReactable(message: Pick<WAMessage, "wamid" | "messageType" | "status" | "timestamp">): asserts message is typeof message & { wamid: string } {
  if (!message.wamid || message.messageType === "reaction" || message.status === "failed" || !canReactToMessage(message.timestamp)) {
    throw new ReactionError("not_reactable", NOT_REACTABLE_MESSAGE);
  }
}

/** `emoji: ""` quita la reacción. Lanza ReactionError o el error de Meta. */
export async function reactToWhatsAppMessage(
  message: WAMessage & { chat: WAChat & { account: WAAccount } },
  emoji: string,
  senderId: string
): Promise<{ id: string; emoji: string; status: string; error: string | null }> {
  assertReactable(message);
  const lockKey = `wa-reaction:${message.id}`;
  const lockToken = randomUUID();
  const locked = (await getRedisClient().set(lockKey, lockToken, "PX", 60_000, "NX")) === "OK";
  if (!locked) throw new ReactionError("busy", "Ya se está actualizando la reacción de este mensaje");
  let operationId: string | undefined;
  try {
    const operation = await prisma.wAReaction.create({ data: { messageId: message.id, senderId, emoji } });
    operationId = operation.id;
    const result = await sendWhatsAppMessage(message.chat.account, { to: message.chat.remoteJid, type: "reaction", reactionMessageId: message.wamid, emoji });
    if (!result.wamid) throw new Error("WhatsApp no confirmó la recepción de la reacción");
    return await prisma.wAReaction.update({
      where: { id: operation.id },
      data: { wamid: result.wamid, status: "accepted" },
      select: { id: true, emoji: true, status: true, error: true },
    });
  } catch (err) {
    if (operationId) {
      // Mismo texto que veía la bandeja antes de compartir esta función.
      await prisma.wAReaction.update({ where: { id: operationId }, data: { status: "failed", error: publicErrorMessage(err, "No se pudo enviar la reacción") } }).catch(() => {});
    }
    throw err;
  } finally {
    await getRedisClient().eval("if redis.call('get',KEYS[1]) == ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end", 1, lockKey, lockToken);
  }
}
