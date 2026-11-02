import { displayName } from "@/lib/chats/display-name";

// Presentación de las notificaciones de la campana. Puro (tests en
// lib/notifications/__tests__/present.test.ts).

const CHAT_LINK = /^\/whatsapp\/chat\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)(?:[/?#]|$)/;

/** accountId y chatId del enlace `/whatsapp/chat/<cuenta>/<chat>`; null si el enlace es otro. */
export function chatRefFromLink(link: string | null | undefined): { accountId: string; chatId: string } | null {
  const match = link ? CHAT_LINK.exec(link) : null;
  return match ? { accountId: match[1], chatId: match[2] } : null;
}

/**
 * Las notificaciones antiguas guardaron el id del visitante del chat web
 * ("v_oW3a7o6…") como título o cuerpo. Solo ese caso cambia: un texto
 * normal se devuelve igual.
 */
export function readableNotificationText<T extends string | null>(text: T): T {
  if (!text) return text;
  return displayName(text, null, text) as T;
}

export type NotificationGroup = "Hoy" | "Ayer" | "Anteriores";

/** Hoy / Ayer / Anteriores en la hora local de quien mira (es su día). */
export function notificationGroup(iso: string, now: Date): NotificationGroup {
  const day = new Date(iso);
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const t = day.getTime();
  if (t >= startToday) return "Hoy";
  const startYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime();
  return t >= startYesterday ? "Ayer" : "Anteriores";
}
