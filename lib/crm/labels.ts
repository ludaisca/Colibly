// Textos de la interfaz para valores guardados como códigos (módulo sin
// dependencias de servidor: lo importan componentes de cliente y pruebas).

const SOURCE_LABELS: Record<string, string> = {
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  messenger: "Messenger",
  instagram: "Instagram",
  webchat: "Chat web",
  manual: "Alta manual",
  import: "Importación",
  api: "API",
  lead_ads: "Anuncio",
  inbound: "Mensaje entrante",
};

// Cómo llegó una persona ("whatsapp" → "WhatsApp"); un valor desconocido se
// muestra tal cual.
export function sourceLabel(source: string | null | undefined): string {
  if (!source) return "—";
  return SOURCE_LABELS[source] ?? source;
}
