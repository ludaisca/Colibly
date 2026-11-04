import { randomBytes } from "node:crypto";
import { emitMessageSent } from "@/lib/events/message-sent";
import { appUrl } from "@/lib/app-url";
import { prisma } from "@/lib/prisma";
import { sendWhatsAppMessage } from "@/lib/whatsapp/send";
import { isWithinServiceWindow } from "@/lib/whatsapp/lead-recovery";

// Envía la encuesta una sola vez por chat, al resolverlo. Si Meta no acepta el
// mensaje (ventana cerrada, cuenta sin credenciales, plan de solo lectura) se
// borra la fila para que un reintento futuro pueda crear otra.
export async function maybeSendCsat(chatId: string): Promise<boolean> {
  const chat = await prisma.wAChat.findUnique({
    where: { id: chatId },
    include: { account: true },
  });
  if (!chat || !chat.contactId || !chat.account.csatEnabled) return false;

  const existing = await prisma.csatResponse.findUnique({ where: { chatId }, select: { id: true } });
  if (existing) return false;

  const lastInbound = await prisma.wAMessage.findFirst({
    where: { chatId, direction: "INBOUND" },
    orderBy: { timestamp: "desc" },
    select: { timestamp: true },
  });
  if (!lastInbound || !isWithinServiceWindow(lastInbound.timestamp, new Date())) return false;

  const token = randomBytes(24).toString("base64url");
  const survey = await prisma.csatResponse.create({
    data: {
      accountId: chat.accountId,
      chatId: chat.id,
      contactId: chat.contactId,
      assignedToId: chat.assignedToId,
      token,
    },
    select: { id: true },
  });

  try {
    const body = `Hola, ¿cómo calificarías la atención que recibiste? Tu opinión nos ayuda a mejorar: ${appUrl(`/csat/${token}`)}`;
    const sent = await sendWhatsAppMessage(chat.account, {
      to: chat.remoteJid,
      type: "text",
      body,
    });

    const [saved] = await prisma.$transaction([
      prisma.wAMessage.create({
        data: {
          chatId: chat.id,
          direction: "OUTBOUND",
          sentVia: "system",
          messageType: "text",
          body,
          status: "sent",
          wamid: sent.wamid,
          timestamp: new Date(),
        },
        select: { id: true },
      }),
      prisma.wAChat.update({
        where: { id: chat.id },
        data: { lastMessage: body.slice(0, 500), lastMessageAt: new Date() },
      }),
      prisma.csatResponse.update({
        where: { id: survey.id },
        data: { sentAt: new Date() },
      }),
    ]);
    await emitMessageSent("whatsapp", saved.id, "system");

    return true;
  } catch (error) {
    await prisma.csatResponse.delete({ where: { id: survey.id } }).catch(() => {});
    throw error;
  }
}
