import { createHmac } from "crypto";
import { decrypt } from "@/lib/crypto";

// Núcleo: compara la firma contra un secreto YA EN CLARO. Separado de
// validateMetaWebhookSignature() para consumidores que ya desencriptaron el
// secreto como parte de un blob más grande — ej. ChannelAccount.credentials
// de Messenger/Instagram, donde appSecret vive dentro del JSON encriptado
// (una sola capa de encrypt() sobre todo el blob), no en su propia columna
// encriptada como WAAccount.appSecret/MetaAdsAccount.appSecret.
export function compareMetaSignature(
  rawBody: string,
  signatureHeader: string | null,
  plainSecret: string | null | undefined
): boolean {
  if (!signatureHeader || !plainSecret) return false;
  try {
    const expected = createHmac("sha256", plainSecret).update(rawBody).digest("hex");
    const received = signatureHeader.replace("sha256=", "");
    return expected === received;
  } catch {
    return false;
  }
}

// Validación de x-hub-signature-256, común a los webhooks de Meta que
// guardan `appSecret` en su propia columna encriptada (WhatsApp `messages`,
// `leadgen`): el body debe pasarse como el string CRUDO leído con
// `req.text()`, nunca re-serializado vía JSON.stringify(JSON.parse(...)) —
// Meta firma el string exacto que manda, y re-serializar puede reordenar
// keys o cambiar espaciado, invalidando el HMAC. `encryptedAppSecret` llega
// tal cual está en la DB y se desencripta aquí, justo antes de usarlo.
export async function validateMetaWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  encryptedAppSecret: string | null
): Promise<boolean> {
  if (!signatureHeader || !encryptedAppSecret) return false;

  try {
    const secret = decrypt(encryptedAppSecret);
    return compareMetaSignature(rawBody, signatureHeader, secret);
  } catch {
    return false;
  }
}
