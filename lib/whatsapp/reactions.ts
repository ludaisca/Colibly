import { prisma } from "@/lib/prisma";

// Las confirmaciones de una reacción nunca modifican el estado del mensaje
// original. Solo la última operación del equipo cambia el emoji visible.
export async function applyReactionStatus(accountId: string, wamid: string, status: string) {
  if (!["sent", "delivered", "read", "failed"].includes(status)) return;
  await prisma.$transaction(async (tx) => {
    const reaction = await tx.wAReaction.findFirst({ where: { wamid, message: { chat: { accountId } } } });
    if (!reaction) return;
    const next = status === "failed" ? "failed" : "sent";
    if (reaction.status === "failed" || reaction.status === next) return;
    await tx.wAReaction.update({ where: { id: reaction.id }, data: { status: next, error: next === "failed" ? "WhatsApp rechazó la reacción. Puedes volver a intentarlo." : null } });
    const latest = await tx.wAReaction.findFirst({ where: { messageId: reaction.messageId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
    if (latest?.id !== reaction.id) return;
    const previous = next === "failed" ? await tx.wAReaction.findFirst({ where: { messageId: reaction.messageId, status: "sent" }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] }) : null;
    await tx.wAMessage.update({ where: { id: reaction.messageId }, data: { agentReactionEmoji: (next === "sent" ? reaction.emoji : previous?.emoji) || null } });
  });
}
