import type { ChannelAccount } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { readGowaCredentials, encryptGowaCredentials } from "./account";
import { deleteDevice, getDevice, getDeviceStatus, isGowaConfigured, logoutDevice } from "./client";

/**
 * Cierra la sesión de WhatsApp y borra el device de GoWA. Best effort: nunca
 * lanza (borrar una cuenta o una organización no puede quedarse a medias
 * porque GoWA no respondió).
 */
export async function releaseGowaDevice(account: Pick<ChannelAccount, "id" | "credentials">): Promise<void> {
  if (!isGowaConfigured()) return;
  let deviceId: string;
  try {
    deviceId = readGowaCredentials(account).deviceId;
  } catch {
    return;
  }
  if (!deviceId) return;
  await logoutDevice(deviceId).catch(() => undefined);
  await deleteDevice(deviceId).catch((err) =>
    console.warn(`[gowa] No se pudo borrar el device de la cuenta ${account.id}:`, err instanceof Error ? err.message : err)
  );
}

/** Todas las cuentas WHATSAPP_WEB de una organización (borrado de la organización). */
export async function releaseOrgGowaDevices(organizationId: string): Promise<void> {
  const accounts = await prisma.channelAccount.findMany({
    where: { organizationId, channel: "WHATSAPP_WEB" },
    select: { id: true, credentials: true },
  });
  for (const account of accounts) await releaseGowaDevice(account);
}

export type GowaLinkState =
  | { status: "CONNECTED"; phone: string | null; displayName: string | null }
  | { status: "PENDING" };

/**
 * Consulta GoWA y, si el número ya quedó vinculado, deja la cuenta CONNECTED
 * con su número (externalAccountId: un mismo número no puede estar en dos
 * cuentas, @@unique([channel, externalAccountId])).
 */
export async function syncGowaLink(account: ChannelAccount): Promise<GowaLinkState> {
  const creds = readGowaCredentials(account);
  const status = await getDeviceStatus(creds.deviceId);
  if (!status.isLoggedIn) return { status: "PENDING" };
  const device = await getDevice(creds.deviceId).catch(() => null);
  const jid = device?.jid?.replace(/:\d+(?=@)/, "") ?? null;
  const phone = device?.phone_number || (jid ? jid.split("@")[0] : null);
  if (account.status !== "CONNECTED" || account.externalAccountId !== phone) {
    await prisma.channelAccount.update({
      where: { id: account.id },
      data: {
        status: "CONNECTED",
        errorMessage: null,
        externalAccountId: phone,
        lastActivity: new Date(),
        credentials: encryptGowaCredentials({ ...creds, phone, jid }),
      },
    });
  }
  return { status: "CONNECTED", phone, displayName: device?.display_name ?? null };
}
