import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserAccountIds, getUserChannelAccountIds } from "@/lib/shared-accounts";
import { assertReactable, reactToWhatsAppMessage, ReactionError } from "@/lib/whatsapp/send-reaction";
import { setMessageReaction, telegramReactionEmoji } from "@/lib/telegram";
import { REACTION_OPTIONS, canReactToMessage } from "@/lib/whatsapp/reaction-options";
import { rateLimit } from "@/lib/rate-limit";
import { publicErrorMessage } from "@/lib/api-errors";
import { decrypt } from "@/lib/crypto";

async function reactOnTelegram(userId: string, messageId: string, emoji: string) {
  const message = await prisma.channelMessage.findFirst({
    where: { id: messageId, conversation: { channelAccount: { channel: "TELEGRAM", id: { in: await getUserChannelAccountIds(userId) } } } },
    include: { conversation: { include: { channelAccount: true } } },
  });
  if (!message?.externalMessageId || !/^\d+$/.test(message.externalMessageId) || !canReactToMessage(message.timestamp)) {
    return NextResponse.json({ error: message ? "Solo puedes reaccionar a mensajes enviados o recibidos en los últimos 30 días" : "Mensaje no encontrado" }, { status: message ? 400 : 404 });
  }
  if (!(await rateLimit(`reaction:${userId}`, 30, 60)).allowed) return NextResponse.json({ error: "Espera un momento antes de enviar más reacciones" }, { status: 429 });
  const { botToken } = JSON.parse(decrypt(message.conversation.channelAccount.credentials)) as { botToken: string };
  await setMessageReaction(botToken, message.conversation.externalId, message.externalMessageId, emoji);
  const stored = emoji ? telegramReactionEmoji(emoji) : null;
  await prisma.channelMessage.update({ where: { id: message.id }, data: { agentReactionEmoji: stored } });
  return NextResponse.json({ id: message.id, emoji: stored ?? "", status: "accepted", error: null });
}

export async function POST(req: Request, { params }: { params: Promise<{ messageId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { messageId } = await params;
  try {
    const { emoji } = await req.json().catch(() => ({}));
    if (typeof emoji !== "string" || (emoji !== "" && !(REACTION_OPTIONS as readonly string[]).includes(emoji))) return NextResponse.json({ error: "Selecciona una reacción válida" }, { status: 400 });
    const message = await prisma.wAMessage.findFirst({ where: { id: messageId, chat: { accountId: { in: await getUserAccountIds(session.user.id) } } }, include: { chat: { include: { account: true } } } });
    if (!message) return reactOnTelegram(session.user.id, messageId, emoji);
    assertReactable(message);
    if (!(await rateLimit(`reaction:${session.user.id}`, 30, 60)).allowed) return NextResponse.json({ error: "Espera un momento antes de enviar más reacciones" }, { status: 429 });
    return NextResponse.json(await reactToWhatsAppMessage(message, emoji, session.user.id));
  } catch (error) {
    if (error instanceof ReactionError) return NextResponse.json({ error: error.message }, { status: error.code === "busy" ? 409 : 400 });
    return NextResponse.json({ error: publicErrorMessage(error, "No se pudo enviar la reacción") }, { status: 400 });
  }
}
