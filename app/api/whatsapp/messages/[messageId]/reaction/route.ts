import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserAccountIds } from "@/lib/shared-accounts";
import { sendWhatsAppMessage } from "@/lib/whatsapp/send";
import { REACTION_OPTIONS, canReactToMessage } from "@/lib/whatsapp/reaction-options";
import { rateLimit } from "@/lib/rate-limit";
import { getRedisClient } from "@/lib/redis";
import { publicErrorMessage } from "@/lib/api-errors";

export async function POST(req: Request, { params }: { params: Promise<{ messageId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { messageId } = await params;
  const lockKey = `wa-reaction:${messageId}`;
  const lockToken = randomUUID();
  let locked = false;
  let operationId: string | undefined;
  try {
    const { emoji } = await req.json().catch(() => ({}));
    if (typeof emoji !== "string" || (emoji !== "" && !(REACTION_OPTIONS as readonly string[]).includes(emoji))) return NextResponse.json({ error: "Selecciona una reacción válida" }, { status: 400 });
    const message = await prisma.wAMessage.findFirst({ where: { id: messageId, chat: { accountId: { in: await getUserAccountIds(session.user.id) } } }, include: { chat: { include: { account: true } } } });
    if (!message) return NextResponse.json({ error: "Mensaje no encontrado" }, { status: 404 });
    if (!message.wamid || message.messageType === "reaction" || message.status === "failed" || !canReactToMessage(message.timestamp)) return NextResponse.json({ error: "Solo puedes reaccionar a mensajes enviados o recibidos en los últimos 30 días" }, { status: 400 });
    if (!(await rateLimit(`reaction:${session.user.id}`, 30, 60)).allowed) return NextResponse.json({ error: "Espera un momento antes de enviar más reacciones" }, { status: 429 });
    locked = (await getRedisClient().set(lockKey, lockToken, "PX", 60_000, "NX")) === "OK";
    if (!locked) return NextResponse.json({ error: "Ya se está actualizando la reacción de este mensaje" }, { status: 409 });
    const operation = await prisma.wAReaction.create({ data: { messageId, senderId: session.user.id, emoji } });
    operationId = operation.id;
    const result = await sendWhatsAppMessage(message.chat.account, { to: message.chat.remoteJid, type: "reaction", reactionMessageId: message.wamid, emoji });
    if (!result.wamid) throw new Error("WhatsApp no confirmó la recepción de la reacción");
    const reaction = await prisma.wAReaction.update({ where: { id: operation.id }, data: { wamid: result.wamid, status: "accepted" }, select: { id: true, emoji: true, status: true, error: true } });
    return NextResponse.json(reaction);
  } catch (error) {
    const message = publicErrorMessage(error, "No se pudo enviar la reacción");
    if (operationId) await prisma.wAReaction.update({ where: { id: operationId }, data: { status: "failed", error: message } });
    return NextResponse.json({ error: message }, { status: 400 });
  } finally {
    if (locked) await getRedisClient().eval("if redis.call('get',KEYS[1]) == ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end", 1, lockKey, lockToken);
  }
}
