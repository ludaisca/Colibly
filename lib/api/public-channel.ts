// WhatsApp por QR (WHATSAPP_WEB, GoWA) es un canal oculto: hacia afuera (API
// pública v1 y webhooks salientes) se presenta con la misma capa que el resto
// de WhatsApp en Colibly — `channel: "WHATSAPP"` y el número como teléfono —,
// sin un valor nuevo en el contrato. No documentarlo (docs/arquitectura/canales.md).

export function publicChannel<T extends string | null>(channel: T): T | "WHATSAPP" {
  return channel === "WHATSAPP_WEB" ? "WHATSAPP" : channel;
}

/** Cuentas/contactos que hacia afuera son "WhatsApp" (Meta o QR). */
export function isPublicWhatsapp(opts: { waAccountId?: string | null; channel?: string | null }): boolean {
  return !!opts.waAccountId || opts.channel === "WHATSAPP_WEB";
}

/** Teléfono a partir del remoteJid: el wa_id de Meta ya son dígitos; el de QR es un JID. */
export function publicPhone(remoteJid: string): string {
  return remoteJid.includes("@") ? remoteJid.split("@")[0] : remoteJid;
}
