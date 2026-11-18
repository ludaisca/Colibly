import { createHash, timingSafeEqual } from "crypto";
import { compareMetaSignature, validateMetaWebhookSignature } from "@/lib/meta/webhook-signature";
import { getPlatformSettings } from "@/lib/platform-settings";

// App de Meta de la PLATAFORMA (Embedded Signup y coexistencia). Los datos viven
// en PlatformSettings (se editan en /plataforma), no en variables de entorno.

export interface MetaPlatformApp {
  appId: string | null;
  appSecret: string | null;
  embeddedSignupConfigId: string | null;
  webhookVerifyToken: string | null;
}

export async function getMetaPlatformApp(): Promise<MetaPlatformApp> {
  const s = await getPlatformSettings();
  return {
    appId: s.metaAppId,
    appSecret: s.metaAppSecret,
    embeddedSignupConfigId: s.metaEmbeddedSignupConfigId,
    webhookVerifyToken: s.metaWebhookVerifyToken,
  };
}

// Compara dos cadenas en tiempo constante sin filtrar su longitud (se comparan
// los sha256, que siempre miden lo mismo).
export function safeEqualStrings(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

// El GET de suscripción del webhook trae el token que escribió el operador en
// Meta; solo coincide si hay uno configurado y es idéntico.
export function verifyTokenMatches(received: string, expected: string | null | undefined): boolean {
  if (!received || !expected) return false;
  return safeEqualStrings(received, expected);
}

export type WebhookSecretSource = "platform" | "account";

// Una cuenta conectada con Embedded Signup recibe webhooks firmados con el App
// Secret de la app de plataforma; una cuenta manual, con el secreto de la app
// propia del cliente que guardó al crearla.
export function webhookSecretSource(account: { connectionType: "MANUAL" | "EMBEDDED_SIGNUP" }): WebhookSecretSource {
  return account.connectionType === "EMBEDDED_SIGNUP" ? "platform" : "account";
}

export async function validateWhatsAppWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  account: { connectionType: "MANUAL" | "EMBEDDED_SIGNUP"; appSecret: string | null },
  getPlatformSecret: () => Promise<string | null> = async () => (await getPlatformSettings()).metaAppSecret
): Promise<boolean> {
  if (webhookSecretSource(account) === "platform") {
    return compareMetaSignature(rawBody, signatureHeader, await getPlatformSecret());
  }
  return validateMetaWebhookSignature(rawBody, signatureHeader, account.appSecret);
}
