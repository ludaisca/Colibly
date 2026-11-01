// Nombre visible de un chat/contacto. Puro y seguro para cliente y servidor.
//
// El chat web identifica al visitante con un id aleatorio ("v_2mQMV22W5kQ…")
// que se guarda como nombre mientras no dé el suyo. Mostrarlo tal cual es
// ilegible: se reemplaza por "Visitante web · A3F2" (últimos 4 caracteres,
// estables, para distinguir a dos visitantes). Un nombre real nunca se toca.

const VISITOR_ID = /^v_[A-Za-z0-9_-]{12,}$/;

export function isWebchatVisitorId(value: string | null | undefined): boolean {
  return !!value && VISITOR_ID.test(value);
}

export function visitorLabel(visitorId: string): string {
  const code = visitorId.replace(/[^A-Za-z0-9]/g, "").slice(-4).toUpperCase();
  return `Visitante web · ${code}`;
}

export function displayName(name: string | null | undefined, remoteJid: string | null | undefined, fallback = "Desconocido"): string {
  const trimmed = name?.trim() || null;
  if (trimmed && !isWebchatVisitorId(trimmed)) return trimmed;
  if (isWebchatVisitorId(trimmed)) return visitorLabel(trimmed!);
  if (isWebchatVisitorId(remoteJid)) return visitorLabel(remoteJid!);
  return remoteJid || fallback;
}
