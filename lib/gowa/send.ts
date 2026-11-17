import type { ChannelAccount } from "@prisma/client";
import { assertOrgCanSend } from "@/lib/billing/gates";
import { isChannelEnabled } from "@/lib/channel-flags";
import { readGowaCredentials } from "./account";
import { sendText, sendMedia, type GowaMediaKind } from "./client";

// Remitente de WhatsApp por QR — paralelo a lib/telegram/send.ts. Además del
// candado de facturación, aquí se aplica el interruptor del operador: con el
// canal apagado para la organización NO sale nada (a diferencia de los demás
// canales, donde apagarlo solo impide conectar cuentas nuevas).
export class GowaChannelDisabledError extends Error {
  readonly code = "channel_disabled";
  constructor() {
    super("WhatsApp por QR está desactivado para tu organización");
  }
}

async function assertCanSend(account: ChannelAccount): Promise<void> {
  await assertOrgCanSend(account.organizationId);
  if (!(await isChannelEnabled(account.organizationId, "WHATSAPP_WEB"))) throw new GowaChannelDisabledError();
}

export async function sendGowaMessage(
  account: ChannelAccount,
  params: { to: string; body: string; replyToMessageId?: string }
): Promise<{ externalMessageId: string | null }> {
  await assertCanSend(account);
  const { deviceId } = readGowaCredentials(account);
  const id = await sendText(deviceId, { to: params.to, body: params.body, replyToId: params.replyToMessageId });
  return { externalMessageId: id };
}

export async function sendGowaMedia(
  account: ChannelAccount,
  params: {
    to: string;
    type: GowaMediaKind;
    buffer: Buffer;
    filename: string;
    mimeType: string;
    caption?: string;
    replyToMessageId?: string;
  }
): Promise<{ externalMessageId: string | null }> {
  await assertCanSend(account);
  const { deviceId } = readGowaCredentials(account);
  const id = await sendMedia(deviceId, {
    to: params.to,
    kind: params.type,
    buffer: params.buffer,
    filename: params.filename,
    mimeType: params.mimeType,
    caption: params.caption,
    replyToId: params.replyToMessageId,
  });
  return { externalMessageId: id };
}

// Opciones (botones/lista de una automatización o de la API): WhatsApp por QR
// no tiene botones fiables, así que van numeradas en el texto — mismo criterio
// que la respuesta privada de Messenger.
export async function sendGowaOptions(
  account: ChannelAccount,
  params: { to: string; body: string; options: { id: string; title: string }[] }
): Promise<{ externalMessageId: string | null }> {
  const withMenu = `${params.body}\n\n${params.options.map((o, i) => `${i + 1}. ${o.title}`).join("\n")}`;
  return sendGowaMessage(account, { to: params.to, body: withMenu });
}
