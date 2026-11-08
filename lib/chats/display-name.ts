// Nombre visible de un chat/contacto. Puro y seguro para cliente y servidor.
//
// El chat web identifica al visitante con un id aleatorio ("v_2mQMV22W5kQ…")
// que se guarda como nombre mientras no dé el suyo. Mostrarlo tal cual es
// ilegible: se reemplaza por "Visitante web · A3F2" (últimos 4 caracteres,
// estables, para distinguir a dos visitantes). Un nombre real nunca se toca.

const VISITOR_ID = /^v_[A-Za-z0-9_-]{12,}$/;
const VISITOR_PREFIX = "Visitante web · ";

export function isWebchatVisitorId(value: string | null | undefined): boolean {
  return !!value && VISITOR_ID.test(value);
}

export function visitorLabel(visitorId: string): string {
  const code = visitorId.replace(/[^A-Za-z0-9]/g, "").slice(-4).toUpperCase();
  return `${VISITOR_PREFIX}${code}`;
}

export function displayName(name: string | null | undefined, remoteJid: string | null | undefined, fallback = "Desconocido"): string {
  const trimmed = name?.trim() || null;
  if (trimmed && !isWebchatVisitorId(trimmed)) return trimmed;
  if (isWebchatVisitorId(trimmed)) return visitorLabel(trimmed!);
  if (isWebchatVisitorId(remoteJid)) return visitorLabel(remoteJid!);
  return remoteJid || fallback;
}


/**
 * ¿El nombre visible no dice nada de la persona? Un visitante del chat web o
 * solo un número. Ahí las iniciales ("VW", "52") no sirven para distinguir a
 * nadie y el avatar usa una figura (blobatar) en su lugar.
 */
export function isAnonymousDisplayName(displayed: string | null | undefined): boolean {
  if (!displayed) return true;
  const value = displayed.trim();
  return value.startsWith(VISITOR_PREFIX) || /^\+?[\d\s().-]{6,}$/.test(value) || isWebchatVisitorId(value);
}


/**
 * "Canal · Cuenta", sin repetir cuando la cuenta se llama como el canal
 * ("Telegram · Telegram" se leía como un error). Revisión 2026-11-07.
 */
export function channelAndAccount(channelLabel: string, accountName: string | null | undefined): string {
  const name = accountName?.trim();
  if (!name || name.toLowerCase() === channelLabel.toLowerCase()) return channelLabel;
  return `${channelLabel} · ${name}`;
}
