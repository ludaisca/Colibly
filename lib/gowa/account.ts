import type { ChannelAccount } from "@prisma/client";
import { randomBytes } from "crypto";
import { decrypt, encrypt } from "@/lib/crypto";

// Credenciales cifradas de una cuenta WHATSAPP_WEB: el device de GoWA que la
// representa y el secreto HMAC con el que GoWA firma SU webhook (uno por
// cuenta, igual que el secret_token de Telegram).
export interface GowaCredentials {
  deviceId: string;
  webhookSecret: string;
  // Número y JID vinculados; se llenan cuando el QR se escanea.
  phone?: string | null;
  jid?: string | null;
}

export function readGowaCredentials(account: Pick<ChannelAccount, "credentials">): GowaCredentials {
  return JSON.parse(decrypt(account.credentials)) as GowaCredentials;
}

export function encryptGowaCredentials(creds: GowaCredentials): string {
  return encrypt(JSON.stringify(creds));
}

export function newGowaCredentials(accountSeed: string): GowaCredentials {
  // El device id es opaco y no revela la organización ni el usuario.
  return { deviceId: `c-${accountSeed}-${randomBytes(4).toString("hex")}`, webhookSecret: randomBytes(32).toString("hex") };
}

/**
 * URL a la que GoWA manda los eventos de esta cuenta. Por la red interna del
 * compose (http://app:5000): GoWA y la app viven juntos, el webhook nunca sale
 * a internet.
 */
export function gowaWebhookUrl(accountId: string): string {
  const base = (process.env.GOWA_WEBHOOK_BASE_URL || "http://app:5000").replace(/\/$/, "");
  return `${base}/api/gowa/webhook/${accountId}`;
}
