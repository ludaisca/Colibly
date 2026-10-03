// La interfaz puede abrirse en un host local mientras Meta necesita una URL
// pública distinta para el webhook. En producción APP_URL sigue siendo el
// origen canónico; el override se usa solo para pruebas con túnel.
export function whatsappWebhookUrl(requestUrl: string): string {
  const origin = process.env.WHATSAPP_WEBHOOK_BASE_URL || process.env.APP_URL || new URL(requestUrl).origin;
  const url = new URL("/api/whatsapp/webhook", origin);
  if (process.env.WHATSAPP_WEBHOOK_BASE_URL && url.protocol !== "https:") {
    throw new Error("WHATSAPP_WEBHOOK_BASE_URL debe usar HTTPS");
  }
  return url.toString();
}
